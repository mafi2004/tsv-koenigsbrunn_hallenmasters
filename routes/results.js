// server/routes/results.js
// -----------------------------------------------------------------------------
// Diese Datei stellt die API zum Setzen eines Siegers für ein einzelnes Match bereit.
//
// Hauptaufgaben:
// - Sieger eines Spiels setzen (POST /results/winner)
// - Validierung: Sieger muss Team A oder Team B sein
// - Transaktion: winner setzen → Log schreiben → Snapshot erzeugen
// - Live-Events an Admin-UI und Viewer senden
//
// Diese Route ist die zentrale Stelle, an der Ergebnisse ins System geschrieben werden.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // POST /results/winner
  // Setzt den Sieger eines Matches.
  //
  // Body:
  //   { matchId, winner }
  //
  // Ablauf:
  // 1) Validierung der IDs
  // 2) Match laden
  // 3) Prüfen, ob winner zu Team A/B gehört
  // 4) Transaktion:
  //      - UPDATE matches SET winner = ?
  //      - appendOp (Admin-Log)
  //      - Snapshot erzeugen
  // 5) Live-Events senden
  //
  // Rückgabe:
  //   { success: true, matchId, winner }
  // ---------------------------------------------------------------------------
  router.post('/winner', (req, res) => {
    const { matchId, winner } = req.body;

    const mid = Number(matchId);
    const wId = Number(winner);

    // --- Validierung ---
    if (!Number.isFinite(mid)) {
      return res.status(400).json({ error: 'Ungültige MatchId' });
    }
    if (!Number.isFinite(wId)) {
      return res.status(400).json({ error: 'Ungültiger Sieger (winner muss eine Zahl sein)' });
    }

    // --- Match laden ---
    db.get(
      `SELECT id, teamA, teamB, groupName, round, field
       FROM matches
       WHERE id = ?`,
      [mid],
      (selErr, row) => {
        if (selErr) return res.status(500).json({ error: selErr.message });
        if (!row) return res.status(404).json({ error: 'Match nicht gefunden' });

        const teamA = Number(row.teamA);
        const teamB = Number(row.teamB);

        // Sieger muss Team A oder Team B sein
        if (![teamA, teamB].includes(wId)) {
          return res.status(400).json({ error: 'Sieger gehört nicht zu Team A/B dieses Spiels' });
        }

        // --- Transaktion ---
        db.run(`BEGIN IMMEDIATE`, (eBegin) => {
          if (eBegin) {
            return res.status(500).json({ error: 'Transaktion start fehlgeschlagen: ' + eBegin.message });
          }

          // Sieger setzen
          db.run(
            `UPDATE matches SET winner = ? WHERE id = ? AND mode='3v3'`,
            [wId, mid],
            function (updErr) {
              if (updErr) {
                return db.run(`ROLLBACK`, () =>
                  res.status(500).json({ error: updErr.message })
                );
              }

              // Admin-Log schreiben
              appendOp(db, 'results:winner', {
                matchId: mid,
                winner: wId,
                groupName: row.groupName,
                round: row.round,
                field: row.field
              })
                .then(() => {
                  // COMMIT
                  db.run(`COMMIT`, async (eCommit) => {
                    if (eCommit) {
                      return res.status(500).json({ error: 'Commit fehlgeschlagen: ' + eCommit.message });
                    }

                    // Snapshot erzeugen
                    try { await makeSnapshot(db); } catch {}

                    // Live-Events
                    io3.emit('results:updated', { matchId: mid, winner: wId });
                    io3.emit('resultUpdate',    { matchId: mid, winner: wId });

                    res.json({ success: true, matchId: mid, winner: wId });
                  });
                })
                .catch((logErr) => {
                  db.run(`ROLLBACK`, () =>
                    res.status(500).json({ error: 'Log-Fehler: ' + logErr.message })
                  );
                });
            }
          );
        });
      }
    );
  });

  return router;
};
