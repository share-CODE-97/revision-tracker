/* ============================================================================
 * revision.js — Individual subject page
 * ----------------------------------------------------------------------------
 * Everything that only matters once the user is INSIDE a subject:
 *   • loadSubjectPage()  — populate title, badge, count, iframe content
 *   • Schedule option selector (24h / 48h / custom)
 *   • handleComplete()   — record a completion + schedule the next one
 *   • handleUndo()       — one-level undo of the last completion
 *   • Subject ⋮ modal    — per-subject history + full comment CRUD
 * ==========================================================================*/

/* ==========================================================================
 * 1. LOAD THE SUBJECT PAGE
 * ==========================================================================*/

/**
 * Populate the subject view for the given id and reset transient UI state.
 * The revision HTML file is loaded into an <iframe> using the `page` field
 * from REVISIONS — that's why every manifest entry must have a valid path.
 */
/* ==========================================================================
 * 1b. AUTO-SIZE THE REVISION IFRAME
 * --------------------------------------------------------------------------
 * By default the <iframe> has its own scrollbar AND the outer page has its
 * own — that's the "two scrollbars" problem. To fix it we grow the iframe
 * so it exactly fits its content height, leaving the outer page to handle
 * ALL scrolling.
 *
 * Works whenever the iframe is same-origin (which is the normal case for
 * revision/*.html). If browser security blocks access (some file:// setups),
 * we fall back to a fixed height silently.
 * ==========================================================================*/

/* ==========================================================================
 * 1c. LISTEN FOR THE REVISION PAGE'S SELF-REPORTED HEIGHT
 * --------------------------------------------------------------------------
 * Every revision/*.html file sends us a postMessage with its own height
 * whenever it loads or its content changes size. We resize the iframe to
 * match, so the iframe never needs its own scrollbar — the outer page
 * handles all scrolling, and the iframe height always fits the content.
 * ==========================================================================*/
window.addEventListener('message', function (event) {
  const msg = event.data;
  if (!msg || msg.type !== 'revision-height') return;

  const iframe = document.getElementById('subjectIframe');
  if (!iframe) return;

  // NOTE: We deliberately do NOT check event.source on file:// — Chrome
  // returns a fresh window proxy per access for cross-origin frames, so a
  // strict identity check can fail even when the message IS from our frame.

  clearTimeout(iframe._fallbackTimer);

  const h = Number(msg.height) || 0;
  if (h > 0) iframe.style.height = Math.max(h, 320) + 'px';
});


function autoSizeIframe(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc || !doc.body) return;

    // Reset to auto so the iframe can SHRINK too, then measure.
    iframe.style.height = 'auto';
    const h = Math.max(
      doc.documentElement.scrollHeight,
      doc.body.scrollHeight
    );
    iframe.style.height = Math.max(h, 320) + 'px';
  } catch (e) {
    // Cross-origin (file:// in Chrome, or a strict CSP) — we can't read the
    // content, so we can't measure it. Use a generous fixed height so most
    // revision pages fit without needing a scrollbar. Since the iframe has
    // scrolling="no", any content beyond this height would be clipped, so we
    // err on the tall side.
    console.warn(
      '[Revision Tracker] Iframe auto-size skipped (cross-origin). ' +
      'Falling back to a tall fixed height. For perfect auto-sizing, ' +
      'open the app in Firefox, or serve it over http://localhost.',
      e.message
    );
    const fallbackH = Math.max(window.innerHeight * 2, 1200);
    iframe.style.height = fallbackH + 'px';
  }
}
function loadSubjectPage(subjectId) {
  const rev = REVISIONS.find(r => r.id === subjectId);
  if (!rev) { navigateToView('dashboard'); return; }

  const data = appData.revisions[subjectId] ||
               { completedCount: 0, nextDueAt: null, history: [], comments: [] };

  // Header.
  document.getElementById('subjectViewTitle').textContent = rev.title;
  document.getElementById('subjectViewBadge').textContent = getSubjectCurrentStateText(data);
  document.getElementById('subjectViewCompletedCount').textContent =
    `Total Revised: ${data.completedCount} times`;

  // Reset scheduling selection & clear the custom picker.
  selectedScheduleOption = null;
  const picker = document.getElementById('customDateTimePicker');
  if (picker) picker.value = '';
  updateScheduleOptionUI();

  // Load the study material into the iframe, forwarding the current theme.
  const iframe = document.getElementById('subjectIframe');
  if (iframe) {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';

    // The revision page posts its own height to us via postMessage (see the
    // snippet in each revision/*.html file). That's how the iframe sizes
    // itself perfectly to its content even on file:// where Chrome blocks
    // direct DOM access.
    //
    // Safety net: if no message arrives within 800ms, fall back to direct
    // measurement (works on http:// and Firefox file://).
    iframe.onload = function () {
      clearTimeout(iframe._fallbackTimer);
      iframe._fallbackTimer = setTimeout(function () {
        autoSizeIframe(iframe);
      }, 800);
    };

    iframe.src = `${rev.page}#theme=${theme}`;
  }

  // Show "Undo" only if the last action was for THIS subject.
  const undoBtn = document.getElementById('undoBtn');
  if (appData.lastAction && appData.lastAction.revisionId === subjectId) {
    undoBtn.classList.remove('hidden');
  } else {
    undoBtn.classList.add('hidden');
  }
}

/* ==========================================================================
 * 2. SCHEDULE OPTION SELECTOR (bottom action bar)
 * ==========================================================================*/

/** Toggle one of the three schedule buttons. Clicking the active one clears it. */
function selectScheduleOption(opt) {
  selectedScheduleOption = (selectedScheduleOption === opt) ? null : opt;
  updateScheduleOptionUI();
}

/** Sync button styling + the custom-date popover with the current selection. */
function updateScheduleOptionUI() {
  const opt24   = document.getElementById('opt24h');
  const opt48   = document.getElementById('opt48h');
  const optCust = document.getElementById('optCustom');
  const custom  = document.getElementById('customDateContainer');

  [opt24, opt48, optCust].forEach(btn => {
    btn.classList.remove('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
    btn.classList.add('border-slate-800', 'bg-slate-950', 'text-slate-300');
  });
  custom.classList.add('hidden');

  if (selectedScheduleOption === '24h') {
    opt24.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
  } else if (selectedScheduleOption === '48h') {
    opt48.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
  } else if (selectedScheduleOption === 'custom') {
    optCust.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
    custom.classList.remove('hidden');
  }
}

/* ==========================================================================
 * 3. COMPLETE A REVISION SESSION
 * ==========================================================================*/

/**
 * Record a completion:
 *   1. Snapshot the previous state into appData.lastAction (for Undo).
 *   2. Increment completedCount.
 *   3. Compute the new nextDueAt from the chosen schedule option — or leave
 *      it null if "no more revision needed" was selected (i.e. nothing picked).
 *   4. Push a history entry.
 *   5. Persist and return to the dashboard.
 */
function handleComplete() {
  if (!currentSubjectId) return;

  if (!confirm('Confirm completing this revision session?')) return;

  const now  = new Date();
  const data = appData.revisions[currentSubjectId];
  data.history = data.history || [];

  // --- Snapshot for Undo ---
  appData.lastAction = {
    revisionId: currentSubjectId,
    previousCompletedCount: data.completedCount,
    previousHistory: JSON.parse(JSON.stringify(data.history)),
    previousNextDueAt: data.nextDueAt,
    action: 'complete'
  };

  const previousNextDueAt = data.nextDueAt;
  data.completedCount = (data.completedCount || 0) + 1;

  // --- Compute the new due timestamp ---
  let newNextDueAt = null;

  if (selectedScheduleOption === '24h') {
    newNextDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  } else if (selectedScheduleOption === '48h') {
    newNextDueAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  } else if (selectedScheduleOption === 'custom') {
    const picker = document.getElementById('customDateTimePicker');
    if (!picker.value) {
      alert('Please pick a valid future date & time — or choose +24h / +48h.');
      return;
    }
    const chosen = new Date(picker.value);
    if (isNaN(chosen.getTime())) {
      alert('That custom timestamp could not be parsed. Please pick another.');
      return;
    }
    if (chosen.getTime() <= now.getTime()) {
      alert('The custom time must be strictly in the future.');
      return;
    }
    newNextDueAt = chosen.toISOString();
  }
  // If nothing was selected → newNextDueAt stays null → subject moves to
  // "NO MORE REVISION NEEDED".

  data.nextDueAt = newNextDueAt;

  // --- Record history ---
  data.history.unshift({
    completedAt: now.toISOString(),
    scheduledFor: previousNextDueAt,   // what it WAS scheduled for
    action: 'complete'
  });

  saveStorage();
  navigateToView('dashboard');
}

/* ==========================================================================
 * 4. UNDO LAST COMPLETION
 * ==========================================================================*/

/**
 * Restore the state captured in appData.lastAction.
 * Only available on the subject page that was actually completed, and only
 * until another completion overwrites lastAction (single-level undo).
 */
function handleUndo() {
  if (!appData.lastAction) return;
  if (appData.lastAction.revisionId !== currentSubjectId) return;

  if (!confirm('Undo the last completion action for this subject?')) return;

  const last = appData.lastAction;
  const data = appData.revisions[currentSubjectId];

  data.completedCount = last.previousCompletedCount;
  data.history        = last.previousHistory;
  data.nextDueAt      = last.previousNextDueAt;

  appData.lastAction = null;
  saveStorage();
  loadSubjectPage(currentSubjectId);
}

/* ==========================================================================
 * 5. SUBJECT ⋮ MODAL — history + comments
 * ==========================================================================*/

function openSubjectMenuModal(subjectId) {
  activeModalSubjectId = subjectId;
  const rev  = REVISIONS.find(r => r.id === subjectId);
  const data = appData.revisions[subjectId] || { completedCount: 0, history: [], comments: [] };

  document.getElementById('modalSubjectTitle').textContent = rev.title;
  document.getElementById('modalSubjectCount').textContent = `Total Revisions: ${data.completedCount}`;

  renderModalSubjectHistory(data.history  || []);
  renderModalComments(data.comments || []);
  document.getElementById('newCommentText').value = '';

  openModal('subjectMenuModal');
}

/** Render the per-subject history list inside the modal. */
function renderModalSubjectHistory(history) {
  const container = document.getElementById('modalSubjectHistory');
  if (!history || history.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 py-2 italic">No revisions yet.</div>`;
    return;
  }
  container.innerHTML = history.map(h => `
    <div class="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs flex items-center justify-between">
      <div class="text-slate-300 font-medium">${formatDateDisplay(h.completedAt)}</div>
      <div class="text-[11px] text-slate-500">
        ${h.scheduledFor ? `Scheduled: ${formatDateDisplay(h.scheduledFor)}` : 'No future revision scheduled'}
      </div>
    </div>`).join('');
}

/** Render the per-subject comment list inside the modal. */
function renderModalComments(comments) {
  const container = document.getElementById('modalCommentsList');
  if (!comments || comments.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-500 py-2 italic">No comments yet.</div>`;
    return;
  }
  container.innerHTML = comments.map(c => `
    <div id="comment-${c.id}" class="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2 text-xs">
      <div class="text-slate-300 font-normal whitespace-pre-wrap leading-relaxed">${escapeHtml(c.text)}</div>
      <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-900">
        <span>${formatDateDisplay(c.updatedAt || c.createdAt)}</span>
        <div class="flex items-center gap-2">
          <button onclick="editComment('${c.id}')"   class="text-indigo-400 hover:text-indigo-300 font-semibold">Edit</button>
          <button onclick="deleteComment('${c.id}')" class="text-rose-400 hover:text-rose-300 font-semibold">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

/* ==========================================================================
 * 6. COMMENT CRUD
 * ==========================================================================*/

function addComment() {
  if (!activeModalSubjectId) return;
  const input = document.getElementById('newCommentText');
  const val   = input.value.trim();
  if (!val) return;

  const data = appData.revisions[activeModalSubjectId];
  data.comments = data.comments || [];

  data.comments.unshift({
    id: 'cm_' + Date.now(),
    text: val,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  input.value = '';
  saveStorage();
  renderModalComments(data.comments);
}

/** Swap a comment card into inline edit mode. */
function editComment(commentId) {
  const data    = appData.revisions[activeModalSubjectId];
  const comment = (data.comments || []).find(c => c.id === commentId);
  if (!comment) return;

  const card = document.getElementById(`comment-${commentId}`);
  card.innerHTML = `
    <textarea id="edit-area-${commentId}" rows="2"
              class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none custom-scrollbar">${escapeHtml(comment.text)}</textarea>
    <div class="flex justify-end gap-2 pt-1">
      <button onclick="cancelEditComment()"          class="bg-slate-800 text-slate-300 px-2.5 py-1 rounded text-[11px] font-semibold">Cancel</button>
      <button onclick="saveEditComment('${commentId}')" class="bg-indigo-600 text-white px-2.5 py-1 rounded text-[11px] font-semibold">Save</button>
    </div>`;
}

function saveEditComment(commentId) {
  const data    = appData.revisions[activeModalSubjectId];
  const comment = (data.comments || []).find(c => c.id === commentId);
  if (!comment) return;

  const area = document.getElementById(`edit-area-${commentId}`);
  if (area && area.value.trim()) {
    comment.text      = area.value.trim();
    comment.updatedAt = new Date().toISOString();
    saveStorage();
  }
  renderModalComments(data.comments);
}

/** Discard inline edits — just re-render from stored data. */
function cancelEditComment() {
  const data = appData.revisions[activeModalSubjectId];
  renderModalComments(data.comments || []);
}

function deleteComment(commentId) {
  if (!confirm('Delete this comment? This cannot be undone.')) return;
  const data = appData.revisions[activeModalSubjectId];
  data.comments = (data.comments || []).filter(c => c.id !== commentId);
  saveStorage();
  renderModalComments(data.comments);
}