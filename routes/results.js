
const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io) => {
  const router = express.Router();

  // Sieger setzen (mit Validierung + Log + Snapshot)
  router.post('/winner', (req, res) => {
    const { matchId, winner } = req.body;

    const mid = Number(matchId);
    const wId = Number(winner);
    if (!Number.isFinite(mid)) {
      return res.status(400).json({ error: 'Ungültige MatchId' });
    }
    if (!Number.isFinite(wId)) {
      return res.status(400).json({ error: 'Ungültiger Sieger (winner muss eine Zahl sein)' });
    }

    // Match laden
    db.get(
      `SELECT id, teamA, teamB, groupName, round, field FROM matches WHERE id = ?`,
      [mid],
      (selErr, row) => {
        if (selErr) return res.status(500).json({ error: selErr.message });
        if (!row) return res.status(404).json({ error: 'Match nicht gefunden' });

        const teamA = Number(row.teamA);
        const teamB = Number(row.teamB);
        if (![teamA, teamB].includes(wId)) {
          return res.status(400).json({ error: 'Sieger gehört nicht zu Team A/B dieses Spiels' });
        }

        // Transaktion: winner setzen
        db.run(`BEGIN IMMEDIATE`, (eBegin) => {
          if (eBegin) return res.status(500).json({ error: 'Transaktion start fehlgeschlagen: ' + eBegin.message });

          db.run(
            `UPDATE matches SET winner = ? WHERE id = ?`,
            [wId, mid],
            function (updErr) {
              if (updErr) {
                return db.run(`ROLLBACK`, () => res.status(500).json({ error: updErr.message }));
              }

              appendOp(db, 'results:winner', {
                matchId: mid,
                winner: wId,
                groupName: row.groupName,
                round: row.round,
                field: row.field
              })
                .then(() => {
                  db.run(`COMMIT`, async (eCommit) => {
                    if (eCommit) return res.status(500).json({ error: 'Commit fehlgeschlagen: ' + eCommit.message });

                    try { await makeSnapshot(db); } catch {}

                    // Broadcasts
                    io.emit('results:updated', { matchId: mid, winner: wId });
                    io.emit('resultUpdate',    { matchId: mid, winner: wId });

                    res.json({ success: true, matchId: mid, winner: wId });
                  });
                })
                .catch((logErr) => {
                  db.run(`ROLLBACK`, () => res.status(500).json({ error: 'Log-Fehler: ' + logErr.message }));
                });
            }
          );
        });
      }
    );
  });

  return router;
};
