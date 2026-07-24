
const API = '/api';
let tasks = [];
let allTasks = [];
let currentSort = 'default';
let selectedDate = null;
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let scheduleData = null;
let locationOpen = false;
let pendingTask = null;
let suggestedTime = null;
let chatHistory = [];
let chatOpen = false;
let unavailableDays = [];

// ── LOAD TASKS ───────────────────────────────────────────────────
async function loadTasks() {
    try {
        let url = `${API}/tasks`;
        const params = [];
        if (currentSort !== 'default') params.push(`sort=${currentSort}`);
        if (selectedDate) params.push(`date=${selectedDate}`);
        if (params.length) url += '?' + params.join('&');

        const [res, allRes] = await Promise.all([fetch(url), fetch(`${API}/tasks`)]);
        tasks = await res.json();
        allTasks = await allRes.json();

        renderTasks();
        renderCalendar();

        if (selectedDate && document.getElementById('schedule-panel').classList.contains('visible')) {
            renderScheduleView(selectedDate);
        }
    } catch (e) {
        document.getElementById('task-list').innerHTML = '<p style="color:red">Could not connect to server.</p>';
    }
}

async function sendTestDigest() {
    showToast('Sending digest email...');
    try {
        const res = await fetch(`${API}/ai/send-digest`, { method: 'POST' });
        const data = await res.json();
        if (data.error) { showToast('Error: ' + data.error); return; }
        showToast(`Digest sent! (${data.taskCount} tasks today)`);
    } catch (e) {
        showToast('Failed to send digest.');
    }
}

// ── RENDER TASKS ─────────────────────────────────────────────────
function renderTasks() {
    const list = document.getElementById('task-list');
    const today = new Date().toISOString().split('T')[0];

    document.getElementById('filter-badge-container').innerHTML = selectedDate
        ? `<div class="filter-badge">📅 ${formatDisplayDate(selectedDate)}<button onclick="clearDateFilter()">✕</button></div>`
        : '';

    document.getElementById('task-count').textContent =
        tasks.length === 0 ? 'No tasks' : `${tasks.length} Task${tasks.length !== 1 ? 's' : ''}`;

    if (tasks.length === 0) {
        list.innerHTML = `<div class="empty-state"><span>📋</span>No tasks. Add one to get started!</div>`;
        return;
    }

    list.innerHTML = tasks.map(t => {
        const isOverdue = t.due_date && t.due_date < today && t.status !== 'DONE';
        const timeStr = t.due_time ? ` at ${formatTime(t.due_time)}` : '';
        const travelInfo = t.travel_time_mins ? `🚗 ${t.travel_time_mins} min · ${t.distance_km} km` : '';
        const duration = t.duration_mins ? `⏱ ${formatDuration(t.duration_mins)}` : '';
        return `
        <div class="task-card ${t.priority}" id="card-${t.id}">
          <div class="card-title">${escHtml(t.title)}</div>
          <div class="card-desc">${escHtml(t.description || '')}</div>
          <div class="card-meta">
            <span class="badge priority-${t.priority}">${t.priority}</span>
            <span class="badge status-${t.status}">${t.status.replace('_', ' ')}</span>
            ${t.due_date ? `<span class="card-due ${isOverdue ? 'overdue' : ''}">${isOverdue ? '⚠️' : '📅'} ${formatDisplayDate(t.due_date)}${timeStr}</span>` : ''}
            ${duration ? `<span class="card-due">${duration}</span>` : ''}
            ${travelInfo ? `<span class="card-due">${travelInfo}</span>` : ''}
          </div>
          ${t.ai_suggestion ? `<div class="ai-result"><span class="ai-label">✨ AI Suggestion</span>${escHtml(t.ai_suggestion)}</div>` : ''}
          <div class="card-actions">
            <button class="btn-edit"   onclick="editTask(${t.id})">✏️ Edit</button>
            <button class="btn-delete" onclick="deleteTask(${t.id})">🗑 Delete</button>
            <button class="btn-ai"     onclick="getAISuggestion(${t.id})">✨ AI Suggest</button>
          </div>
          <div id="ai-loading-${t.id}"></div>
        </div>`;
    }).join('');
}

// ── CALENDAR ─────────────────────────────────────────────────────
function renderCalendar() {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    document.getElementById('cal-title').textContent = `${months[calMonth]} ${calYear}`;

    const tasksByDate = {};
    allTasks.forEach(t => {
        if (t.due_date) {
            if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
            tasksByDate[t.due_date].push(t);
        }
    });

    let html = days.map(d => `<div class="cal-day-label">${d}</div>`).join('');
    for (let i = 0; i < firstDay; i++) html += `<div class="cal-day empty"></div>`;

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isToday = d === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
        const isSelected = dateStr === selectedDate;
        const dayTasks = tasksByDate[dateStr] || [];
        const dots = dayTasks.slice(0, 3).map(t => `<div class="cal-dot ${t.priority}"></div>`).join('');
        const classes = ['cal-day', isToday ? 'today' : '', isSelected ? 'selected' : '', dayTasks.length ? 'has-tasks' : ''].filter(Boolean).join(' ');
        html += `<div class="${classes}" onclick="selectDate('${dateStr}')">${d}${dots ? `<div class="cal-task-dots">${dots}</div>` : ''}</div>`;
    }

    document.getElementById('cal-grid').innerHTML = html;
}

function changeMonth(dir) {
    calMonth += dir;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
}

function selectDate(dateStr) {
    if (selectedDate === dateStr) { clearDateFilter(); return; }
    selectedDate = dateStr;
    scheduleData = null;
    loadTasks();
    renderScheduleView(dateStr);
}

function clearDateFilter() {
    selectedDate = null;
    scheduleData = null;
    document.getElementById('schedule-panel').classList.remove('visible');
    loadTasks();
}

function closeSchedule() {
    document.getElementById('schedule-panel').classList.remove('visible');
}

// ── SCHEDULE VIEW ────────────────────────────────────────────────
function renderScheduleView(date) {
    const panel = document.getElementById('schedule-panel');
    const content = document.getElementById('schedule-content');
    panel.classList.add('visible');
    document.getElementById('schedule-title').textContent = `📅 ${formatDisplayDate(date)}`;

    const dateTasks = allTasks.filter(t => t.due_date === date);
    if (dateTasks.length === 0) {
        content.innerHTML = `<div class="empty-state" style="padding:24px 0"><span>📭</span>No tasks for this day.</div>`;
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }

    const scheduled = dateTasks.filter(t => t.due_time).sort((a, b) => a.due_time.localeCompare(b.due_time));
    const unscheduled = dateTasks.filter(t => !t.due_time);

    let html = scheduleData?.overview ? `<div class="schedule-overview">✨ ${escHtml(scheduleData.overview)}</div>` : '';

    if (scheduled.length > 0) {
        html += `<div class="timeline">`;
        scheduled.forEach(t => {
            const aiEntry = scheduleData?.schedule?.find(s => s.taskId === t.id);
            const reason = aiEntry?.reason || '';
            const duration = t.duration_mins ? formatDuration(t.duration_mins) : (aiEntry?.duration || '');
            const endTime = t.due_time && t.duration_mins ? formatTime(addMinutes(t.due_time, t.duration_mins)) : '';

            if (t.travel_time_mins && t.due_time) {
                html += `
            <div class="time-slot">
              <div class="time-label">${formatTime(addMinutes(t.due_time, -t.travel_time_mins))}</div>
              <div class="time-dot travel"></div>
              <div class="travel-block">🚗 Travel to ${escHtml(t.to_location || 'destination')} · ${t.travel_time_mins} min · ${t.distance_km} km</div>
            </div>`;
            }

            html += `
          <div class="time-slot">
            <div class="time-label">${formatTime(t.due_time)}</div>
            <div class="time-dot task"></div>
            <div class="schedule-task-card ${t.priority}">
              <div class="schedule-task-title">${escHtml(t.title)}</div>
              <div class="schedule-task-meta">
                <span class="badge priority-${t.priority}" style="font-size:0.68rem">${t.priority}</span>
                <span class="badge status-${t.status}"     style="font-size:0.68rem">${t.status.replace('_', ' ')}</span>
                ${duration ? `<span>⏱ ${duration}</span>` : ''}
                ${endTime ? `<span>Ends ${endTime}</span>` : ''}
              </div>
              ${reason ? `<div class="schedule-task-reason">💡 ${escHtml(reason)}</div>` : ''}
            </div>
          </div>`;
        });
        html += `</div>`;
    }

    if (unscheduled.length > 0) {
        html += `<div class="unscheduled-section"><h4>⏳ Unscheduled (${unscheduled.length})</h4>
        ${unscheduled.map(t => `
          <div class="unscheduled-card">
            <span>${escHtml(t.title)}</span>
            <span class="badge priority-${t.priority}">${t.priority}</span>
          </div>`).join('')}
      </div>`;
    }

    html += renderDayChart(dateTasks);
    content.innerHTML = html;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── DAY CHART ────────────────────────────────────────────────────
function renderDayChart(dateTasks) {
    const CHART_START = 6 * 60;
    const CHART_END = 23 * 60;
    const CHART_RANGE = CHART_END - CHART_START;

    function pct(mins) { return Math.max(0, Math.min(100, ((mins - CHART_START) / CHART_RANGE) * 100)); }
    function timeToMins(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }

    const hours = [6, 8, 10, 12, 14, 16, 18, 20, 22];
    const hourNames = ['6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'];
    const hoursHtml = hours.map((h, i) => `<div class="day-chart-hour">${hourNames[i]}</div>`).join('');

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const nowPct = pct(nowMins);
    const showNow = nowMins >= CHART_START && nowMins <= CHART_END;
    const nowHtml = showNow ? `<div class="chart-now-line" style="left:${nowPct}%"><div class="chart-now-label">Now</div></div>` : '';

    let blocksHtml = '';
    const scheduled = dateTasks.filter(t => t.due_time);
    const unscheduled = dateTasks.filter(t => !t.due_time);

    scheduled.forEach(t => {
        const start = timeToMins(t.due_time);
        const duration = t.duration_mins || 30;
        const travel = t.travel_time_mins || 0;
        const end = start + duration;

        if (travel > 0) {
            const tStart = start - travel;
            const tLeft = pct(tStart);
            const tWidth = pct(start) - tLeft;
            blocksHtml += `<div class="chart-block travel" style="left:${tLeft}%;width:${Math.max(tWidth, 1)}%" onmouseenter="showTooltipEl(event,'🚗 Travel\\n${travel} min')" onmouseleave="hideTooltip()"></div>`;
        }

        const left = pct(start);
        const width = pct(end) - left;
        blocksHtml += `
        <div class="chart-block ${t.priority}" style="left:${left}%;width:${Math.max(width, 1.5)}%"
          onmouseenter="showTooltipEl(event,'${escHtml(t.title)}\\n${formatTime(t.due_time)} → ${formatTime(addMinutes(t.due_time, duration))}\\n${formatDuration(duration)}')"
          onmouseleave="hideTooltip()">
          ${width > 4 ? `<div class="chart-block-label">${escHtml(t.title)}</div>` : ''}
        </div>`;
    });

    unscheduled.forEach((t, i) => {
        const left = 100 - (i + 1) * 3;
        blocksHtml += `<div class="chart-block unscheduled" style="left:${Math.max(left, 0)}%;width:2.5%" onmouseenter="showTooltipEl(event,'${escHtml(t.title)}\\nUnscheduled')" onmouseleave="hideTooltip()"></div>`;
    });

    return `
      <div class="day-chart">
        <div class="day-chart-title">📊 Day Overview</div>
        <div class="day-chart-hours">${hoursHtml}</div>
        <div class="day-chart-bar">${nowHtml}${blocksHtml}</div>
        <div class="chart-legend">
          <div class="legend-item"><div class="legend-dot" style="background:#ef4444"></div>High</div>
          <div class="legend-item"><div class="legend-dot" style="background:#f97316"></div>Medium</div>
          <div class="legend-item"><div class="legend-dot" style="background:#22c55e"></div>Low</div>
          <div class="legend-item"><div class="legend-dot" style="background:#94a3b8"></div>Travel</div>
          <div class="legend-item"><div class="legend-dot" style="background:#d1d5db"></div>Unscheduled</div>
        </div>
      </div>`;
}

function showTooltipEl(event, text) {
    const tip = document.getElementById('chart-tooltip');
    tip.innerHTML = text.replace(/\n/g, '<br/>');
    tip.style.display = 'block';
    tip.style.left = (event.clientX + 12) + 'px';
    tip.style.top = (event.clientY - 10) + 'px';
}
function hideTooltip() { document.getElementById('chart-tooltip').style.display = 'none'; }

// ── AI SCHEDULE ──────────────────────────────────────────────────
async function generateAISchedule() {
    if (!selectedDate) return;
    document.getElementById('schedule-content').innerHTML =
        `<div class="schedule-loading">✨ AI is building your schedule...</div>`;
    try {
        const res = await fetch(`${API}/ai/schedule`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: selectedDate })
        });
        const data = await res.json();
        if (data.error) {
            document.getElementById('schedule-content').innerHTML = `<p style="color:red">${data.error}</p>`;
            return;
        }
        scheduleData = data;
        showToast('AI schedule generated!');
        await loadTasks();
    } catch (e) {
        document.getElementById('schedule-content').innerHTML = `<p style="color:red">Failed.</p>`;
    }
}

// ── CHAT ─────────────────────────────────────────────────────────
function toggleChat() {
    chatOpen = !chatOpen;
    document.getElementById('chat-panel').classList.toggle('open', chatOpen);
}

function clearChat() {
    chatHistory = [];
    document.getElementById('chat-messages').innerHTML = `
      <div class="chat-message ai">
        <div class="chat-label">AI Assistant</div>
        <div class="chat-bubble">Chat cleared. How can I help?</div>
      </div>`;
}

function sendSuggestion(el) {
    document.getElementById('chat-input').value = el.textContent;
    sendChat();
}

async function sendChat() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    if (!message) return;
    input.value = '';

    const messages = document.getElementById('chat-messages');

    // Add user message
    messages.innerHTML += `
      <div class="chat-message user">
        <div class="chat-label">You</div>
        <div class="chat-bubble">${escHtml(message)}</div>
      </div>`;

    // Show typing indicator
    const typingId = 'typing-' + Date.now();
    messages.innerHTML += `<div class="chat-typing" id="${typingId}">AI is thinking...</div>`;
    messages.scrollTop = messages.scrollHeight;

    try {
        const res = await fetch(`${API}/ai/chat`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, history: chatHistory })
        });
        const data = await res.json();

        document.getElementById(typingId)?.remove();

        if (data.error) {
            messages.innerHTML += `<div class="chat-message ai"><div class="chat-bubble" style="color:red">${data.error}</div></div>`;
            return;
        }

        const isAction = data.actions && data.actions.length > 0;

        messages.innerHTML += `
        <div class="chat-message ai ${isAction ? 'action' : ''}">
          <div class="chat-label">AI Assistant${isAction ? ' · Made changes' : ''}</div>
          <div class="chat-bubble">${escHtml(data.reply)}</div>
        </div>`;

        // Update conversation history
        chatHistory.push({ role: 'user', content: message });
        chatHistory.push({ role: 'assistant', content: data.reply });

        // Keep history to last 10 exchanges
        if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

        // Reload tasks if AI made changes
        if (data.changed) {
            showToast('AI updated your tasks!');
            await loadTasks();
        }

    } catch (e) {
        document.getElementById(typingId)?.remove();
        messages.innerHTML += `<div class="chat-message ai"><div class="chat-bubble" style="color:red">Failed to connect.</div></div>`;
    }

    messages.scrollTop = messages.scrollHeight;
}

// ── WEEK PLANNER STATE ──────────────────────────────────────────
let selectedWeekStart = getMonday(new Date());

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d.toISOString().split('T')[0];
}

function shiftWeek(offset) {
    const d = new Date(selectedWeekStart + 'T00:00:00');
    d.setDate(d.getDate() + offset * 7);
    selectedWeekStart = d.toISOString().split('T')[0];
    renderWeekLabel();
}

function renderWeekLabel() {
    const start = new Date(selectedWeekStart + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const label = document.getElementById('week-range-label');
    if (label) label.textContent = `${formatDisplayDate(selectedWeekStart)} – ${formatDisplayDate(end.toISOString().split('T')[0])}`;
}

// ── WEEK PLANNER ─────────────────────────────────────────────────

function openWeekModal() {
    selectedWeekStart = getMonday(new Date());
    renderWeekLabel();
    document.getElementById('week-form-view').style.display = 'block';
    document.getElementById('week-result').classList.remove('visible');
    document.getElementById('week-modal').classList.add('visible');
}
function toggleDay(btn) {
    btn.classList.toggle('off');
    const day = btn.dataset.day;
    if (btn.classList.contains('off')) {
        unavailableDays.push(day);
    } else {
        unavailableDays = unavailableDays.filter(d => d !== day);
    }
}

let weekPlanInFlight = false;

async function buildWeek() {
    if (weekPlanInFlight) return;
    weekPlanInFlight = true;

    const hoursPerDay = parseInt(document.getElementById('week-hours').value);
    const mainGoal = document.getElementById('week-goal').value.trim() || 'Complete all tasks efficiently';

    const btn = document.querySelector('.btn-build-week');
    btn.textContent = '✨ Building your week...';
    btn.disabled = true;

    try {
        const res = await fetch(`${API}/ai/plan-week`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hoursPerDay, mainGoal, unavailableDays, weekStart: selectedWeekStart })
        });
        const data = await res.json();

        if (data.error) { showToast('Error: ' + data.error); return; }

        document.getElementById('week-form-view').style.display = 'none';
        document.getElementById('week-result').classList.add('visible');
        document.getElementById('week-overview').textContent = data.overview;
        document.getElementById('week-tip').innerHTML = `💡 ${escHtml(data.tip)}`;

        if (data.warnings && data.warnings.length > 0) {
            document.getElementById('week-warnings').style.display = 'block';
            document.getElementById('week-warnings-list').innerHTML =
                data.warnings.map(w => `<li>${escHtml(w)}</li>`).join('');
        } else {
            document.getElementById('week-warnings').style.display = 'none';
        }

        if (data.summary) {
            const s = data.summary;
            document.getElementById('week-overview').innerHTML +=
                `<div style="margin-top:8px;font-size:0.78rem;opacity:0.8">
                   ${s.scheduled} scheduled · ${s.protected} protected (unchanged) · ${s.total - s.scheduled} skipped
                 </div>`;
        }

        if (!data.plan || data.plan.length === 0) {
            document.getElementById('week-plan-list').innerHTML =
                `<div class="empty-state" style="padding:24px 0"><span>📭</span>Nothing to schedule.</div>`;
        } else {
            document.getElementById('week-plan-list').innerHTML = data.plan
                .filter(item => allTasks.find(t => t.id === item.taskId))
                .map(item => {
                    const task = allTasks.find(t => t.id === item.taskId);
                    return `
                  <div class="week-plan-item">
                    <div>
                      <div class="week-plan-title">${escHtml(task.title)}</div>
                      <div style="font-size:0.75rem;color:#9ca3af;margin-top:2px">${escHtml(item.reason)}</div>
                    </div>
                    <div class="week-plan-time">${formatDisplayDate(item.date)}<br/>${formatTime(item.time)}</div>
                  </div>`;
                }).join('');
        }

    } catch (e) {
        showToast('Failed to build week plan.');
    } finally {
        btn.textContent = '✨ Build My Week';
        btn.disabled = false;
        weekPlanInFlight = false;
    }
}

// ── SORT ─────────────────────────────────────────────────────────
function setSort(type) {
    currentSort = type;
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    const map = { default: 'sort-default', date_asc: 'sort-asc', date_desc: 'sort-desc' };
    document.getElementById(map[type]).classList.add('active');
    loadTasks();
}

// ── LOCATION ─────────────────────────────────────────────────────
function toggleLocation() {
    locationOpen = !locationOpen;
    document.getElementById('location-fields').classList.toggle('visible', locationOpen);
    document.getElementById('location-toggle-label').textContent =
        locationOpen ? 'Remove Location' : 'Add Location & Travel Time';
}

async function calculateTravel() {
    const from = document.getElementById('inp-from').value.trim();
    const to = document.getElementById('inp-to').value.trim();
    const resultEl = document.getElementById('travel-result');
    if (!from || !to) { resultEl.textContent = 'Enter both locations.'; resultEl.className = 'travel-result visible travel-error'; return; }
    resultEl.className = 'travel-result visible';
    resultEl.textContent = '🚗 Calculating...';
    try {
        const res = await fetch(`${API}/tasks/travel`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fromAddress: from, toAddress: to })
        });
        const data = await res.json();
        if (data.error) { resultEl.textContent = `❌ ${data.error}`; resultEl.classList.add('travel-error'); return; }
        document.getElementById('inp-travel-mins').value = data.travelTimeMins;
        document.getElementById('inp-distance-km').value = data.distanceKm;
        document.getElementById('inp-from-coords').value = JSON.stringify({ lat: data.fromCoords.lat, lon: data.fromCoords.lon });
        document.getElementById('inp-to-coords').value = JSON.stringify({ lat: data.toCoords.lat, lon: data.toCoords.lon });
        const leaveBy = document.getElementById('inp-time').value
            ? `Leave by ${formatTime(addMinutes(document.getElementById('inp-time').value, -data.travelTimeMins))} · ` : '';
        resultEl.innerHTML = `✅ <strong>${leaveBy}${data.travelTimeMins} min · ${data.distanceKm} km</strong>`;
        resultEl.classList.remove('travel-error');
    } catch (e) {
        resultEl.textContent = '❌ Could not calculate.';
        resultEl.classList.add('travel-error');
    }
}

// ── SAVE TASK ────────────────────────────────────────────────────
async function saveTask() {
    const title = document.getElementById('inp-title').value.trim();
    if (!title) { showToast('Title is required.'); return; }

    const editId = document.getElementById('edit-id').value;
    const sessions = parseInt(document.getElementById('inp-sessions')?.value) || 1;
    const dueDate = document.getElementById('inp-due').value || null;
    const dueTime = document.getElementById('inp-time').value || null;
    const durationMins = parseInt(document.getElementById('inp-duration').value) || null;
    const travelMins = parseInt(document.getElementById('inp-travel-mins').value) || null;

    const baseTask = {
        title,
        description: document.getElementById('inp-desc').value.trim(),
        priority: document.getElementById('inp-priority').value,
        status: document.getElementById('inp-status').value,
        dueDate, dueTime, durationMins,
        fromLocation: document.getElementById('inp-from').value.trim() || null,
        toLocation: document.getElementById('inp-to').value.trim() || null,
        travelTimeMins: travelMins,
        distanceKm: parseFloat(document.getElementById('inp-distance-km').value) || null,
        fromLocationCoords: document.getElementById('inp-from-coords').value || null,
        toLocationCoords: document.getElementById('inp-to-coords').value || null
    };

    if (!editId && sessions > 1) {
        for (let i = 0; i < sessions; i++) {
            await fetch(`${API}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(baseTask) });
        }
        showToast(`${sessions} tasks created!`);
        resetForm();
        loadTasks();
        return;
    }

    pendingTask = baseTask;

    if (dueDate && dueTime) {
        const conflictRes = await fetch(`${API}/tasks/check-conflict`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: dueDate, time: dueTime, durationMins, travelTimeMins: travelMins, excludeId: editId || null })
        });
        const conflict = await conflictRes.json();
        if (conflict.conflict) {
            suggestedTime = conflict.suggestedTime;
            document.getElementById('modal-conflict-info').textContent = `"${conflict.conflictName}" (${conflict.conflictStart} – ${conflict.conflictEnd})`;
            document.getElementById('modal-suggest-info').textContent = `📅 ${formatTime(conflict.suggestedTime)}`;
            document.getElementById('conflict-modal').classList.add('visible');
            return;
        }
    }
    await doSaveTask(editId);
}
async function doSaveTask(editId) {
    if (editId) {
        await fetch(`${API}/tasks/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingTask) });
        showToast('Task updated!');
    } else {
        await fetch(`${API}/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pendingTask) });
        showToast('Task created!');
    }
    resetForm();
    loadTasks();
    pendingTask = null;
}

function useSuggestedTime() {
    if (suggestedTime) { pendingTask.dueTime = suggestedTime; document.getElementById('inp-time').value = suggestedTime; }
    closeModal('conflict-modal');
    doSaveTask(document.getElementById('edit-id').value);
}
function saveAnyway() { closeModal('conflict-modal'); doSaveTask(document.getElementById('edit-id').value); }
function closeModal(id) { document.getElementById(id).classList.remove('visible'); }

// ── EDIT / DELETE / AI SUGGEST ────────────────────────────────────
function editTask(id) {
    const t = allTasks.find(t => t.id === id);
    if (!t) return;
    document.getElementById('edit-id').value = t.id;
    document.getElementById('inp-title').value = t.title;
    document.getElementById('inp-desc').value = t.description || '';
    document.getElementById('inp-priority').value = t.priority;
    document.getElementById('inp-status').value = t.status;
    document.getElementById('inp-due').value = t.due_date || '';
    document.getElementById('inp-time').value = t.due_time || '';
    document.getElementById('inp-duration').value = t.duration_mins || '';
    document.getElementById('form-title').textContent = 'Edit Task';
    if (t.from_location || t.to_location) {
        if (!locationOpen) toggleLocation();
        document.getElementById('inp-from').value = t.from_location || '';
        document.getElementById('inp-to').value = t.to_location || '';
        document.getElementById('inp-travel-mins').value = t.travel_time_mins || '';
        document.getElementById('inp-distance-km').value = t.distance_km || '';
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    await fetch(`${API}/tasks/${id}`, { method: 'DELETE' });
    showToast('Task deleted.');
    loadTasks();
}

async function getAISuggestion(id) {
    const loadingEl = document.getElementById(`ai-loading-${id}`);
    loadingEl.innerHTML = '<p class="loading">✨ Getting AI suggestion...</p>';
    try {
        const res = await fetch(`${API}/ai/suggest`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: id })
        });
        const data = await res.json();
        if (data.error) { loadingEl.innerHTML = `<p style="color:red;font-size:.85rem">${data.error}</p>`; return; }
        loadingEl.innerHTML = '';
        loadTasks();
        showToast('AI suggestion added!');
    } catch (e) {
        loadingEl.innerHTML = '<p style="color:red;font-size:.85rem">AI request failed.</p>';
    }
}

// ── RESET ────────────────────────────────────────────────────────
function resetForm() {
    ['edit-id', 'inp-title', 'inp-desc', 'inp-due', 'inp-time', 'inp-from', 'inp-to',
        'inp-travel-mins', 'inp-distance-km', 'inp-from-coords', 'inp-to-coords'].forEach(id => {
            document.getElementById(id).value = '';
        });
    document.getElementById('inp-priority').value = 'MEDIUM';
    if (document.getElementById('inp-sessions')) document.getElementById('inp-sessions').value = '1';
    document.getElementById('inp-status').value = 'TODO';
    document.getElementById('inp-duration').value = '';
    document.getElementById('form-title').textContent = 'Add New Task';
    document.getElementById('travel-result').className = 'travel-result';
    if (locationOpen) toggleLocation();
    pendingTask = null; suggestedTime = null;
}

// ── HELPERS ──────────────────────────────────────────────────────
function addMinutes(timeStr, mins) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = h * 60 + m + mins;
    const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60);
    const mm = ((total % 60) + 60) % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function formatTime(timeStr) {
    if (!timeStr) return '';
    // If it already contains AM/PM, it's already formatted — just clean it up
    if (/am|pm/i.test(timeStr)) {
        return timeStr.replace(/\s+/g, ' ').trim().toUpperCase().replace(/^(\d{1,2}:\d{2})\s*(AM|PM).*$/i, '$1 $2');
    }
    const [h, m] = timeStr.split(':');
    const hour = parseInt(h);
    if (isNaN(hour)) return timeStr; // fallback, don't crash on garbage
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const disp = hour % 12 === 0 ? 12 : hour % 12;
    return `${disp}:${String(m).padStart(2, '0')} ${suffix}`;
}

function formatDuration(mins) {
    if (!mins) return '';
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h} hour${h > 1 ? 's' : ''}`;
}

function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

loadTasks();


