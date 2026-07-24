const express = require('express');
const router = express.Router();
const taskDAO = require('../dao/taskDAO');
const { sendDailyDigest } = require('../services/emailService');

function normalizeTime(t) {
    if (!t) return '09:00';
    const ampmMatch = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (ampmMatch) {
        let [, h, m, ampm] = ampmMatch;
        h = parseInt(h);
        if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
        if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${m}`;
    }
    const plain = t.match(/^(\d{1,2}):(\d{2})$/);
    return plain ? `${plain[1].padStart(2, '0')}:${plain[2]}` : '09:00';
}

function addMinutesToTime(timeStr, mins) {
    const [h, m] = timeStr.split(':').map(Number);
    const total = ((h * 60 + m + mins) % 1440 + 1440) % 1440;
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function extractActions(text) {
    const actions = [];
    const spans = [];
    let i = 0;
    while ((i = text.indexOf('ACTION:{', i)) !== -1) {
        const jsonStart = i + 'ACTION:'.length;
        let depth = 0, end = jsonStart;
        for (; end < text.length; end++) {
            if (text[end] === '{') depth++;
            if (text[end] === '}') { depth--; if (depth === 0) { end++; break; } }
        }
        const jsonStr = text.slice(jsonStart, end);
        try { actions.push(JSON.parse(jsonStr)); } catch (e) { console.error('Action parse error:', e.message); }
        spans.push([i, end]);
        i = end;
    }
    let cleanText = text;
    for (let k = spans.length - 1; k >= 0; k--) {
        const [s, e] = spans[k];
        cleanText = cleanText.slice(0, s) + cleanText.slice(e);
    }
    return { actions, cleanText: cleanText.trim() };
}

async function fetchWithTimeout(url, options, ms = 15000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

router.get('/', (req, res) => {
    try {
        const { sort, date } = req.query;
        let tasks = taskDAO.getAllTasks();


        // Filter by specific date if provided
        if (date) {
            tasks = tasks.filter(t => t.due_date === date);
        }


        // Sort by due date ascending or descending
        if (sort === 'date_asc') {
            tasks.sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            });
        } else if (sort === 'date_desc') {
            tasks.sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(b.due_date) - new Date(a.due_date);
            });
        }


        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.get('/:id', (req, res) => {
    try {
        const task = taskDAO.getTaskById(req.params.id);
        if (!task) return res.status(404).json({ error: 'Task not found' });
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.post('/', (req, res) => {
    try {
        const task = taskDAO.createTask(req.body);
        res.status(201).json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.put('/:id', (req, res) => {
    try {
        const task = taskDAO.updateTask(req.params.id, req.body);
        res.json(task);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


router.delete('/:id', (req, res) => {
    try {
        taskDAO.deleteTask(req.params.id);
        res.json({ message: 'Task deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── AI CHAT ───────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
    try {
        const { message, history } = req.body;
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return res.status(503).json({ error: 'GROQ_API_KEY not set' });

        // Get full task context from database
        const tasks = taskDAO.getAllTasks();
        const taskSummary = tasks.length === 0
            ? 'No tasks currently in the system.'
            : tasks.map(t => `
          [ID:${t.id}] "${t.title}"
          - Priority: ${t.priority} | Status: ${t.status}
          - Date: ${t.due_date || 'unscheduled'} | Time: ${t.due_time || 'no time set'}
          - Duration: ${t.duration_mins ? t.duration_mins + ' mins' : 'not set'}
          - Travel: ${t.travel_time_mins ? t.travel_time_mins + ' mins to ' + t.to_location : 'none'}
          - Description: ${t.description || 'none'}
        `).join('\n');

        const systemPrompt = `
      You are an intelligent task management assistant with full access to the user's task list.
      Today's date is ${new Date().toISOString().split('T')[0]}.

      CURRENT TASKS IN SYSTEM:
      ${taskSummary}

      You can help the user by:
      - Answering questions about their schedule, workload, and priorities
      - Identifying risks, conflicts, and overdue items
      - Suggesting what to focus on, drop, or reschedule
      - Performing actions like rescheduling or reprioritizing tasks

      When the user asks you to make a change to a task, respond with a JSON action block at the END of your message in this exact format:
      ACTION:{"type":"update","taskId":1,"changes":{"due_date":"2026-07-08","due_time":"10:00","priority":"HIGH"}}

      For multiple changes:
      ACTION:{"type":"update","taskId":1,"changes":{"due_date":"2026-07-08"}}
      ACTION:{"type":"update","taskId":2,"changes":{"priority":"LOW"}}

      For deletion:
      ACTION:{"type":"delete","taskId":1}

      Rules:
      - Be concise and direct. No corporate speak.
      - When analyzing the schedule, be specific — mention actual task names and times.
      - If asked what to drop or deprioritize, make a real recommendation with a reason.
      - Always put ACTION blocks at the very end of your response, after your text.
    `;

        // Build conversation history for context
        const messages = [
            { role: 'system', content: systemPrompt },
            ...(history || []),
            { role: 'user', content: message }
        ];

        const { default: fetch } = await import('node-fetch');
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                max_tokens: 600,
                messages
            })
        });

        const data = await response.json();
        if (data.error) return res.status(500).json({ error: data.error.message });

        const reply = data.choices[0].message.content;

        // Parse and execute any ACTION blocks (using extractActions helper — must be defined earlier in file)
        const { actions, cleanText } = extractActions(reply);

        const skippedActions = [];

        actions.forEach(action => {
            if (action.type === 'update') {
                const task = taskDAO.getTaskById(action.taskId);
                if (!task) return;

                const newDate = action.changes.due_date || task.due_date;
                const newTime = action.changes.due_time || task.due_time;

                if (action.changes.due_date || action.changes.due_time) {
                    const result = taskDAO.checkConflict(newDate, newTime, task.duration_mins, task.travel_time_mins, task.id);
                    if (result.conflict) {
                        skippedActions.push({ title: task.title, reason: `conflicts with "${result.task.title}" (${result.conflictStart}–${result.conflictEnd})` });
                        return;
                    }
                }

                taskDAO.updateTask(action.taskId, {
                    ...task,
                    dueDate: newDate,
                    dueTime: newTime,
                    priority: action.changes.priority || task.priority,
                    status: action.changes.status || task.status,
                    durationMins: action.changes.duration_mins || task.duration_mins
                });
            } else if (action.type === 'delete') {
                taskDAO.deleteTask(action.taskId);
            } else if (action.type === 'bulk_shift') {
                action.taskIds.forEach(id => {
                    const t = taskDAO.getTaskById(id);
                    if (t && t.due_date) {
                        const d = new Date(t.due_date + 'T00:00:00');
                        d.setDate(d.getDate() + action.shiftDays);
                        taskDAO.updateTask(id, { ...t, dueDate: d.toISOString().split('T')[0] });
                    }
                });
            }
        });

        let cleanReply = cleanText;
        if (skippedActions.length > 0) {
            cleanReply += '\n\n⚠️ Could not apply: ' + skippedActions.map(s => `"${s.title}" — ${s.reason}`).join('; ');
        }

        res.json({
            reply: cleanReply,
            actions,
            changed: actions.length > skippedActions.length
        });

    } catch (err) {
        console.error('Chat error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── AI WEEK BUILDER ───────────────────────────────────────────────
router.post('/plan-week', async (req, res) => {
    try {
        const { hoursPerDay, mainGoal, unavailableDays, weekStart } = req.body;
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return res.status(503).json({ error: 'GROQ_API_KEY not set' });

        // Determine which week to plan
        let startDate;
        if (weekStart && /^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
            startDate = new Date(weekStart + 'T00:00:00');
        } else {
            startDate = new Date();
        }
        // Build the 7 days of the selected week
        const weekDays = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate);
            d.setDate(startDate.getDate() + i);
            weekDays.push(d.toISOString().split('T')[0]);
        }

        // Map unavailable day-names to actual dates in this week
        const dayNameToDate = {};
        weekDays.forEach(dateStr => {
            const dayName = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' });
            dayNameToDate[dayName] = dateStr;
        });
        const unavailableDates = (unavailableDays || []).map(name => dayNameToDate[name]).filter(Boolean);

        // Split tasks into locked (already scheduled) vs needs-scheduling
        const tasks = taskDAO.getAllTasks();
        const alreadyScheduled = tasks.filter(t => t.due_date && t.due_time);
        const needsScheduling = tasks.filter(t => !t.due_date || !t.due_time);

        const lockedList = alreadyScheduled.length === 0
            ? 'None'
            : alreadyScheduled.map(t => {
                const startBuffer = addMinutesToTime(t.due_time, -30);
                const endBuffer = addMinutesToTime(t.due_time, (t.duration_mins || 30) + 30);
                return `[ID:${t.id}] "${t.title}" is FIXED at ${t.due_date} ${t.due_time} (${t.duration_mins || 30} mins) — treat ${startBuffer} to ${endBuffer} as fully blocked, DO NOT MOVE THIS`;
            }).join('\n');

        const taskList = needsScheduling.length === 0
            ? 'None — everything is already scheduled.'
            : needsScheduling.map(t =>
                `[ID:${t.id}] "${t.title}" | Priority: ${t.priority} | Duration: ${t.duration_mins || 30} mins | Status: ${t.status}`
            ).join('\n');
        // Nothing to schedule — skip the AI call entirely
        if (needsScheduling.length === 0) {
            return res.json({
                overview: 'Nothing to schedule — all your tasks already have a date and time.',
                plan: [],
                warnings: [],
                tip: 'Add a new task without a due date to have AI schedule it for you.'
            });
        }


        const prompt = `
      You are a smart weekly planner. Plan the user's week around EXISTING fixed commitments.

      WEEK START: ${weekDays[0]}
      DAYS THIS WEEK: ${weekDays.join(', ')}
      UNAVAILABLE DATES (do not schedule anything on these exact dates): ${unavailableDates.join(', ') || 'none'}
      HOURS AVAILABLE PER DAY: ${hoursPerDay}
      MAIN GOAL THIS WEEK: ${mainGoal}

      ALREADY SCHEDULED — these are locked, occupied time slots. Do NOT include these in your plan output at all, but treat their time as unavailable when placing other tasks:
      ${lockedList}

      TASKS THAT NEED SCHEDULING (only use these exact taskId values — do not invent new ones, and do not include any task from the "already scheduled" list above):
      ${taskList}

      Create an optimized weekly plan for ONLY the tasks that need scheduling. Rules:
      - Never place a task at a time that overlaps a FIXED commitment listed above, or within 30 minutes before/after one (leave breathing room around existing appointments)      - HIGH priority tasks go earlier in the week
      - Respect the hours per day limit (${hoursPerDay} hours = ${hoursPerDay * 60} mins per day)
      - Do NOT schedule anything on these exact dates: ${unavailableDates.join(', ') || 'none'}
      - Start work tasks at 9:00 AM, space them with 15 min breaks
      - Factor in task duration when scheduling
      - Focus on the main goal: ${mainGoal}
      - Only return taskIds from the "TASKS THAT NEED SCHEDULING" list — never a fixed task's ID

      Respond ONLY with valid JSON, no extra text:
      {
        "overview": "2-3 sentence summary of your weekly plan strategy",
        "plan": [
          { "taskId": 1, "date": "YYYY-MM-DD", "time": "HH:MM", "reason": "one sentence why this slot" }
        ],
        "warnings": ["any risks or conflicts as short strings"],
        "tip": "one actionable tip for making this week successful"
      }
    `;
        let response;
        try {
            response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    max_tokens: 1000,
                    messages: [
                        { role: 'system', content: 'You are a weekly planner. Respond with valid JSON only. No markdown.' },
                        { role: 'user', content: prompt }
                    ]
                })
            }, 15000);
        } catch (e) {
            if (e.name === 'AbortError') {
                return res.status(504).json({ error: 'AI request timed out. Please try again.' });
            }
            throw e;
        }

        const data = await response.json();

        if (data.error) return res.status(500).json({ error: data.error.message });

        const raw = data.choices[0].message.content.trim();
        let parsed;
        try {
            parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
        } catch (e) {
            return res.status(502).json({ error: 'AI returned malformed JSON, please try again' });
        }

        // Strip any plan items touching already-scheduled/locked tasks
        const lockedIds = new Set(alreadyScheduled.map(t => t.id));
        if (parsed.plan) {
            const blocked = [];
            parsed.plan = parsed.plan.filter(item => {
                if (lockedIds.has(item.taskId)) { blocked.push(item.taskId); return false; }
                return true;
            });
            if (blocked.length > 0) {
                parsed.warnings = parsed.warnings || [];
                parsed.warnings.push(`${blocked.length} already-scheduled task(s) were protected from being moved.`);
            }
        }

        // Strip invalid task IDs
        const validIds = new Set(tasks.map(t => t.id));
        if (parsed.plan) {
            const invalid = [];
            parsed.plan = parsed.plan.filter(item => {
                if (!validIds.has(item.taskId)) { invalid.push(item.taskId); return false; }
                return true;
            });
            if (invalid.length > 0) {
                parsed.warnings = parsed.warnings || [];
                parsed.warnings.push(`AI referenced ${invalid.length} task(s) that don't exist and were skipped.`);
            }
        }

        // Strip unavailable-date placements
        if (parsed.plan && unavailableDates.length > 0) {
            const rejected = [];
            parsed.plan = parsed.plan.filter(item => {
                if (unavailableDates.includes(item.date)) { rejected.push(item.taskId); return false; }
                return true;
            });
            if (rejected.length > 0) {
                parsed.warnings = parsed.warnings || [];
                parsed.warnings.push(`${rejected.length} task(s) were dropped — AI scheduled them on an unavailable day.`);
            }
        }

        // Apply the validated plan to the database
        if (parsed.plan) {
            parsed.plan.forEach(item => {
                item.time = normalizeTime(item.time);
                const task = taskDAO.getTaskById(item.taskId);
                if (task) {
                    taskDAO.updateTask(item.taskId, { ...task, dueDate: item.date, dueTime: item.time });
                }
            });
        }

        const summary = {
            scheduled: parsed.plan ? parsed.plan.length : 0,
            protected: alreadyScheduled.length,
            total: needsScheduling.length
        };
        res.json({ ...parsed, weekStart: weekDays[0], summary });

    } catch (err) {
        console.error('Plan week error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── EMAIL DIGEST ──────────────────────────────────────────────────
router.post('/send-digest', async (req, res) => {
    try {
        const result = await sendDailyDigest();
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Email digest error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;