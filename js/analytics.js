/* ============================================================================
 * analytics.js — Performance Analytics (Phase 5)
 * ==========================================================================*/

function renderAnalytics() {
  const container = document.getElementById('analyticsView');
  if (!container) return;

  let totalRevisions = 0;
  let totalRatings = 0;
  const ratingCounts = { again: 0, hard: 0, good: 0, easy: 0 };
  
  const subjectStats = [];
  const strugglingSubjects = [];
  const overdueSubjects = [];

  const nowTime = Date.now();

  REVISIONS.forEach(rev => {
    const data = appData.revisions[rev.id] || { completedCount: 0, nextDueAt: null, history: [] };
    const count = data.completedCount || 0;
    totalRevisions += count;

    // 1. Gather Ratings
    let lowRecallCount = 0;
    let lastRating = null;

    (data.history || []).forEach(h => {
      if (h.recall && ratingCounts[h.recall] !== undefined) {
        ratingCounts[h.recall]++;
        totalRatings++;
        if (!lastRating) lastRating = h.recall; // history is newest first
        if (h.recall === 'again' || h.recall === 'hard') {
          lowRecallCount++;
        }
      }
    });

    // 2. Overdue Check
    if (data.nextDueAt && new Date(data.nextDueAt).getTime() < nowTime) {
      overdueSubjects.push({ rev, data });
    }

    // 3. Struggling Check (3+ low ratings)
    if (lowRecallCount >= 3) {
      strugglingSubjects.push({ rev, count: lowRecallCount });
    }

    // 4. Table Data
    subjectStats.push({
      rev,
      count,
      statusText: getSubjectCurrentStateText(data),
      statusClass: getSubjectCurrentStateClass(data),
      lastRating
    });
  });

  // Sort table by most revised
  subjectStats.sort((a, b) => b.count - a.count);

  // --- Build HTML ---
  let html = `
    <div class="flex items-center justify-between bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 mb-6">
      <div class="flex items-center gap-3">
        <i class="fa-solid fa-chart-pie text-indigo-400 text-lg"></i>
        <h2 class="text-lg font-bold text-white">Performance Analytics</h2>
      </div>
      <button onclick="navigateToView('dashboard')" class="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2 rounded-xl transition border border-slate-700/50">
        <i class="fa-solid fa-arrow-left"></i> Back
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <!-- RECALL DISTRIBUTION -->
      <div class="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-5 shadow-sm space-y-4">
        <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-brain text-indigo-400"></i> Recall Ratings
        </h3>
        ${totalRatings === 0 ? `
          <div class="text-xs text-slate-500 italic py-4">No self-test ratings recorded yet. Use the Self-Test button on a subject page to start tracking recall.</div>
        ` : `
          <div class="text-xs text-slate-400 mb-4">Based on <strong>${totalRatings}</strong> rated sessions.</div>
          <div class="space-y-3">
            <div class="flex items-center justify-between text-xs">
              <span class="text-rose-400 font-bold w-12">AGAIN</span>
              <div class="flex-1 mx-3 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-rose-500 rounded-full" style="width: ${(ratingCounts.again / totalRatings) * 100}%"></div>
              </div>
              <span class="text-slate-300 font-medium w-16 text-right">${ratingCounts.again} times</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-amber-400 font-bold w-12">HARD</span>
              <div class="flex-1 mx-3 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-amber-500 rounded-full" style="width: ${(ratingCounts.hard / totalRatings) * 100}%"></div>
              </div>
              <span class="text-slate-300 font-medium w-16 text-right">${ratingCounts.hard} times</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-indigo-400 font-bold w-12">GOOD</span>
              <div class="flex-1 mx-3 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-indigo-500 rounded-full" style="width: ${(ratingCounts.good / totalRatings) * 100}%"></div>
              </div>
              <span class="text-slate-300 font-medium w-16 text-right">${ratingCounts.good} times</span>
            </div>
            <div class="flex items-center justify-between text-xs">
              <span class="text-emerald-400 font-bold w-12">EASY</span>
              <div class="flex-1 mx-3 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div class="h-full bg-emerald-500 rounded-full" style="width: ${(ratingCounts.easy / totalRatings) * 100}%"></div>
              </div>
              <span class="text-slate-300 font-medium w-16 text-right">${ratingCounts.easy} times</span>
            </div>
          </div>
        `}
      </div>

      <!-- ATTENTION NEEDED -->
      <div class="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-5 shadow-sm space-y-4 flex flex-col">
        <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-triangle-exclamation text-rose-400"></i> Attention Needed
        </h3>
        
        <div class="flex-1 space-y-4">
          <!-- Struggling -->
          <div>
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Repeated Low Recall (3+ HARD/AGAIN)</div>
            ${strugglingSubjects.length === 0 ? `
              <div class="text-xs text-slate-500 italic">None. Good job!</div>
            ` : `
              <div class="flex flex-wrap gap-2">
                ${strugglingSubjects.map(s => `
                  <button onclick="navigateToView('subject', '${s.rev.id}')" class="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition">
                    ${escapeHtml(s.rev.title)} (${s.count})
                  </button>
                `).join('')}
              </div>
            `}
          </div>

          <!-- Overdue -->
          <div>
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Currently Overdue</div>
            ${overdueSubjects.length === 0 ? `
              <div class="text-xs text-slate-500 italic">Nothing overdue.</div>
            ` : `
              <div class="flex flex-wrap gap-2">
                ${overdueSubjects.map(s => `
                  <button onclick="navigateToView('subject', '${s.rev.id}')" class="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-semibold transition">
                    ${escapeHtml(s.rev.title)}
                  </button>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    </div>

    <!-- ALL SUBJECTS TABLE -->
    <div class="bg-slate-900/80 rounded-2xl border border-slate-800/80 shadow-sm overflow-hidden">
      <div class="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between">
        <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-list-check text-emerald-400"></i> Revision Activity
        </h3>
        <span class="text-xs text-slate-400">Total: <strong>${totalRevisions}</strong> revisions across all subjects</span>
      </div>
      
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-950/50 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800/80">
              <th class="p-3 font-bold">Subject</th>
              <th class="p-3 font-bold text-center">Revisions</th>
              <th class="p-3 font-bold text-center">Last Rating</th>
              <th class="p-3 font-bold text-right">Status</th>
              <th class="p-3 font-bold text-center">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/50">
            ${subjectStats.map(s => `
              <tr class="hover:bg-slate-800/20 transition">
                <td class="p-3 text-xs font-bold text-slate-200 flex items-center justify-between gap-2">
                  ${escapeHtml(s.rev.title)}
                  <button onclick="clearSubjectHistory('${s.rev.id}')" title="Clear history for this subject" class="text-slate-600 hover:text-rose-400 transition">
                    <i class="fa-solid fa-trash-can text-[10px]"></i>
                  </button>
                </td>
                <td class="p-3 text-xs text-center font-mono text-slate-300">${s.count}</td>
                <td class="p-3 text-center">
                  ${s.lastRating ? `
                    <span class="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                      s.lastRating === 'again' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                      s.lastRating === 'hard' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      s.lastRating === 'good' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }">${s.lastRating}</span>
                  ` : `<span class="text-[10px] text-slate-600">-</span>`}
                </td>
                <td class="p-3 text-right">
                  <span class="text-[10px] px-2 py-0.5 rounded-full font-semibold ${s.statusClass}">${s.statusText}</span>
                </td>
                <td class="p-3 text-center">
                  <button onclick="navigateToView('subject', '${s.rev.id}')" class="text-xs text-indigo-400 hover:text-indigo-300 font-bold bg-indigo-500/10 hover:bg-indigo-500/20 px-2 py-1 rounded transition">
                    OPEN
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function clearSubjectHistory(subjectId) {
  const rev = REVISIONS.find(r => r.id === subjectId);
  if (!rev) return;
  
  if (!confirm(`Clear ALL revision history and counts for "${rev.title}"?\n\nThis will remove all completions, ratings, and study time for this subject only.`)) return;
  
  appData.revisions[subjectId].history = [];
  appData.revisions[subjectId].completedCount = 0;
  appData.revisions[subjectId].nextDueAt = null;
  
  saveStorage();
  renderAnalytics();
}
