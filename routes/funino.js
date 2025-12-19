
// funino.js
const express = require('express');
const db = require('../db');

module.exports = (io) => {
  const router = express.Router();

  // Nächste Runde generieren – alte Spiele der Gruppe raus, neue unten angehängt
  router.post('/nextRound', (req, res) => {
    const { groupName, results } = req.body;

    if (!Array.isArray(results) || results.length !== 3) {
      return res.status(400).json({ error: "Es müssen genau 3 Ergebnisse vorliegen" });
    }

    // Reihenfolge Feld 1, 2, 3 sicherstellen
    // Bevorzugt: Sortieren nach 'field' (falls vorhanden). Sonst gelieferte Reihenfolge als 1..3 interpretieren.
    const haveFieldProp = results.every(r => typeof r.field === 'number');
    const orderedResults = haveFieldProp
      ? [...results].sort((a, b) => a.field - b.field) // Feld 1, 2, 3
      : [...results]; // Fallback: gelieferte Reihenfolge entspricht Feldern 1..3

    const winners = orderedResults.map(r => r.winnerId);
    const losers  = orderedResults.map(r => r.loserId);

    // Pairs mit explizitem Feld-Tag erzeugen
    // Feld 1: Gewinner(1) vs Gewinner(2)
    // Feld 2: Gewinner(3) vs Verlierer(1)
    // Feld 3: Verlierer(2) vs Verlierer(3)
    const pairs = [
      { teamA: winners[0], teamB: winners[1], field: 1 }, // Feld 1
      { teamA: winners[2], teamB: losers[0],  field: 2 }, // Feld 2
      { teamA: losers[1],  teamB: losers[2],  field: 3 }  // Feld 3
    ];

    // Sicherheit: explizit nach field sortieren, bevor wir einfügen
    pairs.sort((a, b) => a.field - b.field);

    // Löschung + Inserts deterministisch und atomar ausführen
    db.serialize(() => {
      // Transaktion starten (blockiert konkurrierende Writer, bis Commit/Rollback)
      db.run("BEGIN IMMEDIATE", (errBegin) => {
        if (errBegin) {
          return res.status(500).json({ error: "Konnte Transaktion nicht starten: " + errBegin.message });
        }

        // Alte Spiele der Gruppe entfernen
        db.run("DELETE FROM matches WHERE groupName = ?", [groupName], (errDel) => {
          if (errDel) {
            return db.run("ROLLBACK", () => {
              res.status(500).json({ error: "Löschen fehlgeschlagen: " + errDel.message });
            });
          }

          const createdIds = [];

          // Sequenziell einfügen (garantiert Feld 1 -> 2 -> 3)
          const insertNext = (i) => {
            if (i >= pairs.length) {
              // Alles eingefügt -> Commit
              return db.run("COMMIT", (errCommit) => {
                if (errCommit) {
                  return res.status(500).json({ error: "Commit fehlgeschlagen: " + errCommit.message });
                }
                io.emit("resultUpdate", { type: "nextRound", groupName });
                res.json({ success: true, created: pairs.length, createdIds });
              });
            }

            const p = pairs[i];
            db.run(
              "INSERT INTO matches (teamA, teamB, groupName, round, field, scoreA, scoreB, winner) VALUES (?, ?, ?, 1, ?, 0, 0, NULL)",
              [p.teamA, p.teamB, groupName, p.field],
              function (errIns) {
                if (errIns) {
                  return db.run("ROLLBACK", () => {
                    res.status(500).json({ error: "Insert fehlgeschlagen (Feld " + p.field + "): " + errIns.message });
                  });
                }
                // SQLite: neue ID über this.lastID
                if (typeof this.lastID !== 'undefined') {
                  createdIds.push(this.lastID);
                }
                insertNext(i + 1);
              }
            );
          };

          // Start mit erstem Insert
          insertNext(0);
        });
      });
    });
  });

  return router;
};
