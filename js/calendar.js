/* ============================================================================
 * calendar.js — Monthly Calendar View (Phase 7)
 * ==========================================================================*/

let calCurrentDate = new Date(); // Tracks the currently viewed month/year
let calSelectedDate = null;      // Format: "YYYY-MM-DD"

// Helper: Format a Date object to a local YYYY-MM-DD string
function getLocalDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function renderCalendar() {
  const container = document.getElementById('calendarView');
  if (!container) return;

  const year = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  const todayStr = getLocalDateString(new Date());

  // Setup Month Navigation Header
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  // Get first day of month and total days
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Map revisions to dates for quick lookup
  const dateMap = {}; // { "YYYY-MM-DD": [ {rev, data, isOverdue}, ... ] }
  const now = new Date();

  REVISIONS.forEach(rev => {
    const data = appData.revisions[rev.id] || { nextDueAt: null };
    if (data.nextDueAt) {
      const dueDate = new Date(data.nextDueAt);
      const dateStr = getLocalDateString(dueDate);
      
      if (!dateMap[dateStr]) dateMap[dateStr] = [];
      dateMap[dateStr].push({
        rev,
        data,
        isOverdue: dueDate.getTime() < now.getTime(),
        time: dueDate
      });
    }
  });

  // Build Calendar Grid
  let gridHtml = '';
  
  // Empty cells for days before the 1st
  for (let i = 0; i < firstDay; i++) {
    gridHtml += `<div class="p-2 border border-slate-800/50 bg-slate-900/20"></div>`;
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === calSelectedDate;
    const items = dateMap[dateStr] || [];

    // Styling based on state
    let cellClass = "p-2 min-h-[80px] border border-slate-800/50 cursor-pointer transition flex flex-col items-center sm:items-start ";
    if (isSelected) cellClass += "bg-indigo-600/20 border-indigo-500 ";
    else if (isToday) cellClass += "bg-slate-800 border-slate-600 ";
    else cellClass += "bg-slate-900/50 hover:bg-slate-800/80 ";

    gridHtml += `
      <div onclick="selectCalendarDate('${dateStr}')" class="${cellClass}">
        <div class="flex justify-between w-full mb-1">
          <span class="text-xs font-bold ${isToday ? 'text-indigo-400' : 'text-slate-300'}">${day}</span>
          ${items.length > 0 ? `<span class="text-[9px] bg-slate-700 text-slate-300 px-1.5 rounded-full font-bold">${items.length}</span>` : ''}
        </div>
        <div class="flex flex-wrap gap-1 mt-auto">
          ${items.slice(0, 4).map(i => `
            <div class="w-1.5 h-1.5 rounded-full ${i.isOverdue ? 'bg-rose-500' : 'bg-indigo-500'}"></div>
          `).join('')}
          ${items.length > 4 ? `<div class="w-1.5 h-1.5 rounded-full bg-slate-500"></div>` : ''}
        </div>
      </div>
    `;
  }

  // Render Selected Date Panel
  let panelHtml = '';
  if (calSelectedDate) {
    const items = (dateMap[calSelectedDate] || []).sort((a, b) => a.time - b.time);
    const [y, m, d] = calSelectedDate.split('-');
    const displayDate = `${d}/${m}/${y}`;

    panelHtml = `
      <div class="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-4 shadow-sm space-y-4">
        <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <i class="fa-solid fa-calendar-check text-indigo-400"></i> ${displayDate}
        </h3>
        ${items.length === 0 ? `
          <div class="text-xs text-slate-500 italic py-2">No revisions scheduled.</div>
        ` : `
          <div class="space-y-2">
            ${items.map(i => `
              <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition">
                <div class="flex flex-col">
                  <span class="font-bold text-xs text-slate-200">${escapeHtml(i.rev.title)}</span>
                  <span class="text-[10px] ${i.isOverdue ? 'text-rose-400' : 'text-indigo-400'} font-semibold mt-0.5">
                    ${i.isOverdue ? 'Overdue' : 'Scheduled'} at ${pad(i.time.getHours())}:${pad(i.time.getMinutes())}
                  </span>
                </div>
                <button onclick="navigateToView('subject', '${i.rev.id}')" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition">OPEN</button>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }

  // Final Layout
  container.innerHTML = `
    <div class="flex items-center justify-between bg-slate-900/80 p-4 rounded-2xl border border-slate-800/80 mb-6">
      <div class="flex items-center gap-3">
        <i class="fa-solid fa-calendar-days text-indigo-400 text-lg"></i>
        <h2 class="text-lg font-bold text-white">Calendar</h2>
      </div>
      <button onclick="navigateToView('dashboard')" class="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 px-3.5 py-2 rounded-xl transition border border-slate-700/50">
        <i class="fa-solid fa-arrow-left"></i> Back
      </button>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Calendar Grid -->
      <div class="lg:col-span-2 bg-slate-900/80 rounded-2xl border border-slate-800/80 shadow-sm overflow-hidden">
        <div class="flex items-center justify-between p-4 border-b border-slate-800/80">
          <button onclick="changeCalendarMonth(-1)" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"><i class="fa-solid fa-chevron-left"></i></button>
          <div class="font-bold text-white tracking-wide">${monthNames[month]} ${year}</div>
          <button onclick="changeCalendarMonth(1)" class="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
        
        <div class="grid grid-cols-7 bg-slate-950/50 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-center border-b border-slate-800/80">
          <div class="p-2">Sun</div>
          <div class="p-2">Mon</div>
          <div class="p-2">Tue</div>
          <div class="p-2">Wed</div>
          <div class="p-2">Thu</div>
          <div class="p-2">Fri</div>
          <div class="p-2">Sat</div>
        </div>

        <div class="grid grid-cols-7 gap-px bg-slate-800/50">
          ${gridHtml}
        </div>
      </div>

      <!-- Selected Date Panel -->
      <div class="lg:col-span-1">
        ${panelHtml || `
          <div class="bg-slate-900/80 rounded-2xl border border-slate-800/80 p-6 shadow-sm flex flex-col items-center justify-center text-center h-full min-h-[200px]">
            <i class="fa-regular fa-calendar text-4xl text-slate-700 mb-3"></i>
            <div class="text-sm text-slate-400 font-medium">Select a date on the calendar to view scheduled subjects.</div>
          </div>
        `}
      </div>
    </div>
  `;
}

function changeCalendarMonth(offset) {
  calCurrentDate.setMonth(calCurrentDate.getMonth() + offset);
  // Reset selected date to avoid confusion when changing months
  calSelectedDate = null;
  renderCalendar();
}

function selectCalendarDate(dateStr) {
  calSelectedDate = dateStr;
  renderCalendar();
}