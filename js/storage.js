/* ============================================================================
 * storage.js — Shared utilities · App state · localStorage persistence
 * ==========================================================================*/

/* ==========================================================================
 * 1. SHARED UTILITIES
 * ==========================================================================*/

function pad(num) {
  return String(num).padStart(2, '0');
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function formatDateDisplay(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '--';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ==========================================================================
 * 2. GLOBAL APP STATE
 * ==========================================================================*/

let appData = {
  version: 1,
  revisions: {},
  lastAction: null,
  recentViews: [],
  settings: {}
};

let currentSubjectId = null;
let activeModalSubjectId = null;
let selectedScheduleOption = null;

/** Phase 3: Active Recall */
let currentSessionRating = null;

/** Phase 6: Study Timer */
let studySession = null;

let allRevisionsSearchQuery = '';

/* ==========================================================================
 * 3. STORAGE KEYS AND CONSTANTS
 * ==========================================================================*/

const STORAGE_KEY    = 'revisionTrackerData';
const THEME_KEY      = 'revisionTracker.theme';
const SNAPSHOT_KEY   = 'revisionTrackerData.preImportSnapshot';

const SCHEMA_VERSION = 1;
const MAX_BACKUP_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const BACKUP_REMINDER_OPTIONS = [0, 3, 7, 14, 30];

/* ==========================================================================
 * 4. SETTINGS AND BACKFILL
 * ==========================================================================*/

function defaultSettings() {
  return {
    // Backup
    backupReminderDays: 7,
    lastBackupAt: null,
    lastImportAt: null,
    
    // Smart Scheduling (Hours)
    smartIntervals: {
      again: 8,
      hard: 24,
      good: 48,
      easy: 96
    },
    
    // Daily Targets
    dailyTargetCount: 5,
    dailyTargetMinutes: 60,
    studyTimerEnabled: false
  };
}

function backfillSettings(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {};
  const out = { ...s };
  
  if (typeof out.backupReminderDays !== 'number' || out.backupReminderDays < 0) out.backupReminderDays = 7;
  if (!BACKUP_REMINDER_OPTIONS.includes(out.backupReminderDays)) out.backupReminderDays = 7;
  
  if (typeof out.lastBackupAt !== 'string' || isNaN(new Date(out.lastBackupAt).getTime())) out.lastBackupAt = null;
  if (typeof out.lastImportAt !== 'string' || isNaN(new Date(out.lastImportAt).getTime())) out.lastImportAt = null;

  if (!out.smartIntervals || typeof out.smartIntervals !== 'object') {
    out.smartIntervals = { again: 8, hard: 24, good: 48, easy: 96 };
  } else {
    ['again', 'hard', 'good', 'easy'].forEach(k => {
      if (typeof out.smartIntervals[k] !== 'number' || out.smartIntervals[k] <= 0) {
        out.smartIntervals[k] = { again: 8, hard: 24, good: 48, easy: 96 }[k];
      }
    });
  }

  if (typeof out.dailyTargetCount !== 'number' || out.dailyTargetCount < 0) out.dailyTargetCount = 5;
  if (typeof out.dailyTargetMinutes !== 'number' || out.dailyTargetMinutes < 0) out.dailyTargetMinutes = 60;
  if (typeof out.studyTimerEnabled !== 'boolean') out.studyTimerEnabled = false;

  return out;
}

function backfillRevisionRecord(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) r = {};
  
  if (typeof r.completedCount !== 'number' || !isFinite(r.completedCount) || r.completedCount < 0) r.completedCount = 0;
  if (!('nextDueAt' in r)) r.nextDueAt = null;
  if (r.nextDueAt !== null && isNaN(new Date(r.nextDueAt).getTime())) r.nextDueAt = null;

  if (!Array.isArray(r.history)) r.history = [];
  r.history = r.history.map(h => {
    if (!h || typeof h !== 'object') return null;
    if (!h.completedAt || isNaN(new Date(h.completedAt).getTime())) return null;
    return {
      completedAt: h.completedAt,
      scheduledFor: (h.scheduledFor && !isNaN(new Date(h.scheduledFor).getTime())) ? h.scheduledFor : null,
      action: typeof h.action === 'string' ? h.action : 'complete',
      recall: ['again', 'hard', 'good', 'easy'].includes(h.recall) ? h.recall : null,
      studyMs: typeof h.studyMs === 'number' && h.studyMs >= 0 ? h.studyMs : 0
    };
  }).filter(Boolean);

  if (!Array.isArray(r.comments)) r.comments = [];
  r.comments = r.comments.map(c => {
    if (!c || typeof c !== 'object' || !c.id || typeof c.text !== 'string') return null;
    if (!c.createdAt || isNaN(new Date(c.createdAt).getTime())) return null;
    return {
      id: String(c.id),
      text: c.text,
      createdAt: c.createdAt,
      updatedAt: (c.updatedAt && !isNaN(new Date(c.updatedAt).getTime())) ? c.updatedAt : c.createdAt
    };
  }).filter(Boolean);

  return r;
}

function backfillAppData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) data = {};
  if (typeof data.version !== 'number') data.version = 1;
  if (!data.revisions || typeof data.revisions !== 'object' || Array.isArray(data.revisions)) data.revisions = {};
  if (!Array.isArray(data.recentViews)) data.recentViews = [];
  data.recentViews = data.recentViews.filter(id => typeof id === 'string');
  if (!('lastAction' in data)) data.lastAction = null;
  if (data.lastAction && typeof data.lastAction !== 'object') data.lastAction = null;
  data.settings = backfillSettings(data.settings);
  
  REVISIONS.forEach(rev => {
    data.revisions[rev.id] = backfillRevisionRecord(data.revisions[rev.id]);
  });
  return data;
}

/* ==========================================================================
 * 5. LOAD / SAVE / INIT
 * ==========================================================================*/

function loadStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { appData = JSON.parse(saved); }
    catch (e) { console.error('Corrupted localStorage data — re-initialising.', e); initDefaultData(); }
  } else {
    initDefaultData();
  }
  
  appData = backfillAppData(appData);
  saveStorage();

  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeButtonLabel(savedTheme);
}

function initDefaultData() {
  appData = {
    version: 1,
    revisions: {},
    lastAction: null,
    recentViews: [],
    settings: defaultSettings()
  };
  REVISIONS.forEach(rev => {
    appData.revisions[rev.id] = backfillRevisionRecord({});
  });
  saveStorage();
}

function saveStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    return true;
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
    return false;
  }
}

function saveStorageOrThrow() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

/* ==========================================================================
 * 6. BACKUP REMINDER
 * ==========================================================================*/

function isBackupReminderDue() {
  const s = appData.settings || defaultSettings();
  if (!s.backupReminderDays || s.backupReminderDays <= 0) return false;
  if (!s.lastBackupAt) return true;
  const days = (Date.now() - new Date(s.lastBackupAt).getTime()) / 86400000;
  return days >= s.backupReminderDays;
}

function setBackupReminderDays(days) {
  appData.settings = appData.settings || defaultSettings();
  const n = Number(days);
  appData.settings.backupReminderDays = BACKUP_REMINDER_OPTIONS.includes(n) ? n : 7;
  saveStorage();
  if (typeof renderBackupReminder === 'function') renderBackupReminder();
  if (typeof renderSettingsBackupStatus === 'function') renderSettingsBackupStatus();
}

/* ==========================================================================
 * 7. BACKUP — EXPORT / IMPORT / VALIDATION
 * ==========================================================================*/

function exportBackup() {
  appData.settings = appData.settings || defaultSettings();
  appData.settings.lastBackupAt = new Date().toISOString();
  saveStorage();

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

  if (typeof renderBackupReminder === 'function') renderBackupReminder();
  if (typeof renderSettingsBackupStatus === 'function') renderSettingsBackupStatus();
}

function validateBackup(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, fatal: 'Backup is not a JSON object.' };
  if (parsed.version !== undefined && typeof parsed.version !== 'number') return { ok: false, fatal: 'Backup "version" field is not a number.' };
  if (!parsed.revisions || typeof parsed.revisions !== 'object' || Array.isArray(parsed.revisions)) return { ok: false, fatal: 'Backup has no valid "revisions" object.' };

  const issues = [];
  const revIds = Object.keys(parsed.revisions);
  const knownIds = new Set(REVISIONS.map(r => r.id));
  let unknownCount = 0;
  let fixableCount = 0;

  revIds.forEach(id => {
    if (!knownIds.has(id)) unknownCount++;
    const r = parsed.revisions[id];
    if (!r || typeof r !== 'object' || Array.isArray(r)) { fixableCount++; return; }
    if (r.nextDueAt != null && isNaN(new Date(r.nextDueAt).getTime())) fixableCount++;
    if (r.history !== undefined && !Array.isArray(r.history)) fixableCount++;
    if (r.comments !== undefined && !Array.isArray(r.comments)) fixableCount++;
  });

  if (unknownCount > 0) issues.push({ level: 'info', msg: `${unknownCount} subject(s) not in the current manifest — will be preserved.` });
  if (fixableCount > 0) issues.push({ level: 'fix', msg: `${fixableCount} invalid field(s) will be safely repaired.` });

  return { ok: true, issues, counts: { revIds: revIds.length, unknownCount, fixableCount } };
}

function buildImportSummary(parsed, validation) {
  const revCount = validation.counts.revIds;
  let totalCompletions = 0;
  Object.values(parsed.revisions).forEach(r => {
    if (r && typeof r.completedCount === 'number') totalCompletions += r.completedCount;
  });

  let msg = 'Import this backup?\n\n';
  msg += `• ${revCount} subject record(s)\n`;
  msg += `• ${totalCompletions} total completion(s)\n`;
  
  if (validation.issues.length > 0) {
    msg += `\nNotes:\n`;
    validation.issues.forEach(i => { msg += `  - ${i.msg}\n`; });
  }

  let currentCompletions = 0;
  Object.values(appData.revisions).forEach(r => {
    if (r && typeof r.completedCount === 'number') currentCompletions += r.completedCount;
  });
  msg += `\n⚠️ This will REPLACE all current data (you currently have ${currentCompletions} completions).\n\nA pre-import snapshot will be saved.`;
  return msg;
}

function importBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  if (file.size > MAX_BACKUP_SIZE_BYTES) { alert('Backup file is too large.'); return; }
  if (file.size === 0) { alert('Backup file is empty.'); return; }

  const reader = new FileReader();
  reader.onerror = function () { alert('Failed to read the file. Your current data is unchanged.'); };
  reader.onload = function (evt) {
    let parsed;
    try { parsed = JSON.parse(evt.target.result); }
    catch (err) { alert('Could not parse JSON file: ' + err.message); return; }

    const validation = validateBackup(parsed);
    if (!validation.ok) { alert('Import rejected — no changes were made.\n\nReason: ' + validation.fatal); return; }
    if (!confirm(buildImportSummary(parsed, validation))) return;

    const snapshot = { savedAt: new Date().toISOString(), data: JSON.parse(JSON.stringify(appData)) };
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot)); }
    catch (e) { alert('Could not save a pre-import snapshot. Import aborted.'); return; }

    const nextData = backfillAppData(JSON.parse(JSON.stringify(parsed)));
    nextData.settings.lastImportAt = new Date().toISOString();

    const previousData = appData;
    try {
      appData = nextData;
      saveStorageOrThrow();
    } catch (e) {
      appData = previousData;
      try { saveStorageOrThrow(); } catch (_) {}
      alert('Import failed to save. Your previous data is intact.\n\nError: ' + e.message);
      return;
    }

    if (typeof renderBackupReminder === 'function') renderBackupReminder();
    closeModal('settingsModal');
    renderRecentViews();
    renderDashboard();
    alert('Backup restored successfully.');
  };
  reader.readAsText(file);
}

function restorePreImportSnapshot() {
  const raw = localStorage.getItem(SNAPSHOT_KEY);
  if (!raw) { alert('No pre-import snapshot found.'); return; }
  let snapshot;
  try { snapshot = JSON.parse(raw); } catch (e) { alert('Snapshot is corrupted.'); return; }
  if (!snapshot || !snapshot.data) { alert('Snapshot has no usable data.'); return; }

  if (!confirm(`Restore the pre-import snapshot from ${formatDateDisplay(snapshot.savedAt)}?\n\nThis will REPLACE your current data.`)) return;

  const restored = backfillAppData(JSON.parse(JSON.stringify(snapshot.data)));
  const previous = appData;
  try {
    appData = restored;
    saveStorageOrThrow();
  } catch (e) {
    appData = previous;
    try { saveStorageOrThrow(); } catch (_) {}
    alert('Restore failed to save. Your current data is intact.\n\nError: ' + e.message);
    return;
  }

  if (typeof renderBackupReminder === 'function') renderBackupReminder();
  closeModal('settingsModal');
  renderRecentViews();
  renderDashboard();
  alert('Pre-import snapshot restored.');
}

/* ==========================================================================
 * 8. DANGER ZONE — GRANULAR RESETS
 * ==========================================================================*/

function resetComments() {
  if (!confirm('Delete ALL comments across every subject? History and counts are preserved.')) return;
  REVISIONS.forEach(r => { if (appData.revisions[r.id]) appData.revisions[r.id].comments = []; });
  saveStorage();
  alert('All comments have been cleared.');
}

function resetCounts() {
  if (!confirm('Reset the completion counter to 0 for ALL subjects?')) return;
  REVISIONS.forEach(r => { if (appData.revisions[r.id]) appData.revisions[r.id].completedCount = 0; });
  saveStorage();
  renderDashboard();
  alert('Completion counts have been reset.');
}

function resetHistory() {
  if (!confirm('Clear the entire revision history for ALL subjects?')) return;
  REVISIONS.forEach(r => { if (appData.revisions[r.id]) appData.revisions[r.id].history = []; });
  saveStorage();
  renderDashboard();
  alert('History has been cleared.');
}

function masterReset() {
  if (!confirm('MASTER RESET — this erases ALL application data. Continue?')) return;
  const typed = prompt("Type RESET (all caps) to confirm:");
  if (typed !== 'RESET') { alert('Master reset cancelled — the word did not match.'); return; }
  
  initDefaultData();
  localStorage.removeItem(SNAPSHOT_KEY);
  renderRecentViews();
  renderDashboard();
  closeModal('settingsModal');
  alert('Master reset complete. Everything is back to a fresh state.');
}