const sqlite3 = require('sqlite3').verbose();

// Datenbankdatei anlegen/öffnen
const db = new sqlite3.Database('./tournament.db');

// Tabellen anlegen, falls nicht vorhanden
db.serialize(() => {
  // Teams mit Gruppenzuordnung
  db.run(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    groupName TEXT
  )`);

  // Matches mit Sieger-Spalte
  db.run(`CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teamA INTEGER,
    teamB INTEGER,
    groupName TEXT,
    round TEXT,
    field TEXT,
    scoreA INTEGER,
    scoreB INTEGER,
    winner TEXT
  )`);
});

module.exports = db;
