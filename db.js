// server/db.js
// -----------------------------------------------------------------------------
// Zentrale Initialisierung der SQLite-Datenbank.
//
// Hauptaufgaben:
// - Öffnen/Erstellen der Datei tournament.db
// - Anlegen aller Tabellen (falls nicht vorhanden)
// - Migration des matches-Schemas auf das aktuelle Format
// - Sicherstellen, dass tournament_meta genau eine Zeile besitzt
//
// Diese Datei ist das Fundament des gesamten Turniersystems.
// -----------------------------------------------------------------------------

const sqlite3 = require('sqlite3').verbose();

// ---------------------------------------------------------------------------
// Datenbank öffnen (oder anlegen)
// ---------------------------------------------------------------------------
const db = new sqlite3.Database('./tournament.db');

db.serialize(() => {

  // -------------------------------------------------------------------------
  // Tabelle: teams
  // Enthält alle Teams (3v3 und 5v5), unterschieden durch mode.
  // -------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      groupName TEXT,
      mode TEXT NOT NULL
    )
  `);

  // -------------------------------------------------------------------------
  // Tabelle: group_state
  // Speichert für jede Gruppe die zuletzt gespielte Runde.
  // Wird für Zeitplanung und Rundenfortschritt genutzt.
  // -------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS group_state (
      groupName TEXT PRIMARY KEY,
      lastRound INTEGER NOT NULL
    )
  `);

  // -------------------------------------------------------------------------
  // Tabelle: matches
  // Enthält alle Spiele (3v3 und 5v5).
  // Die Datei enthält eine Migration, falls alte Versionen existieren.
  // -------------------------------------------------------------------------
  db.get(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='matches'`,
    (err, row) => {
      if (err) {
        console.error('Fehler beim Prüfen der Tabelle matches:', err.message);
        return;
      }

      const createTarget = `
        CREATE TABLE IF NOT EXISTS matches (
          id INTEGER PRIMARY KEY,
          teamA INTEGER,
          teamB INTEGER,
          groupName TEXT,
          round INTEGER,
          field INTEGER,
          scoreA INTEGER,
          scoreB INTEGER,
          winner INTEGER,
          plannedStart TEXT,
          mode TEXT NOT NULL,
          FOREIGN KEY(teamA) REFERENCES teams(id),
          FOREIGN KEY(teamB) REFERENCES teams(id)
        )
      `;

      // Wenn matches noch nicht existiert → direkt anlegen
      if (!row) {
        db.run(createTarget, (e) => {
          if (e) console.error('Fehler beim Anlegen von matches:', e.message);
        });
        return;
      }

      // ---------------------------------------------------------------------
      // Schema-Migration prüfen
      // ---------------------------------------------------------------------
      db.all(`PRAGMA table_info(matches)`, (e, cols) => {
        if (e) {
          console.error('PRAGMA table_info(matches) fehlgeschlagen:', e.message);
          return;
        }

        const upper = (s) => String(s ?? '').trim().toUpperCase();
        const t = (name) => {
          const c = cols.find(x => x.name === name);
          return c ? upper(c.type) : '';
        };
        const has = (name) => cols.some(c => c.name === name);

        const needsWinnerInt = t('winner') !== 'INTEGER';
        const needsFieldInt  = t('field')  !== 'INTEGER';
        const needsRoundInt  = t('round')  !== 'INTEGER';
        const needsPlanned   = !has('plannedStart');

        // Wenn alles passt → fertig
        if (!needsWinnerInt && !needsFieldInt && !needsRoundInt && !needsPlanned) {
          return;
        }

        console.log('Migration matches: winner/field/round -> INTEGER, plannedStart TEXT hinzufügen …');

        const selectPlanned = has('plannedStart')
          ? `plannedStart`
          : `NULL AS plannedStart`;

        // -------------------------------------------------------------------
        // Migration starten
        // -------------------------------------------------------------------
        db.run(`BEGIN IMMEDIATE`, (beginErr) => {
          if (beginErr) {
            console.error('BEGIN IMMEDIATE fehlgeschlagen:', beginErr.message);
            return;
          }

          // Neue Tabelle
          db.run(`
            CREATE TABLE IF NOT EXISTS matches_migr (
              id INTEGER PRIMARY KEY,
              teamA INTEGER,
              teamB INTEGER,
              groupName TEXT,
              round INTEGER,
              field INTEGER,
              scoreA INTEGER,
              scoreB INTEGER,
              winner INTEGER,
              plannedStart TEXT,
              mode TEXT
            )
          `, (crtErr) => {
            if (crtErr) {
              console.error('Erstellen matches_migr fehlgeschlagen:', crtErr.message);
              return db.run(`ROLLBACK`);
            }

            // Daten übernehmen
            db.run(`
              INSERT INTO matches_migr
              (id, teamA, teamB, groupName, round, field, scoreA, scoreB, winner, plannedStart, mode)
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
                ${selectPlanned},
                '3v3'
              FROM matches
            `, (insErr) => {
              if (insErr) {
                console.error('Kopieren in matches_migr fehlgeschlagen:', insErr.message);
                return db.run(`ROLLBACK`);
              }

              // Alte Tabelle löschen
              db.run(`DROP TABLE matches`, (dropErr) => {
                if (dropErr) {
                  console.error('DROP matches fehlgeschlagen:', dropErr.message);
                  return db.run(`ROLLBACK`);
                }

                // Neue Tabelle umbenennen
                db.run(`ALTER TABLE matches_migr RENAME TO matches`, (renErr) => {
                  if (renErr) {
                    console.error('RENAME fehlgeschlagen:', renErr.message);
                    return db.run(`ROLLBACK`);
                  }

                  db.run(`COMMIT`, (commitErr) => {
                    if (commitErr) console.error('COMMIT fehlgeschlagen:', commitErr.message);
                    else console.log('Migration matches abgeschlossen.');
                  });
                });
              });
            });
          });
        });
      });
    }
  );

  // -------------------------------------------------------------------------
  // Tabelle: match_history
  // Archiv aller gespielten Runden (3v3).
  // Wird für Recovery, Rebuild und Audit genutzt.
  // -------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS match_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batchId TEXT,
      groupName TEXT,
      round INTEGER,
      field INTEGER,
      teamA INTEGER,
      teamB INTEGER,
      scoreA INTEGER,
      scoreB INTEGER,
      winner INTEGER,
      plannedStart TEXT,
      originalMatchId INTEGER,
      mode TEXT,
      archivedAt TEXT DEFAULT (datetime('now'))
    )
  `);

  // -------------------------------------------------------------------------
  // Tabelle: admin_ops
  // Protokolliert jede Admin-Operation (z. B. nextRound, reset, rebuild).
  // -------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_ops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMMITTED'
    )
  `);

  // -------------------------------------------------------------------------
  // Tabelle: admin_snapshots
  // Speichert Metadaten zu Snapshot-Dateien.
  // -------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS admin_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      path TEXT NOT NULL
    )
  `);

  // -------------------------------------------------------------------------
  // Tabelle: tournament_meta
  // Speichert globalen Zeitplan + Jahrgangslabel.
  // Genau eine Zeile (id = 1).
  // -------------------------------------------------------------------------
  db.run(`
    CREATE TABLE IF NOT EXISTS tournament_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      yearLabel TEXT,
      timeHHMM TEXT,
      dur INTEGER,
      brk INTEGER,
      updatedAt TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Fehler beim Anlegen tournament_meta:', err.message);
      return;
    }

    // Sicherstellen, dass es genau eine Zeile gibt
    db.get(`SELECT id FROM tournament_meta WHERE id = 1`, (e, row) => {
      if (e) {
        console.error('Fehler beim Prüfen tournament_meta:', e.message);
        return;
      }

      if (!row) {
        db.run(`
          INSERT INTO tournament_meta
          (id, yearLabel, timeHHMM, dur, brk, updatedAt)
          VALUES (1, NULL, NULL, NULL, NULL, datetime('now'))
        `);
      }
    });
  });
});

module.exports = db;
