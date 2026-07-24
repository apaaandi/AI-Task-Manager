const Database = require('better-sqlite3');
const db = new Database('./taskmanager.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    title                 TEXT NOT NULL,
    description           TEXT,
    priority              TEXT DEFAULT 'MEDIUM',
    status                TEXT DEFAULT 'TODO',
    due_date              TEXT,
    due_time              TEXT,
    duration_mins         INTEGER,
    from_location         TEXT,
    to_location           TEXT,
    travel_time_mins      INTEGER,
    distance_km           REAL,
    from_location_coords  TEXT,
    to_location_coords    TEXT,
    ai_suggestion         TEXT
  )
`);

const newColumns = [
  'ALTER TABLE tasks ADD COLUMN due_time TEXT',
  'ALTER TABLE tasks ADD COLUMN duration_mins INTEGER',
  'ALTER TABLE tasks ADD COLUMN from_location TEXT',
  'ALTER TABLE tasks ADD COLUMN to_location TEXT',
  'ALTER TABLE tasks ADD COLUMN travel_time_mins INTEGER',
  'ALTER TABLE tasks ADD COLUMN distance_km REAL',
  'ALTER TABLE tasks ADD COLUMN from_location_coords TEXT',
  'ALTER TABLE tasks ADD COLUMN to_location_coords TEXT'
];

newColumns.forEach(sql => {
  try { db.exec(sql); } catch (e) { /* already exists */ }
});


console.log('[DB] Database initialized.');
module.exports = db;