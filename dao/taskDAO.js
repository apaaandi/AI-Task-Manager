const db = require('../db/database');

function getAllTasks() {
    return db.prepare('SELECT * FROM tasks ORDER BY id DESC').all();
}

function getTaskById(id) {
    return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

function getTasksByDate(date) {
    return db.prepare('SELECT * FROM tasks WHERE due_date = ? ORDER BY due_time ASC').all(date);
}

function getTasksOnDate(date, excludeId = null) {
    if (excludeId) {
        return db.prepare(
            'SELECT * FROM tasks WHERE due_date = ? AND id != ? AND due_time IS NOT NULL'
        ).all(date, excludeId);
    }
    return db.prepare(
        'SELECT * FROM tasks WHERE due_date = ? AND due_time IS NOT NULL'
    ).all(date);
}

function createTask(task) {
    const result = db.prepare(`
    INSERT INTO tasks
      (title, description, priority, status, due_date, due_time,
       duration_mins, from_location, to_location, travel_time_mins, distance_km,
       from_location_coords, to_location_coords)
    VALUES
      (@title, @description, @priority, @status, @dueDate, @dueTime,
       @durationMins, @fromLocation, @toLocation, @travelTimeMins, @distanceKm,
       @fromLocationCoords, @toLocationCoords)
  `).run({
        title: task.title,
        description: task.description || null,
        priority: task.priority || 'MEDIUM',
        status: task.status || 'TODO',
        dueDate: task.dueDate || null,
        dueTime: task.dueTime || null,
        durationMins: task.durationMins || null,
        fromLocation: task.fromLocation || null,
        toLocation: task.toLocation || null,
        travelTimeMins: task.travelTimeMins || null,
        distanceKm: task.distanceKm || null,
        fromLocationCoords: task.fromLocationCoords || null,
        toLocationCoords: task.toLocationCoords || null
    });
    return getTaskById(result.lastInsertRowid);
}

function updateTask(id, task) {
    db.prepare(`
    UPDATE tasks SET
      title = @title, description = @description, priority = @priority,
      status = @status, due_date = @dueDate, due_time = @dueTime,
      duration_mins = @durationMins, from_location = @fromLocation,
      to_location = @toLocation, travel_time_mins = @travelTimeMins,
      distance_km = @distanceKm, from_location_coords = @fromLocationCoords,
      to_location_coords = @toLocationCoords, ai_suggestion = @aiSuggestion
    WHERE id = @id
  `).run({
        id,
        title: task.title,
        description: task.description || null,
        priority: task.priority || 'MEDIUM',
        status: task.status || 'TODO',
        dueDate: task.dueDate || task.due_date || null,
        dueTime: task.dueTime || task.due_time || null,
        durationMins: task.durationMins || task.duration_mins || null,
        fromLocation: task.fromLocation || task.from_location || null,
        toLocation: task.toLocation || task.to_location || null,
        travelTimeMins: task.travelTimeMins || task.travel_time_mins || null,
        distanceKm: task.distanceKm || task.distance_km || null,
        fromLocationCoords: task.fromLocationCoords || task.from_location_coords || null,
        toLocationCoords: task.toLocationCoords || task.to_location_coords || null,
        aiSuggestion: task.aiSuggestion || task.ai_suggestion || null
    });
    return getTaskById(id);
}

function deleteTask(id) {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

function timeToMins(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

function minsToTime(mins) {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getWindow(task) {
    if (!task.due_time) return null;
    const eventStart = timeToMins(task.due_time);
    const travel = task.travel_time_mins || 0;
    const duration = task.duration_mins || 30;
    return {
        blockStart: eventStart - travel,
        eventStart,
        eventEnd: eventStart + duration
    };
}

function overlaps(a, b) {
    return a.blockStart < b.eventEnd && a.eventEnd > b.blockStart;
}

function checkConflict(date, time, durationMins, travelTimeMins, excludeId = null) {
    if (!date || !time) return { conflict: false };

    const existingTasks = getTasksOnDate(date, excludeId);
    const newEventStart = timeToMins(time);
    const newWindow = {
        blockStart: newEventStart - (travelTimeMins || 0),
        eventStart: newEventStart,
        eventEnd: newEventStart + (durationMins || 30)
    };

    for (const task of existingTasks) {
        const win = getWindow(task);
        if (win && overlaps(newWindow, win)) {
            return { conflict: true, task, conflictStart: minsToTime(win.eventStart), conflictEnd: minsToTime(win.eventEnd) };
        }
    }
    return { conflict: false };
}

module.exports = {
    getAllTasks, getTaskById, getTasksByDate,
    getTasksOnDate, createTask, updateTask, deleteTask,
    checkConflict
};