/* ============================================================================
 * storage.js — Shared utilities · App state · localStorage persistence
 * ----------------------------------------------------------------------------
 * Loaded FIRST (after manifest.js). Exposes:
 *   • Small helpers used everywhere: pad(), escapeHtml(), formatDateDisplay()
 *   • Global mutable state: appData, currentSubjectId, activeModalSubjectId,
 *     selectedScheduleOption, allRevisionsSearchQuery
 *   • Storage layer: loadStorage(), saveStorage(), initDefaultData()
 *   • Backup / restore: exportBackup(), importBackup()
 *   • Danger-zone resets: resetComments(), resetCounts(), resetHistory(),
 *     masterReset()
 * ==========================================================================*/

/* ==========================================================================
 * 1. SHARED UTILITIES
 * ==========================================================================*/

/**
 * Zero-pad a number to 2 digits.  pad(7) → "07"
 */
function pad(num) {
  return String(num).padStart(2, '0');
}

/**
 * Escape user-supplied text before injecting it into innerHTML.
 * ALWAYS use this around anything that came from localStorage / user input.
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

/**
 * Format an ISO date string as "DD/MM/YYYY HH:MM" for display.
 * Returns '--' if the input is falsy or unparseable.
 */
function formatDateDisplay(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '--';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ==========================================================================
 * 2. GLOBAL APP STATE
 * --------------------------------------------------------------------------
 * Declared here so that main.js and revision.js (loaded later) can reference
 * them without ordering headaches. `let` at the top level of a classic script
 * shares the global lexical environment across all classic scripts on the page.
 * ==========================================================================*/

/**
 * The entire persisted application state.
 * Shape:
 * {
 *   version: 1,
 *   revisions: { [subjectId]: { nextDueAt, completedCount, history[], comments[] } },
 *   lastAction: null | { revisionId, previousCompletedCount, previousHistory,
 *                        previousNextDueAt, action },
 *   recentViews: string[]   // MRU list of subject ids, max 5
 * }
 */
let appData = {
  version: 1,
  revisions: {},
  lastAction: null,
  recentViews: []
};

/** Currently-open subject id (null when on the dashboard). */
let currentSubjectId = null;

/** Subject id whose ⋮ modal is open (for the comment editor). */
let activeModalSubjectId = null;

/** Bottom-bar schedule choice on the subject page: '24h' | '48h' | 'custom' | null. */
let selectedScheduleOption = null;

/** Live search string for the "ALL REVISIONS" section (lowercase). */
let allRevisionsSearchQuery = '';

/* ==========================================================================
 * 3. STORAGE KEYS
 * ==========================================================================*/

const STORAGE_KEY = 'revisionTrackerData';   // main data blob
const THEME_KEY   = 'revisionTracker.theme'; // 'dark' | 'light'



/**
 * Normalise ONE revision record so callers never see missing or
 * wrong-typed fields. Used by both loadStorage() and importBackup() so a
 * partial / hand-edited / older backup can never leave the app running on
 * a record with history: undefined or completedCount: "5".
 *
 * Returns the same object reference (mutated in place), so callers can
 * write: appData.revisions[id] = backfillRevisionRecord(appData.revisions[id]);
 */
function backfillRevisionRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
  if (!Array.isArray(r.history))            r.history = [];
  if (!Array.isArray(r.comments))           r.comments = [];
  if (typeof r.completedCount !== 'number' || !isFinite(r.completedCount)) {
    r.completedCount = 0;
  }
  if (!('nextDueAt' in r))                  r.nextDueAt = null;
  return r;
}


/* ==========================================================================
 * 4. LOAD / SAVE / INIT
 * ==========================================================================*/

/**
 * Read state from localStorage (or seed a fresh state), then guarantee that
 * every subject in REVISIONS has a record. Safe to call on every page load.
 */
function loadStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    try {
      appData = JSON.parse(saved);
    } catch (e) {
      console.error('Corrupted localStorage data — re-initialising.', e);
      initDefaultData();
    }
  } else {
    initDefaultData();
  }

  // Ensure shape is valid even if a hand-edited or partial backup was imported.
  if (!appData || typeof appData !== 'object') appData = {};
  if (!appData.revisions) appData.revisions = {};
  if (!appData.recentViews) appData.recentViews = [];
  if (!('lastAction' in appData)) appData.lastAction = null;
  if (!appData.version) appData.version = 1;

  // Seed newly-added manifest subjects AND backfill older saved records
  // via the shared helper — one code path, always identical shape.
  REVISIONS.forEach(rev => {
    appData.revisions[rev.id] = backfillRevisionRecord(appData.revisions[rev.id]);
  });

  saveStorage();

  // Apply saved theme preference.
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtonLabel(savedTheme);
}

/**
 * Wipe everything and seed a clean state that covers every manifest subject.
 * Called by loadStorage() on first run, and by masterReset().
 */
function initDefaultData() {
  appData = {
    version: 1,
    revisions: {},
    lastAction: null,
    recentViews: []
  };
  REVISIONS.forEach(rev => {
    appData.revisions[rev.id] = {
      nextDueAt: null,
      completedCount: 0,
      history: [],
      comments: []
    };
  });
  saveStorage();
}

/** Persist the current appData to localStorage. */
function saveStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (e) {
    // Most commonly: QuotaExceededError (unlikely here) or private-mode block.
    console.error('Failed to save to localStorage:', e);
  }
}

/* ==========================================================================
 * 5. BACKUP — EXPORT / IMPORT
 * ==========================================================================*/

/** Download the entire appData as a pretty-printed JSON file. */
function exportBackup() {
  const jsonStr = JSON.stringify(appData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = `${pad(now.getDate())}-${pad(now.getMonth() + 1)}-${now.getFullYear()}`;

  const a = document.createElement('a');
  a.href = url;
  a.download = `revision-tracker-backup-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Restore state from a user-picked .json file.
 * After replacing appData we re-seed missing manifest subjects and re-render,
 * so importing a partial/old backup can never crash the dashboard.
 */
function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    let parsed;
    try {
      parsed = JSON.parse(evt.target.result);
    } catch (err) {
      alert('Could not parse JSON file: ' + err.message);
      return;
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.revisions) {
      alert('This does not look like a Revision Tracker backup.');
      return;
    }

    // Refuse silently importing a backup from a newer schema version.
    // (Current schema is v1; older backups without a version field are
    // treated as v1 and pass through.)
    if (parsed.version && parsed.version > 1) {
      if (!confirm(
        `This backup was created by a newer version (v${parsed.version}).\n` +
        `Your app is v1. Import anyway? Unknown fields will be ignored.`
      )) return;
    }

    if (!confirm('Replace ALL current tracking data with the imported backup?')) {
      return;
    }

    appData = parsed;

    // Defensive: even though we checked parsed.revisions above, it could be
    // a non-object (e.g. a string) that passed the truthy check.
    if (!appData.revisions || typeof appData.revisions !== 'object' || Array.isArray(appData.revisions)) {
      appData.revisions = {};
    }
    if (!Array.isArray(appData.recentViews)) appData.recentViews = [];
    if (!('lastAction' in appData))          appData.lastAction = null;

    // Seed missing subjects AND backfill existing ones — same helper as
    // loadStorage(), so import can never leave a broken record shape.
    REVISIONS.forEach(rev => {
      appData.revisions[rev.id] = backfillRevisionRecord(appData.revisions[rev.id]);
    });
    saveStorage();

    closeModal('settingsModal');
    renderRecentViews();
    renderDashboard();
    alert('Backup restored successfully.');
  };

  reader.readAsText(file);
  // Allow re-selecting the same file later.
  event.target.value = '';
}

/* ==========================================================================
 * 6. DANGER ZONE — GRANULAR RESETS
 * ==========================================================================*/

/** Delete every comment on every subject. History & counts are untouched. */
function resetComments() {
  if (!confirm('Delete ALL comments across every subject? History and counts are preserved.')) return;
  REVISIONS.forEach(r => {
    if (appData.revisions[r.id]) appData.revisions[r.id].comments = [];
  });
  saveStorage();
  alert('All comments have been cleared.');
}

/** Set completedCount to 0 for every subject. History & comments untouched. */
function resetCounts() {
  if (!confirm('Reset the completion counter to 0 for ALL subjects?')) return;
  REVISIONS.forEach(r => {
    if (appData.revisions[r.id]) appData.revisions[r.id].completedCount = 0;
  });
  saveStorage();
  renderDashboard();
  alert('Completion counts have been reset.');
}

/** Clear the history log for every subject. */
function resetHistory() {
  if (!confirm('Clear the entire revision history for ALL subjects?')) return;
  REVISIONS.forEach(r => {
    if (appData.revisions[r.id]) appData.revisions[r.id].history = [];
  });
  saveStorage();
  renderDashboard();
  alert('History has been cleared.');
}

/** Nuclear option: wipe everything and reseed. Requires typing "RESET". */
function masterReset() {
  if (!confirm('MASTER RESET — this erases ALL application data. Continue?')) return;
  const typed = prompt("Type RESET (all caps) to confirm:");
  if (typed !== 'RESET') {
    alert('Master reset cancelled — the word did not match.');
    return;
  }
  initDefaultData();
  renderRecentViews();
  renderDashboard();
  closeModal('settingsModal');
  alert('Master reset complete. Everything is back to a fresh state.');
}