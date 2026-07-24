const express = require('express');
const router  = express.Router();
const taskDAO = require('../dao/taskDAO');

// ── TIME HELPERS ─────────────────────────────────────────────────
function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function getWindow(task) {
  if (!task.due_time) return null;
  const eventStart = timeToMins(task.due_time);
  const travel     = task.travel_time_mins || 0;
  const duration   = task.duration_mins    || 30;
  return {
    blockStart: eventStart - travel,    // when user must leave
    eventStart,                         // when event begins
    eventEnd:   eventStart + duration   // when event ends
  };
}

function overlaps(a, b) {
  return a.blockStart < b.eventEnd && a.eventEnd > b.blockStart;
}

// ── CHECK CONFLICT ────────────────────────────────────────────────
router.post('/check-conflict', (req, res) => {
  try {
    const { date, time, durationMins, travelTimeMins, excludeId } = req.body;
    if (!date || !time) return res.json({ conflict: false });

    const existingTasks = taskDAO.getTasksOnDate(date, excludeId);

    const newEventStart = timeToMins(time);
    const newTravel     = travelTimeMins || 0;
    const newDuration   = durationMins   || 30;
    const newWindow     = {
      blockStart: newEventStart - newTravel,
      eventStart: newEventStart,
      eventEnd:   newEventStart + newDuration
    };

    // Find conflicting task
    let conflictTask   = null;
    let conflictWindow = null;
    for (const task of existingTasks) {
      const win = getWindow(task);
      if (!win) continue;
      if (overlaps(newWindow, win)) {
        conflictTask   = task;
        conflictWindow = win;
        break;
      }
    }

    if (!conflictTask) return res.json({ conflict: false });

    // Find next available slot after the conflict
    const allWindows = existingTasks
      .map(t => getWindow(t))
      .filter(Boolean)
      .sort((a, b) => a.eventEnd - b.eventEnd);

    let suggested = conflictWindow.eventEnd;
    let safe      = false;

    while (!safe && suggested < 23 * 60) {
      const testWindow = {
        blockStart: suggested - newTravel,
        eventStart: suggested,
        eventEnd:   suggested + newDuration
      };
      const stillConflicts = allWindows.some(w => overlaps(testWindow, w));
      if (!stillConflicts) {
        safe = true;
      } else {
        const next = allWindows.find(w => overlaps(testWindow, w));
        suggested  = next.eventEnd;
      }
    }

    res.json({
      conflict:      true,
      conflictName:  conflictTask.title,
      conflictStart: minsToTime(conflictWindow.eventStart),
      conflictEnd:   minsToTime(conflictWindow.eventEnd),
      suggestedTime: minsToTime(suggested)
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TRAVEL TIME (OSRM + NOMINATIM) ───────────────────────────────
router.post('/travel', async (req, res) => {
  try {
    const { fromAddress, toAddress } = req.body;
    if (!fromAddress || !toAddress) {
      return res.status(400).json({ error: 'Both addresses are required' });
    }

    const { default: fetch } = await import('node-fetch');

    async function geocode(address) {
      const url  = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'AITaskManager/1.0' } });
      const data = await resp.json();
      if (!data || data.length === 0) throw new Error(`Location not found: "${address}"`);
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
    }

    const [from, to] = await Promise.all([geocode(fromAddress), geocode(toAddress)]);

    // Get driving route from OSRM
    const osrmUrl   = `http://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const routeResp = await fetch(osrmUrl);
    const routeData = await routeResp.json();

    if (routeData.code !== 'Ok') {
      return res.status(500).json({ error: 'Could not calculate route' });
    }

    const route          = routeData.routes[0];
    const travelTimeMins = Math.ceil(route.duration / 60);
    const distanceKm     = parseFloat((route.distance / 1000).toFixed(1));

    res.json({ travelTimeMins, distanceKm, fromCoords: from, toCoords: to });

  } catch (err) {
    console.error('Travel error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── STANDARD CRUD ─────────────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const { sort, date } = req.query;
    let tasks = taskDAO.getAllTasks();

    if (date) tasks = tasks.filter(t => t.due_date === date);

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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', (req, res) => {
  try {
    const task = taskDAO.getTaskById(req.params.id);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json(task);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', (req, res) => {
  try {
    res.status(201).json(taskDAO.createTask(req.body));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', (req, res) => {
  try {
    res.json(taskDAO.updateTask(req.params.id, req.body));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', (req, res) => {
  try {
    taskDAO.deleteTask(req.params.id);
    res.json({ message: 'Task deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;