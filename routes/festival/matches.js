// server/routes/festival/matches.js
// -----------------------------------------------------------------------------
// Matches für das Outdoor-Festival (g1 / g2).
// Keine Gruppen, keine Rundenlogik – nur flache Matches pro Feld.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../../db');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (ioF) => {
  const router = express.Router();

  // Modus aus Base-URL extrahieren (g1 oder g2)
  function getMode(req) {
    return req.baseUrl.split('/').pop(); // "g1" oder "g2"
  }

  // ---------------------------------------------------------------------------
  // GET /api/festival/g1/matches
  // ---------------------------------------------------------------------------
  router.get('/matches', (req, res) => {
    const mode = getMode(req);

    db.all(
      `SELECT id, teamA, teamB, field, scoreA, scoreB, winner, plannedStart
       FROM matches
       WHERE mode=?
       ORDER BY id ASC`,
      [mode],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/festival/g1/matches
  // Body: { teamA, teamB, field }
  // ---------------------------------------------------------------------------
  router.post('/matches', (req, res) => {
    const mode = getMode(req);
    const { teamA, teamB, field } = req.body;

    if (!teamA || !teamB || !field) {
      return res.status(400).json({ error: 'Ungültige Match-Daten' });
    }

    db.run(
      `INSERT INTO matches
       (teamA, teamB, field, scoreA, scoreB, winner, plannedStart, mode)
       VALUES (?, ?, ?, 0, 0, NULL, NULL, ?)`,
      [teamA, teamB, field, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:match:add', {
            id: this.lastID,
            teamA,
            teamB,
            field,
            mode
          });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:matches:updated');
        res.json({ id: this.lastID, teamA, teamB, field });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/festival/g1/matches/:id/score
  // Body: { scoreA, scoreB, winner }
  // ---------------------------------------------------------------------------
  router.post('/matches/:id/score', (req, res) => {
    const mode = getMode(req);
    const id = Number(req.params.id);
    const { scoreA, scoreB, winner } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Ungültige Match-ID' });
    }

    db.run(
      `UPDATE matches
       SET scoreA=?, scoreB=?, winner=?
       WHERE id=? AND mode=?`,
      [scoreA, scoreB, winner, id, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:match:score', {
            id,
            scoreA,
            scoreB,
            winner
          });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:matches:updated');
        res.json({ ok: true });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/festival/g1/matches/:id
  // ---------------------------------------------------------------------------
  router.delete('/matches/:id', (req, res) => {
    const mode = getMode(req);
    const id = Number(req.params.id);

    db.run(
      `DELETE FROM matches WHERE id=? AND mode=?`,
      [id, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:match:del', { id });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:matches:updated');
        res.json({ ok: true, deletedId: id });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/festival/g1/matches
  // ---------------------------------------------------------------------------
  router.delete('/matches', (req, res) => {
    const mode = getMode(req);

    db.run(
      `DELETE FROM matches WHERE mode=?`,
      [mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:match:delAll', {});
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:matches:updated');
        res.json({ ok: true, deletedAll: true });
      }
    );
  });

  return router;
};
