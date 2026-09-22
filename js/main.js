/* ============================================================================
 * main.js — Dashboard rendering · Navigation · Global UI · Bootstrap
 * ----------------------------------------------------------------------------
 * Contains everything that is NOT specific to the individual subject page:
 *   • navigateToView() + recent-views strip
 *   • renderDashboard() and all its section renderers
 *   • Streak calculation, status text, badge classes
 *   • ALL REVISIONS search
 *   • Theme toggle, live clock, quick "jump to subject" search
 *   • Collapsible-section helpers, modal open/close
 *   • Bootstrap (DOMContentLoaded) + service-worker registration
 * ==========================================================================*/

/* ==========================================================================
 * 1. NAVIGATION BETWEEN VIEWS
 * ==========================================================================*/

/**
 * Switch between the dashboard and the individual subject view.
 * @param {'dashboard'|'subject'} viewName
 * @param {string|null} subjectId — required when viewName === 'subject'
 */
function navigateToView(viewName, subjectId = null) {
  const dashView = document.getElementById('dashboardView');
  const subjView = document.getElementById('subjectView');

  if (viewName === 'dashboard') {
    dashView.classList.remove('hidden');
    subjView.classList.add('hidden');
    currentSubjectId = null;
    renderDashboard();
  } else if (viewName === 'subject' && subjectId) {
    currentSubjectId = subjectId;
    trackRecentView(subjectId);
    dashView.classList.add('hidden');
    subjView.classList.remove('hidden');
    loadSubjectPage(subjectId);   // lives in revision.js
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Push a subject id to the front of the recent-views MRU list (max 5). */
function trackRecentView(subjectId) {
  if (!subjectId) return;
  appData.recentViews = appData.recentViews.filter(id => id !== subjectId);
  appData.recentViews.unshift(subjectId);
  if (appData.recentViews.length > 5) {
    appData.recentViews = appData.recentViews.slice(0, 5);
  }
  saveStorage();
  renderRecentViews();
}

/** Render the "RECENT VIEWS" pills in the header sub-bar. */
function renderRecentViews() {
  const container = document.getElementById('recentViewsContainer');

  let html = `
    <button onclick="navigateToView('dashboard')"
            class="bg-indigo-600 text-white font-semibold px-3 py-1 rounded-full shadow-sm flex items-center gap-1.5 transition hover:bg-indigo-500 shrink-0">
      <i class="fa-solid fa-chart-pie text-[10px]"></i> Dashboard
    </button>`;

  appData.recentViews.forEach(id => {
    const rev = REVISIONS.find(r => r.id === id);
    if (!rev) return;
    html += `
      <button onclick="navigateToView('subject', '${rev.id}')"
              class="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-3 py-1 rounded-full border border-slate-700/60 transition flex items-center gap-1.5 shrink-0">
        <i class="fa-solid fa-book-bookmark text-[10px] text-indigo-400"></i> ${escapeHtml(rev.title)}
      </button>`;
  });

  container.innerHTML = html;
}

/* ==========================================================================
 * 2. DASHBOARD — MAIN RENDERER
 * ==========================================================================*/

/**
 * Re-render every stat card and every section.
 * Called on load, on navigation, after any mutation, AND every second by the
 * live countdown interval. Keep it fast — it touches a lot of DOM.
 */
function renderDashboard() {
  const now = new Date();

  let totalCompletions = 0;
  let completedToday = 0;
  let overdueCount = 0;

  const todayItems       = [];
  const next6HoursItems  = [];
  const overdueItems     = [];
  const noMoreItems      = [];
  const globalHistoryList = [];

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todayEnd   = todayStart + 24 * 60 * 60 * 1000;

  REVISIONS.forEach(rev => {
    const data = appData.revisions[rev.id] || { completedCount: 0, nextDueAt: null, history: [] };
    totalCompletions += data.completedCount || 0;

    // Tally today's completions and collect global history entries.
    (data.history || []).forEach(h => {
      const compTime = new Date(h.completedAt).getTime();
      if (compTime >= todayStart && compTime < todayEnd) completedToday++;

      globalHistoryList.push({
        subjectId: rev.id,
        title: rev.title,
        completedAt: h.completedAt,
        scheduledFor: h.scheduledFor
      });
    });

    // Classify this subject into exactly one bucket.
    // NOTE: this is an if/else-if chain — buckets are mutually exclusive.
    if (data.nextDueAt) {
      const dueTime = new Date(data.nextDueAt).getTime();
      const nowTime = now.getTime();

      if (dueTime < nowTime) {
        overdueItems.push({ rev, data, dueTime });
        overdueCount++;
      } else if (dueTime >= todayStart && dueTime < todayEnd) {
        todayItems.push({ rev, data, dueTime });
      } else if (dueTime > nowTime && dueTime <= nowTime + 6 * 60 * 60 * 1000) {
        next6HoursItems.push({ rev, data, dueTime });
      }
    } else if (data.completedCount > 0) {
      noMoreItems.push({ rev, data });
    }
  });

  todayItems.sort((a, b)      => a.dueTime - b.dueTime);
  next6HoursItems.sort((a, b) => a.dueTime - b.dueTime);
  overdueItems.sort((a, b)    => a.dueTime - b.dueTime);

  /* ---- Stat cards ---- */
  document.getElementById('statTotal').textContent   = totalCompletions;
  document.getElementById('statToday').textContent   = completedToday;
  document.getElementById('statOverdue').textContent = overdueCount;
  document.getElementById('statStreak').innerHTML =
    `<span>${calculateStreak()}</span> <span class="text-sm font-normal text-slate-400">Days</span>`;

  /* ---- Section badges + content ---- */
  document.getElementById('todayBadge').textContent = todayItems.length;
  document.getElementById('todayContent').innerHTML =
    renderSectionList(todayItems, 'TODAY');

  document.getElementById('next6HoursBadge').textContent = next6HoursItems.length;
  document.getElementById('next6HoursContent').innerHTML =
    renderSectionList(next6HoursItems, 'NEXT 6 HOURS');

  document.getElementById('overdueBadge').textContent = overdueItems.length;
  document.getElementById('overdueContent').innerHTML =
    renderSectionList(overdueItems, 'OVERDUE');

  document.getElementById('noMoreBadge').textContent = noMoreItems.length;
  document.getElementById('noMoreContent').innerHTML = renderNoMoreList(noMoreItems);

  renderAllRevisionsSection();

  /* ---- Global history (latest 50) ---- */
  globalHistoryList.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const latest50 = globalHistoryList.slice(0, 50);
  document.getElementById('globalHistoryBadge').textContent = latest50.length;
  document.getElementById('historyContent').innerHTML = renderGlobalHistoryList(latest50);
}

/* ==========================================================================
 * 3. STREAK
 * ==========================================================================*/

/**
 * Consecutive-day streak ending today, counted across ALL subjects.
 * Walks backwards from today through the set of dates that have at least one
 * completion. Returns 0 if nothing was completed today.
 */
function calculateStreak() {
  const allDates = new Set();

  REVISIONS.forEach(rev => {
    const hist = (appData.revisions[rev.id] && appData.revisions[rev.id].history) || [];
    hist.forEach(h => {
      const d = new Date(h.completedAt);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      allDates.add(key);
    });
  });

  let streak = 0;
  const cursor = new Date();

  while (true) {
    const key = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    if (allDates.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

/* ==========================================================================
 * 4. SECTION LIST RENDERERS
 * ==========================================================================*/

/** Renders a TODAY / NEXT 6 HOURS / OVERDUE row list. */
function renderSectionList(items, sectionType) {
  if (items.length === 0) {
    let msg = 'Nothing scheduled for today.';
    if (sectionType === 'NEXT 6 HOURS') msg = 'Nothing due in the next 6 hours.';
    if (sectionType === 'OVERDUE')      msg = 'Nothing overdue. Nice work.';
    return `<div class="text-xs text-slate-500 py-3 text-center italic">${msg}</div>`;
  }

  return items.map(({ rev, data }) => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition">
      <div class="flex items-center gap-3">
        <span class="font-bold text-xs sm:text-sm text-slate-200">${escapeHtml(rev.title)}</span>
        <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${getStatusBadgeClass(data.nextDueAt)}">
          ${formatStatusText(data.nextDueAt)}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="navigateToView('subject', '${rev.id}')"
                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition shadow-sm">OPEN</button>
        <button onclick="openSubjectMenuModal('${rev.id}')" aria-label="Menu"
                class="text-slate-400 hover:text-white w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center transition">
          <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
        </button>
      </div>
    </div>`).join('');
}

/** Renders the "NO MORE REVISION NEEDED" list. */
function renderNoMoreList(items) {
  if (items.length === 0) {
    return `<div class="text-xs text-slate-500 py-3 text-center italic">No completed revisions waiting here.</div>`;
  }

  return items.map(({ rev, data }) => `
    <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition">
      <div class="flex items-center gap-3">
        <span class="font-bold text-xs sm:text-sm text-slate-200">${escapeHtml(rev.title)}</span>
        <span class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-slate-800 text-slate-400 border border-slate-700/50">
          Revised: ${data.completedCount} times
        </span>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="navigateToView('subject', '${rev.id}')"
                class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition shadow-sm">OPEN</button>
        <button onclick="openSubjectMenuModal('${rev.id}')" aria-label="Menu"
                class="text-slate-400 hover:text-white w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center transition">
          <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
        </button>
      </div>
    </div>`).join('');
}

/** Renders the "ALL REVISIONS" list, honouring the current search filter. */
function renderAllRevisionsSection() {
  let filtered = REVISIONS;
  if (allRevisionsSearchQuery) {
    filtered = REVISIONS.filter(r => r.title.toLowerCase().includes(allRevisionsSearchQuery));
  }

  document.getElementById('allRevisionsBadge').textContent = filtered.length;
  const container = document.getElementById('allRevisionsContent');

  if (filtered.length === 0) {
    container.innerHTML =
      `<div class="text-xs text-slate-500 py-4 text-center italic">No revisions matching "${escapeHtml(allRevisionsSearchQuery)}"</div>`;
    return;
  }

  container.innerHTML = filtered.map(rev => {
    const data = appData.revisions[rev.id] || { completedCount: 0, nextDueAt: null, history: [] };
    return `
      <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition gap-3">
        <div class="flex items-center justify-between sm:justify-start gap-3">
          <span class="font-bold text-sm text-slate-100">${escapeHtml(rev.title)}</span>
          <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold ${getSubjectCurrentStateClass(data)}">
            ${getSubjectCurrentStateText(data)}
          </span>
        </div>
        <div class="flex items-center justify-end gap-2">
          <button onclick="navigateToView('subject', '${rev.id}')"
                  class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow-sm">OPEN</button>
          <button onclick="openSubjectMenuModal('${rev.id}')" aria-label="Menu"
                  class="text-slate-400 hover:text-white w-9 h-9 rounded-xl bg-slate-800/80 hover:bg-slate-700 flex items-center justify-center transition border border-slate-700/50">
            <i class="fa-solid fa-ellipsis-vertical text-xs"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

/** Renders the global history list (already sliced to 50). */
function renderGlobalHistoryList(historyList) {
  if (historyList.length === 0) {
    return `<div class="text-xs text-slate-500 py-3 text-center italic">No revision history yet.</div>`;
  }

  return historyList.map(item => `
    <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
      <div>
        <div class="font-bold text-slate-200">${escapeHtml(item.title)}</div>
        <div class="text-slate-400 text-[11px] mt-0.5">Completed: ${formatDateDisplay(item.completedAt)}</div>
      </div>
      <div class="text-right text-[10px] text-slate-500">
        ${item.scheduledFor ? `Scheduled for: ${formatDateDisplay(item.scheduledFor)}` : 'No future revision scheduled'}
      </div>
    </div>`).join('');
}

/* ==========================================================================
 * 5. STATUS TEXT & BADGE CLASSES
 * ==========================================================================*/

/**
 * Human-readable status string for a due timestamp.
 *   • Negative diff  → "OVERDUE HH:MM:SS"
 *   • ≤ 6 h diff     → "Due in HH:MM:SS"
 *   • Otherwise      → "Due DD/MM/YYYY HH:MM"
 */
function formatStatusText(nextDueAt) {
  if (!nextDueAt) return 'NO MORE REVISION';

  const diff = new Date(nextDueAt).getTime() - Date.now();

  if (diff < 0) {
    const abs = Math.abs(diff);
    return `OVERDUE ${pad(Math.floor(abs / 3600000))}:${pad(Math.floor((abs % 3600000) / 60000))}:${pad(Math.floor((abs % 60000) / 1000))}`;
  }
  if (diff <= 6 * 60 * 60 * 1000) {
    return `Due in ${pad(Math.floor(diff / 3600000))}:${pad(Math.floor((diff % 3600000) / 60000))}:${pad(Math.floor((diff % 60000) / 1000))}`;
  }
  const d = new Date(nextDueAt);
  return `Due ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Tailwind classes for a due-date badge. */
function getStatusBadgeClass(nextDueAt) {
  if (!nextDueAt) return 'bg-slate-800 text-slate-400';
  return new Date(nextDueAt).getTime() < Date.now()
    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
}

/** Combined state text for the ALL REVISIONS list. */
function getSubjectCurrentStateText(data) {
  const neverStarted = data.completedCount === 0 && (!data.history || data.history.length === 0) && !data.nextDueAt;
  if (neverStarted) return 'NOT STARTED';
  if (data.completedCount > 0 && !data.nextDueAt) return 'NO MORE REVISION';
  if (data.nextDueAt) return formatStatusText(data.nextDueAt);
  return 'NOT STARTED';
}

/** Combined state badge classes for the ALL REVISIONS list. */
function getSubjectCurrentStateClass(data) {
  const neverStarted = data.completedCount === 0 && (!data.history || data.history.length === 0) && !data.nextDueAt;
  if (neverStarted) return 'bg-slate-800 text-slate-400 border border-slate-700/50';
  if (data.completedCount > 0 && !data.nextDueAt) return 'bg-slate-800 text-emerald-400 border border-emerald-500/30';
  if (data.nextDueAt) return getStatusBadgeClass(data.nextDueAt);
  return 'bg-slate-800 text-slate-400';
}

/* ==========================================================================
 * 6. ALL-REVISIONS SEARCH
 * ==========================================================================*/

function handleAllRevisionsSearch(val) {
  allRevisionsSearchQuery = val.trim().toLowerCase();
  const clearBtn = document.getElementById('clearSearchBtn');
  clearBtn.classList.toggle('hidden', !allRevisionsSearchQuery);
  renderAllRevisionsSection();
}

function clearRevisionsSearch() {
  document.getElementById('allRevisionsSearch').value = '';
  handleAllRevisionsSearch('');
}

/* ==========================================================================
 * 7. THEME
 * ==========================================================================*/

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeButtonLabel(next);
}

function updateThemeButtonLabel(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.innerHTML = theme === 'dark'
    ? `<i class="fa-solid fa-moon text-indigo-400"></i> Dark Theme`
    : `<i class="fa-solid fa-sun text-amber-500"></i> Light Theme`;
}

/* ==========================================================================
 * 8. UI HELPERS — collapsible sections, modals, clock
 * ==========================================================================*/

/** Toggle a collapsible section and rotate its chevron icon(s). */
function toggleSection(sectionId) {
  const content    = document.getElementById(sectionId);
  const icon       = document.getElementById(sectionId + '-icon');
  const iconMobile = document.getElementById(sectionId + '-icon-mobile');

  if (content.classList.contains('hidden')) {
    content.classList.remove('hidden');
    if (icon)       icon.classList.remove('rotate-180');
    if (iconMobile) iconMobile.classList.remove('rotate-180');
  } else {
    content.classList.add('hidden');
    if (icon)       icon.classList.add('rotate-180');
    if (iconMobile) iconMobile.classList.add('rotate-180');
  }
}

function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden');    }

/** Tick the header's "Device Local Time" clock. */
function updateLiveClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const now = new Date();
  el.textContent =
    `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/* ==========================================================================
 * 9. QUICK "JUMP TO SUBJECT" SEARCH (header, desktop only)
 * ==========================================================================*/

function setupQuickSearch() {
  const input   = document.getElementById('quickViewSearch');
  const results = document.getElementById('quickSearchResults');
  if (!input || !results) return;

  input.addEventListener('input', e => {
    const val = e.target.value.trim().toLowerCase();
    if (!val) { results.classList.add('hidden'); return; }

    const matches = REVISIONS.filter(r => r.title.toLowerCase().includes(val));
    results.innerHTML = matches.length === 0
      ? `<div class="p-3 text-xs text-slate-500 text-center">No subjects found</div>`
      : matches.map(r => `
          <div onclick="navigateToView('subject', '${r.id}'); document.getElementById('quickSearchResults').classList.add('hidden');"
               class="p-2.5 hover:bg-slate-800 cursor-pointer text-xs text-slate-200 border-b border-slate-800/50 flex items-center justify-between">
            <span class="font-bold">${escapeHtml(r.title)}</span>
            <span class="text-[10px] text-indigo-400 font-semibold">Open Page</span>
          </div>`).join('');
    results.classList.remove('hidden');
  });

  // Close the dropdown when clicking outside it.
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
    }
  });
}

/* ==========================================================================
 * 10. SERVICE WORKER REGISTRATION
 * ==========================================================================*/

/**
 * Register the service worker for offline use.
 * Silently no-ops on file:// or insecure origins where SW is unavailable.
 */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('Service worker registration skipped:', err.message));
  });
}

/* ==========================================================================
 * 11. BOOTSTRAP
 * ==========================================================================*/

window.addEventListener('DOMContentLoaded', () => {
  loadStorage();          // storage.js — also applies the saved theme
  renderRecentViews();
  setupQuickSearch();
  renderDashboard();

  // Live tickers.
  setInterval(updateLiveClock, 1000);
  setInterval(renderDashboard, 1000);   // live countdowns

  updateLiveClock();

  // Refresh immediately when the tab regains focus (browsers throttle timers
  // on background tabs, so the countdowns can lag without this).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderDashboard();
  });

  registerServiceWorker();
});