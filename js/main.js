/* ============================================================================
 * main.js — Dashboard rendering · Navigation · Global UI · Bootstrap
 * ==========================================================================*/

const APP_VERSION = '3.0.0';

/* ==========================================================================
 * 1. NAVIGATION
 * ==========================================================================*/

function navigateToView(viewName, subjectId = null, skipHashUpdate = false) {
  const dashView = document.getElementById('dashboardView');
  const subjView = document.getElementById('subjectView');
  const analyticsView = document.getElementById('analyticsView');
  const calendarView = document.getElementById('calendarView');

  // Hide all views
  dashView.classList.add('hidden');
  subjView.classList.add('hidden');
  if (analyticsView) analyticsView.classList.add('hidden');
  if (calendarView) calendarView.classList.add('hidden');

  if (viewName === 'dashboard') {
    dashView.classList.remove('hidden');
    currentSubjectId = null;
    renderDashboard();
  } else if (viewName === 'subject' && subjectId) {
    currentSubjectId = subjectId;
    trackRecentView(subjectId);
    subjView.classList.remove('hidden');
    loadSubjectPage(subjectId);
  } else if (viewName === 'analytics') {
    currentSubjectId = null;
    if (analyticsView) analyticsView.classList.remove('hidden');
    if (typeof renderAnalytics === 'function') renderAnalytics();
  } else if (viewName === 'calendar') {
    currentSubjectId = null;
    if (calendarView) calendarView.classList.remove('hidden');
    if (typeof renderCalendar === 'function') renderCalendar();
  }

  // Phase 9: Update URL Hash
  if (!skipHashUpdate) {
    if (viewName === 'subject' && subjectId) {
      window.location.hash = `#subject/${subjectId}`;
    } else {
      window.location.hash = `#${viewName}`;
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function trackRecentView(subjectId) {
  if (!subjectId) return;
  appData.recentViews = appData.recentViews.filter(id => id !== subjectId);
  appData.recentViews.unshift(subjectId);
  if (appData.recentViews.length > 3) {
    appData.recentViews = appData.recentViews.slice(0, 3);
  }
  saveStorage();
  renderRecentViews();
}

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
 * 2. DASHBOARD
 * ==========================================================================*/

/* Phase 9: Leech Detection */
function isLeech(data) {
  if (!data || !data.history || data.history.length === 0) return false;
  let lowCount = 0;
  let consecutiveAgain = 0;
  
  // data.history is newest first
  for (let i = 0; i < data.history.length; i++) {
    const h = data.history[i];
    if (h.recall === 'again') {
      lowCount++;
      if (i < 2) consecutiveAgain++; // Count if it's the 1st or 2nd most recent
    } else if (h.recall === 'hard') {
      lowCount++;
    }
  }
  // It's a leech if 3+ total low ratings, OR 2 back-to-back AGAINs
  return (lowCount >= 3) || (consecutiveAgain >= 2);
}

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

  /* Stat cards */
  document.getElementById('statTotal').textContent   = totalCompletions;
  document.getElementById('statToday').textContent   = completedToday;
  document.getElementById('statOverdue').textContent = overdueCount;
  document.getElementById('statStreak').innerHTML =
    `<span>${calculateStreak()}</span> <span class="text-sm font-normal text-slate-400">Days</span>`;

  /* Daily Targets (Phase 6) */
  const settings = appData.settings || {};
  const targetCount = settings.dailyTargetCount || 5;
  const targetMins = settings.dailyTargetMinutes || 60;
  const showTimer = settings.studyTimerEnabled || false;
  const countPct = Math.min((completedToday / targetCount) * 100, 100);
  
  const targetTextEl = document.getElementById('dailyTargetText');
  const targetBarEl = document.getElementById('dailyTargetBar');
  const timeTextEl = document.getElementById('dailyTimeText');
  
  if (targetTextEl && targetBarEl && timeTextEl) {
    targetTextEl.textContent = `${completedToday} / ${targetCount}`;
    targetBarEl.style.width = `${countPct}%`;
    if (completedToday >= targetCount) {
      targetBarEl.classList.remove('bg-indigo-500');
      targetBarEl.classList.add('bg-emerald-500');
    } else {
      targetBarEl.classList.remove('bg-emerald-500');
      targetBarEl.classList.add('bg-indigo-500');
    }

    if (showTimer) {
      let totalMinsToday = 0;
      REVISIONS.forEach(rev => {
        const data = appData.revisions[rev.id] || { history: [] };
        (data.history || []).forEach(h => {
          const compTime = new Date(h.completedAt);
          if (compTime >= new Date(new Date().setHours(0,0,0,0)) && h.studyMs) {
            totalMinsToday += h.studyMs / 60000;
          }
        });
      });
      timeTextEl.classList.remove('hidden');
      timeTextEl.textContent = `Time: ${Math.round(totalMinsToday)} / ${targetMins} min`;
    } else {
      timeTextEl.classList.add('hidden');
    }
  }

  /* Sections */
  document.getElementById('todayBadge').textContent = todayItems.length;
  document.getElementById('todayContent').innerHTML = renderSectionList(todayItems, 'TODAY');

  document.getElementById('next6HoursBadge').textContent = next6HoursItems.length;
  document.getElementById('next6HoursContent').innerHTML = renderSectionList(next6HoursItems, 'NEXT 6 HOURS');

  document.getElementById('overdueBadge').textContent = overdueItems.length;
  document.getElementById('overdueContent').innerHTML = renderSectionList(overdueItems, 'OVERDUE');

  document.getElementById('noMoreBadge').textContent = noMoreItems.length;
  document.getElementById('noMoreContent').innerHTML = renderNoMoreList(noMoreItems);

  renderAllRevisionsSection();

  /* Global history */
  globalHistoryList.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
  const latest50 = globalHistoryList.slice(0, 50);
  document.getElementById('globalHistoryBadge').textContent = latest50.length;
  document.getElementById('historyContent').innerHTML = renderGlobalHistoryList(latest50);

  renderBackupReminder();
}

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
 * 3. SECTION LIST RENDERERS
 * ==========================================================================*/

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
        <span data-countdown-until="${data.nextDueAt || ''}"
              class="text-[11px] px-2.5 py-0.5 rounded-full font-semibold ${getStatusBadgeClass(data.nextDueAt)}">
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
          <span class="font-bold text-sm text-slate-100 flex items-center gap-2">
            ${escapeHtml(rev.title)}
            ${isLeech(data) ? `<span title="You are repeatedly struggling with this. Consider rewriting these notes." class="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider"><i class="fa-solid fa-droplet"></i> Leech</span>` : ''}
          </span>
          <span ${data.nextDueAt ? `data-countdown-until="${data.nextDueAt}"` : ''}
                class="text-xs px-2.5 py-0.5 rounded-full font-semibold ${getSubjectCurrentStateClass(data)}">
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
 * 4. STATUS TEXT & BADGES
 * ==========================================================================*/

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

function getStatusBadgeClass(nextDueAt) {
  if (!nextDueAt) return 'bg-slate-800 text-slate-400';
  return new Date(nextDueAt).getTime() < Date.now()
    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
    : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
}

function getSubjectCurrentStateText(data) {
  const neverStarted = data.completedCount === 0 && (!data.history || data.history.length === 0) && !data.nextDueAt;
  if (neverStarted) return 'NOT STARTED';
  if (data.completedCount > 0 && !data.nextDueAt) return 'NO MORE REVISION';
  if (data.nextDueAt) return formatStatusText(data.nextDueAt);
  return 'NOT STARTED';
}

function getSubjectCurrentStateClass(data) {
  const neverStarted = data.completedCount === 0 && (!data.history || data.history.length === 0) && !data.nextDueAt;
  if (neverStarted) return 'bg-slate-800 text-slate-400 border border-slate-700/50';
  if (data.completedCount > 0 && !data.nextDueAt) return 'bg-slate-800 text-emerald-400 border border-emerald-500/30';
  if (data.nextDueAt) return getStatusBadgeClass(data.nextDueAt);
  return 'bg-slate-800 text-slate-400';
}

/* ==========================================================================
 * 5. SEARCH
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

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.add('hidden');
    }
  });
}

/* ==========================================================================
 * 6. THEME & UI HELPERS
 * ==========================================================================*/

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeButtonLabel(next);

  const f = document.getElementById('subjectIframe');
  if (f && f.src) f.src = f.src.replace(/#theme=[^#]*/, '#theme=' + next);
}

function updateThemeButtonLabel(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.innerHTML = theme === 'dark'
    ? `<i class="fa-solid fa-moon text-indigo-400"></i> Dark Theme`
    : `<i class="fa-solid fa-sun text-amber-500"></i> Light Theme`;
}

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

function updateLiveClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const now = new Date();
  el.textContent =
    `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function tickCountdowns() {
  document.querySelectorAll('[data-countdown-until]').forEach(el => {
    const until = el.getAttribute('data-countdown-until');
    if (!until) return;
    el.textContent = formatStatusText(until);
    
    const shouldBeOverdue = new Date(until).getTime() < Date.now();
    const isOverdue       = el.classList.contains('text-rose-400');

    if (shouldBeOverdue && !isOverdue) {
      el.classList.remove('bg-indigo-500/10', 'text-indigo-400', 'border-indigo-500/20');
      el.classList.add   ('bg-rose-500/10',   'text-rose-400',   'border-rose-500/20');
    } else if (!shouldBeOverdue && isOverdue) {
      el.classList.remove('bg-rose-500/10',   'text-rose-400',   'border-rose-500/20');
      el.classList.add   ('bg-indigo-500/10', 'text-indigo-400', 'border-indigo-500/20');
    }
  });
}

/* ==========================================================================
 * 7. BACKUP & SETTINGS UI
 * ==========================================================================*/

function renderBackupReminder() {
  const banner = document.getElementById('backupReminderBanner');
  if (!banner) return;

  if (typeof isBackupReminderDue !== 'function' || !isBackupReminderDue()) {
    banner.classList.add('hidden'); banner.innerHTML = ''; return;
  }
  if (sessionStorage.getItem('backupReminderDismissed') === '1') {
    banner.classList.add('hidden'); banner.innerHTML = ''; return;
  }

  const s = appData.settings || {};
  let reason = !s.lastBackupAt ? 'You have never exported a backup.' : `Last export: ${formatDateDisplay(s.lastBackupAt)}.`;

  banner.innerHTML = `
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs">
      <i class="fa-solid fa-shield-halved text-amber-400 text-base shrink-0"></i>
      <div class="flex-1">
        <div class="font-bold text-amber-300">Backup reminder</div>
        <div class="text-slate-300 mt-0.5">${escapeHtml(reason)} localStorage is not durable — export to protect against device loss.</div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <button onclick="exportBackup(); sessionStorage.setItem('backupReminderDismissed','1');"
                class="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold px-3 py-1.5 rounded-lg border border-amber-500/40 transition">
          Export Now
        </button>
        <button onclick="sessionStorage.setItem('backupReminderDismissed','1'); renderBackupReminder();"
                class="text-slate-400 hover:text-white px-2 py-1.5 transition">
          Dismiss
        </button>
      </div>
    </div>`;
  banner.classList.remove('hidden');
}

function renderSettingsBackupStatus() {
  const status = document.getElementById('backupStatusText');
  const restoreBtn = document.getElementById('restoreSnapshotBtn');
  const select = document.getElementById('backupReminderSelect');
  
  const s = appData.settings || {};

  if (status) {
    if (s.lastBackupAt) {
      const days = Math.floor((Date.now() - new Date(s.lastBackupAt).getTime()) / 86400000);
      status.textContent = `Last export: ${formatDateDisplay(s.lastBackupAt)} (${days} day${days === 1 ? '' : 's'} ago)`;
    } else {
      status.textContent = 'Never exported.';
    }
  }

  if (select) select.value = String(s.backupReminderDays || 0);

  // Smart Intervals
  const intervals = s.smartIntervals || { again: 8, hard: 24, good: 48, easy: 96 };
  const elAgain = document.getElementById('intAgain');
  const elHard = document.getElementById('intHard');
  const elGood = document.getElementById('intGood');
  const elEasy = document.getElementById('intEasy');
  
  if (elAgain) elAgain.value = intervals.again;
  if (elHard) elHard.value = intervals.hard;
  if (elGood) elGood.value = intervals.good;
  if (elEasy) elEasy.value = intervals.easy;

  // Daily Targets
  const elTargetCount = document.getElementById('targetCount');
  const elEnableTimer = document.getElementById('enableTimer');
  const elTargetMinutes = document.getElementById('targetMinutes');
  const elTimerConfig = document.getElementById('timerTargetConfig');

  if (elTargetCount) elTargetCount.value = s.dailyTargetCount || 5;
  if (elEnableTimer) elEnableTimer.checked = !!s.studyTimerEnabled;
  if (elTargetMinutes) elTargetMinutes.value = s.dailyTargetMinutes || 60;
  if (elTimerConfig) {
    if (s.studyTimerEnabled) elTimerConfig.classList.remove('hidden');
    else elTimerConfig.classList.add('hidden');
  }

  if (restoreBtn) {
    const hasSnapshot = !!localStorage.getItem(SNAPSHOT_KEY);
    restoreBtn.classList.toggle('hidden', !hasSnapshot);
    if (hasSnapshot) {
      try {
        const snap = JSON.parse(localStorage.getItem(SNAPSHOT_KEY));
        restoreBtn.textContent = `Restore Pre-Import Snapshot (${formatDateDisplay(snap.savedAt)})`;
      } catch (_) {
        restoreBtn.textContent = 'Restore Pre-Import Snapshot';
      }
    }
  }
}

function updateDailyTargets() {
  const elCount = document.getElementById('targetCount');
  const elEnable = document.getElementById('enableTimer');
  const elMins = document.getElementById('targetMinutes');
  
  if (!elCount || !elEnable || !elMins) return;
  
  const count = Number(elCount.value) || 5;
  const enabled = elEnable.checked;
  const mins = Number(elMins.value) || 60;

  appData.settings = appData.settings || {};
  appData.settings.dailyTargetCount = count;
  appData.settings.studyTimerEnabled = enabled;
  appData.settings.dailyTargetMinutes = mins;
  
  saveStorage();
  
  const elTimerConfig = document.getElementById('timerTargetConfig');
  if (elTimerConfig) {
    if (enabled) elTimerConfig.classList.remove('hidden');
    else elTimerConfig.classList.add('hidden');
  }

  renderDashboard();
}

/* ==========================================================================
 * 8. NETWORK & PWA
 * ==========================================================================*/

function updateConnectionStatus() {
  const el = document.getElementById('networkIndicator');
  if (!el) return;
  if (navigator.onLine) {
    el.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 transition-colors duration-300';
    el.title = 'Online';
  } else {
    el.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 transition-colors duration-300';
    el.title = 'Offline — changes saved locally';
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') {
    console.info('[App] file:// detected — PWA disabled.');
    return;
  }

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('service-worker.js');
      setInterval(() => reg.update(), 15 * 60 * 1000);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });

    } catch (err) {
      console.warn('Service worker registration skipped:', err.message);
    }
  });
}

function showUpdateBanner(worker) {
  const banner = document.getElementById('updateBanner');
  if (!banner) return;
  banner.classList.remove('hidden');
  
  const btn = document.getElementById('updateReloadBtn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    newBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...';
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
}

/* ==========================================================================
 * 9. BOOTSTRAP
 * ==========================================================================*/

window.addEventListener('DOMContentLoaded', () => {
  loadStorage();
  renderRecentViews();
  setupQuickSearch();
  renderDashboard();
  renderBackupReminder();

  // Phase 9: Handle Initial Route
  const initialHash = window.location.hash.replace('#', '');
  if (initialHash) {
    const parts = initialHash.split('/');
    if (parts[0] === 'subject' && parts[1]) {
      navigateToView('subject', parts[1], true);
    } else if (['analytics', 'calendar'].includes(parts[0])) {
      navigateToView(parts[0], null, true);
    }
  }

  // Phase 9: Handle Browser Back/Forward Buttons
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (!hash) {
      if (currentSubjectId !== null) navigateToView('dashboard', null, true);
      return;
    }
    const parts = hash.split('/');
    const view = parts[0];
    const id = parts[1];
    
    if (view === 'subject' && id) {
      if (currentSubjectId !== id) navigateToView('subject', id, true);
    } else if (['dashboard', 'analytics', 'calendar'].includes(view)) {
      // Only navigate if the view isn't already active to prevent loops
      const viewEl = document.getElementById(`${view}View`);
      if (viewEl && viewEl.classList.contains('hidden')) {
        navigateToView(view, null, true);
      }
    }
  });

  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  setInterval(() => {
    if (document.hidden) return;
    if (document.getElementById('dashboardView').classList.contains('hidden')) return;
    tickCountdowns();
  }, 1000);

  setInterval(() => {
    if (document.hidden) return;
    if (document.getElementById('dashboardView').classList.contains('hidden')) return;
    renderDashboard();
  }, 30000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !document.getElementById('dashboardView').classList.contains('hidden')) {
      renderDashboard();
    }
  });

  window.addEventListener('online', updateConnectionStatus);
  window.addEventListener('offline', updateConnectionStatus);
  updateConnectionStatus();

  const versionEl = document.getElementById('appVersionDisplay');
  if (versionEl) versionEl.textContent = `v${APP_VERSION}`;

  registerServiceWorker();
});