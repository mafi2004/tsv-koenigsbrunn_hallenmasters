
const sqlite3 = require('sqlite3').verbose();
// Datenbankdatei anlegen/öffnen
const db = new sqlite3.Database('./tournament.db');

// Tabellen anlegen + ggf. Migration ausführen
db.serialize(() => {
  // Teams-Tabelle
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      groupName TEXT
    )
  `);

  // group_state für Rundenstand pro Gruppe
  db.run(`
    CREATE TABLE IF NOT EXISTS group_state (
      groupName TEXT PRIMARY KEY,
      lastRound INTEGER NOT NULL
    )
  `);

  // matches Schema (Ziel-Schema inkl. plannedStart TEXT)
  db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='matches'`, (err, row) => {
    if (err) {
      console.error('Fehler beim Prüfen der Tabelle matches:', err.message);
      return;
    }
    const createTarget = `
      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teamA INTEGER,
        teamB INTEGER,
        groupName TEXT,
        round INTEGER,
        field INTEGER,
        scoreA INTEGER,
        scoreB INTEGER,
        winner INTEGER,
        plannedStart TEXT -- 'HH:MM'
      )
    `;
    if (!row) {
      db.run(createTarget, (e) => {
        if (e) console.error('Fehler beim Anlegen von matches:', e.message);
      });
      return;
    }
    // Migration falls Typen/Spalten nicht passen
    db.all(`PRAGMA table_info(matches)`, (e, cols) => {
      if (e) {
        console.error('PRAGMA table_info(matches) fehlgeschlagen:', e.message);
        return;
      }
      const upper = (s) => String(s || '').trim().toUpperCase();
      const typeOf = (name) => {
        const c = cols.find(x => x.name === name);
        return c ? upper(c.type) : '';
      };
      const hasCol = (name) => cols.some(c => c.name === name);
      const needsWinnerInt = typeOf('winner') !== 'INTEGER';
      const needsFieldInt  = typeOf('field')  !== 'INTEGER';
      const needsRoundInt  = typeOf('round')  !== 'INTEGER';
      const hasPlanned     = hasCol('plannedStart');
      const needsPlanned   = !hasPlanned;

      if (!needsWinnerInt && !needsFieldInt && !needsRoundInt && !needsPlanned) {
        // Schema passt
      } else {
        console.log('Migration der Tabelle matches wird gestartet (winner/field/round -> INTEGER, plannedStart TEXT hinzufügen)...');
        const selectPlanned = hasPlanned ? `plannedStart` : `NULL AS plannedStart`;
        db.run(`BEGIN IMMEDIATE`, (beginErr) => {
          if (beginErr) {
            console.error('Konnte Transaktion nicht starten:', beginErr.message);
            return;
          }
          db.run(`
            CREATE TABLE IF NOT EXISTS matches_migr (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              teamA INTEGER,
              teamB INTEGER,
              groupName TEXT,
              round INTEGER,
              field INTEGER,
              scoreA INTEGER,
              scoreB INTEGER,
              winner INTEGER,
              plannedStart TEXT
            )
          `, (crtErr) => {
            if (crtErr) {
              console.error('Fehler beim Erstellen von matches_migr:', crtErr.message);
              return db.run(`ROLLBACK`);
            }
            const insertSql = `
              INSERT INTO matches_migr (id, teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart)
              SELECT
                id,
                teamA,
                teamB,
                groupName,
                CASE WHEN round IS NULL THEN NULL ELSE CAST(round AS INTEGER) END,
                CASE WHEN field IS NULL THEN NULL ELSE CAST(field AS INTEGER) END,
                scoreA,
                scoreB,
                CASE WHEN winner IS NULL THEN NULL ELSE CAST(winner AS INTEGER) END,
                ${selectPlanned}
              FROM matches
            `;
            db.run(insertSql, (insErr) => {
              if (insErr) {
                console.error('Fehler beim Kopieren der Daten:', insErr.message);
                return db.run(`ROLLBACK`);
              }
              db.run(`DROP TABLE matches`, (dropErr) => {
                if (dropErr) {
                  console.error('Fehler beim Löschen der alten matches-Tabelle:', dropErr.message);
                  return db.run(`ROLLBACK`);
                }
                db.run(`ALTER TABLE matches_migr RENAME TO matches`, (renErr) => {
                  if (renErr) {
                    console.error('Fehler beim Umbenennen der Tabelle:', renErr.message);
                    return db.run(`ROLLBACK`);
                  }
                  db.run(`COMMIT`, (commitErr) => {
                    if (commitErr) {
                      console.error('Commit fehlgeschlagen:', commitErr.message);
                    } else {
                      console.log('Migration der matches-Tabelle erfolgreich abgeschlossen.');
                    }
                  });
                });
              });
            });
          });
        });
      }
    });
  });

  // NEU: History-Tabelle (Archiv der gespielten 3er-Blöcke)
  db.run(`
    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batchId TEXT,               -- Kennung für den 3er-Block (Gruppe+Runde+Zeit)
      groupName TEXT,
      round INTEGER,
      field INTEGER,
      teamA INTEGER,
      teamB INTEGER,
      scoreA INTEGER,
      scoreB INTEGER,
      winner INTEGER,
      plannedStart TEXT,
      originalMatchId INTEGER,    -- ID aus matches (zum Zeitpunkt des Archivierens)
      archivedAt TEXT DEFAULT (datetime('now'))
    )
  `);
});

module.exports = db;
