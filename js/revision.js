/* ============================================================================
 * revision.js — Individual subject page
 * ==========================================================================*/

/* ==========================================================================
 * 1. SMART SCHEDULING (Phase 4)
 * ==========================================================================*/

function calculateSmartSchedule(rating) {
  if (!rating) return null;
  const intervals = appData.settings.smartIntervals || { again: 8, hard: 24, good: 48, easy: 96 };
  const hours = intervals[rating] || 24;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function updateSmartIntervals() {
  const a = Number(document.getElementById('intAgain').value) || 8;
  const h = Number(document.getElementById('intHard').value) || 24;
  const g = Number(document.getElementById('intGood').value) || 48;
  const e = Number(document.getElementById('intEasy').value) || 96;

  appData.settings.smartIntervals = { again: a, hard: h, good: g, easy: e };
  saveStorage();
  if (currentSessionRating) updateSelfTestUI();
}

/* ==========================================================================
 * 2. TIMER GLOBALS (Phase 6)
 * ==========================================================================*/

let timerInterval = null;
let timerElapsedMs = 0;
let timerStartedAt = null;

/* ==========================================================================
 * 3. IFRAME MESSAGE LISTENER
 * ==========================================================================*/

window.addEventListener('message', function (event) {
  const msg = event.data;
  if (!msg || msg.type !== 'revision-height') return;
  if (location.protocol !== 'file:' && event.origin !== location.origin) return;

  const iframe = document.getElementById('subjectIframe');
  if (!iframe) return;

  clearTimeout(iframe._fallbackTimer);
  const h = Number(msg.height) || 0;
  if (h > 0) iframe.style.height = Math.min(Math.max(h, 320), 20000) + 'px';
});

function autoSizeIframe(iframe) {
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc || !doc.body) return;
    iframe.style.height = 'auto';
    const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
    iframe.style.height = Math.max(h, 320) + 'px';
  } catch (e) {
    const fallbackH = Math.max(window.innerHeight * 2, 1200);
    iframe.style.height = fallbackH + 'px';
  }
}

/* ==========================================================================
 * 4. LOAD THE SUBJECT PAGE
 * ==========================================================================*/

function loadSubjectPage(subjectId) {
  const rev = REVISIONS.find(r => r.id === subjectId);
  if (!rev) { navigateToView('dashboard'); return; }

  const data = appData.revisions[subjectId] || { completedCount: 0, nextDueAt: null, history: [], comments: [] };

  document.getElementById('subjectViewTitle').textContent = rev.title;

  // Phase 9: Leech Warning
  const leechBanner = document.getElementById('leechWarningBanner');
  if (leechBanner) {
    if (typeof isLeech === 'function' && isLeech(data)) {
      leechBanner.classList.remove('hidden');
    } else {
      leechBanner.classList.add('hidden');
    }
  }
  document.getElementById('subjectViewBadge').textContent = getSubjectCurrentStateText(data);
  document.getElementById('subjectViewCompletedCount').textContent = `Total Revised: ${data.completedCount} times`;

  selectedScheduleOption = null;
  const picker = document.getElementById('customDateTimePicker');
  if (picker) picker.value = '';
  
  currentSessionRating = null;
  updateSelfTestUI();

  const iframe = document.getElementById('subjectIframe');
  if (iframe) {
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';
    iframe.onload = function () {
      clearTimeout(iframe._fallbackTimer);
      iframe._fallbackTimer = setTimeout(function () { autoSizeIframe(iframe); }, 800);
    };
    iframe.src = `${rev.page}#theme=${theme}`;
  }

  const undoBtn = document.getElementById('undoBtn');
  if (appData.lastAction && appData.lastAction.revisionId === subjectId) {
    undoBtn.classList.remove('hidden');
  } else {
    undoBtn.classList.add('hidden');
  }

  // Setup Study Timer (Phase 6)
  if (timerInterval) clearInterval(timerInterval);
  const timerPanel = document.getElementById('studyTimerPanel');
  
  if (timerPanel) {
    if (appData.settings && appData.settings.studyTimerEnabled) {
      timerPanel.classList.remove('hidden');
      
      if (studySession && studySession.subjectId === subjectId) {
        timerElapsedMs = studySession.accumulatedMs;
        if (studySession.startedAt) {
          timerStartedAt = new Date(studySession.startedAt).getTime();
          timerInterval = setInterval(updateTimerDisplay, 1000);
          document.getElementById('timerStartBtn').innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
          document.getElementById('timerStopBtn').classList.remove('hidden');
        } else {
          timerStartedAt = null;
          document.getElementById('timerStartBtn').innerHTML = '<i class="fa-solid fa-play"></i> Resume';
          document.getElementById('timerStopBtn').classList.remove('hidden');
        }
        updateTimerDisplay();
      } else {
        studySession = null;
        timerElapsedMs = 0;
        timerStartedAt = null;
        updateTimerDisplay();
        document.getElementById('timerStartBtn').innerHTML = '<i class="fa-solid fa-play"></i> Start';
        document.getElementById('timerStopBtn').classList.add('hidden');
      }
    } else {
      timerPanel.classList.add('hidden');
    }
  }
}

/* ==========================================================================
 * 5. SCHEDULE SELECTOR
 * ==========================================================================*/

function selectScheduleOption(opt) {
  selectedScheduleOption = (selectedScheduleOption === opt) ? null : opt;
  updateScheduleOptionUI();
}

function updateScheduleOptionUI() {
  const opt24   = document.getElementById('opt24h');
  const opt48   = document.getElementById('opt48h');
  const optCust = document.getElementById('optCustom');
  const optSmart = document.getElementById('smartSuggestBtn');
  const custom  = document.getElementById('customDateContainer');

  if (!opt24 || !opt48 || !optCust || !custom) return;

  [opt24, opt48, optCust].forEach(btn => {
    btn.classList.remove('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
    btn.classList.add('border-slate-800', 'bg-slate-950', 'text-slate-300');
  });
  custom.classList.add('hidden');

  if (optSmart) optSmart.classList.remove('ring-2', 'ring-indigo-400', 'bg-indigo-600/40');

  if (selectedScheduleOption === '24h') {
    opt24.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
  } else if (selectedScheduleOption === '48h') {
    opt48.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
  } else if (selectedScheduleOption === 'custom') {
    optCust.classList.add('border-indigo-500', 'bg-indigo-600/20', 'text-indigo-300');
    custom.classList.remove('hidden');
  } else if (selectedScheduleOption === 'smart' && optSmart) {
    optSmart.classList.add('ring-2', 'ring-indigo-400', 'bg-indigo-600/40');
  }
}

/* ==========================================================================
 * 6. COMPLETE & UNDO
 * ==========================================================================*/

function handleComplete() {
  if (!currentSubjectId) return;

  let scheduledAt = null;
  if (selectedScheduleOption === 'custom') {
    const picker = document.getElementById('customDateTimePicker');
    if (!picker || !picker.value) { alert('Please pick a valid future date & time.'); return; }
    const chosen = new Date(picker.value);
    if (isNaN(chosen.getTime())) { alert('That timestamp could not be parsed.'); return; }
    if (chosen.getTime() <= Date.now()) { alert('The custom time must be strictly in the future.'); return; }
    scheduledAt = chosen;
  }

  if (!selectedScheduleOption) {
    if (!confirm('No next revision scheduled — this subject will move to "No More Revision Needed". Complete anyway?')) return;
  }

  if (!confirm('Confirm completing this revision session?')) return;

  const data = appData.revisions[currentSubjectId];
  if (!data) { alert('Subject data missing — reload the app.'); return; }
  data.history  = data.history  || [];
  data.comments = data.comments || [];

  const now = new Date();
  appData.lastAction = {
    revisionId: currentSubjectId,
    previousCompletedCount: data.completedCount || 0,
    previousHistory: JSON.parse(JSON.stringify(data.history)),
    previousNextDueAt: data.nextDueAt,
    action: 'complete'
  };
  const previousNextDueAt = data.nextDueAt;

  data.completedCount = (data.completedCount || 0) + 1;

  if (selectedScheduleOption === '24h') {
    data.nextDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  } else if (selectedScheduleOption === '48h') {
    data.nextDueAt = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
  } else if (selectedScheduleOption === 'custom' && scheduledAt) {
    data.nextDueAt = scheduledAt.toISOString();
  } else if (selectedScheduleOption === 'smart') {
    const smartDate = calculateSmartSchedule(currentSessionRating);
    data.nextDueAt = smartDate ? smartDate.toISOString() : null;
  } else {
    data.nextDueAt = null;
  }

  // Capture timer data for this completion
  let studyMs = timerElapsedMs;
  if (timerStartedAt) studyMs += (Date.now() - timerStartedAt);

  data.history.unshift({
    completedAt: now.toISOString(),
    scheduledFor: previousNextDueAt,
    action: 'complete',
    recall: currentSessionRating,
    studyMs: studyMs
  });

  if (appData.settings.studyTimerEnabled && typeof stopTimer === 'function') {
    stopTimer(); 
  }

  saveStorage();
  navigateToView('dashboard');
}

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
 * 7. ACTIVE RECALL (SELF-TEST)
 * ==========================================================================*/

function openSelfTest() {
  if (!currentSubjectId) return;
  document.getElementById('selfTestModal').classList.remove('hidden');
}

function setRating(rating) {
  if (!['again', 'hard', 'good', 'easy'].includes(rating)) return;
  currentSessionRating = rating;
  document.getElementById('selfTestModal').classList.add('hidden');
  updateSelfTestUI();
}

function updateSelfTestUI() {
  const btn = document.getElementById('selfTestBtn');
  const badge = document.getElementById('recallBadge');
  const smartBtn = document.getElementById('smartSuggestBtn');
  const smartText = document.getElementById('smartSuggestText');
  
  if (!btn || !badge || !smartBtn || !smartText) return;

  if (!currentSessionRating) {
    btn.innerHTML = `<i class="fa-solid fa-brain"></i> <span>SELF-TEST</span>`;
    btn.className = "w-full py-2 px-3 mb-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all";
    badge.classList.add('hidden');
    smartBtn.classList.add('hidden');
  } else {
    btn.innerHTML = `<i class="fa-solid fa-pen"></i> <span>CHANGE RATING</span>`;
    btn.className = "w-full py-2 px-3 mb-2 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs flex items-center justify-center gap-2 transition-all";
    
    badge.classList.remove('hidden');
    const colors = {
      again: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      hard: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      good: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      easy: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    };
    const labels = { again: 'AGAIN', hard: 'HARD', good: 'GOOD', easy: 'EASY' };
    
    badge.className = `text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider mb-2 inline-block border ${colors[currentSessionRating]}`;
    badge.textContent = `Rated: ${labels[currentSessionRating]}`;

    const suggestedDate = calculateSmartSchedule(currentSessionRating);
    const diffHours = Math.round((suggestedDate - Date.now()) / (1000 * 60 * 60));
    smartText.textContent = `Suggested: +${diffHours} Hours (${labels[currentSessionRating]})`;
    smartBtn.classList.remove('hidden');
  }
  updateScheduleOptionUI();
}

/* ==========================================================================
 * 8. STUDY TIMER
 * ==========================================================================*/

function updateTimerDisplay() {
  let currentTotal = timerElapsedMs;
  if (timerStartedAt) currentTotal += (Date.now() - timerStartedAt);
  
  const secs = Math.floor((currentTotal / 1000) % 60);
  const mins = Math.floor((currentTotal / 60000) % 60);
  const hrs = Math.floor(currentTotal / 3600000);
  
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function toggleTimer(silent = false) {
  const btn = document.getElementById('timerStartBtn');
  const stopBtn = document.getElementById('timerStopBtn');
  if (!btn || !stopBtn) return;
  
  // Auto-save timer every 10s while running
  if (!timerInterval && !silent) {
    setInterval(() => {
      if (timerStartedAt) {
        studySession = { subjectId: currentSubjectId, startedAt: new Date(timerStartedAt).toISOString(), accumulatedMs: timerElapsedMs };
        saveStorage();
      }
    }, 10000);
  }
  
  if (!timerStartedAt) {
    timerStartedAt = Date.now();
    timerInterval = setInterval(updateTimerDisplay, 1000);
    btn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
    stopBtn.classList.remove('hidden');
    
    studySession = { subjectId: currentSubjectId, startedAt: new Date(timerStartedAt).toISOString(), accumulatedMs: timerElapsedMs };
    saveStorage();
  } else {
    timerElapsedMs += (Date.now() - timerStartedAt);
    timerStartedAt = null;
    clearInterval(timerInterval);
    btn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
    
    studySession = { subjectId: currentSubjectId, startedAt: null, accumulatedMs: timerElapsedMs };
    saveStorage();
  }
  updateTimerDisplay();
}

function stopTimer() {
  if (timerStartedAt) timerElapsedMs += (Date.now() - timerStartedAt);
  timerStartedAt = null;
  clearInterval(timerInterval);
  studySession = null;
  timerElapsedMs = 0;
  updateTimerDisplay();
  
  const btn = document.getElementById('timerStartBtn');
  const stopBtn = document.getElementById('timerStopBtn');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
  if (stopBtn) stopBtn.classList.add('hidden');
  saveStorage();
}

/* ==========================================================================
 * 9. COMMENTS MODAL
 * ==========================================================================*/

function openSubjectMenuModal(subjectId) {
  const rev = REVISIONS.find(r => r.id === subjectId);
  if (!rev) return;

  activeModalSubjectId = subjectId;
  const data = appData.revisions[subjectId] || { completedCount: 0, history: [], comments: [] };

  document.getElementById('modalSubjectTitle').textContent = rev.title;
  document.getElementById('modalSubjectCount').textContent = `Total Revisions: ${data.completedCount}`;

  renderModalSubjectHistory(data.history  || []);
  renderModalComments(data.comments || []);
  document.getElementById('newCommentText').value = '';

  openModal('subjectMenuModal');
}

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