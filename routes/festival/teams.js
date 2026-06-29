// server/routes/festival/teams.js
const express = require('express');
const db = require('../../db');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (ioF) => {
  const router = express.Router();

  // Modus aus Base-URL extrahieren (g1 oder g2)
  function getMode(req) {
    return req.baseUrl.split('/').pop();
  }

  // GET /api/festival/g1/teams
  router.get('/teams', (req, res) => {
    const mode = getMode(req);

    db.all(
      `SELECT id, name, wins, field FROM teams WHERE mode=? ORDER BY id ASC`,
      [mode],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // POST /api/festival/g1/teams
  router.post('/teams', (req, res) => {
    const mode = getMode(req);
    const name = String(req.body?.name || '').trim();

    if (!name) {
      return res.status(400).json({ error: 'Teamname fehlt' });
    }

    db.run(
      `INSERT INTO teams (name, groupName, mode) VALUES (?, NULL, ?)`,
      [name, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:team:add', { id: this.lastID, name });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:teams:updated');
        res.json({ id: this.lastID, name });
      }
    );
  });

  // PATCH /api/festival/g1/teams/:id
  router.patch('/teams/:id', (req, res) => {
    const mode = getMode(req);
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();

    if (!id || !name) {
      return res.status(400).json({ error: 'Ungültige Daten.' });
    }

    db.run(
      `UPDATE teams SET name=? WHERE id=? AND mode=?`,
      [name, id, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:team:rename', { id, name });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:teams:updated', { id, name });
        res.json({ ok: true });
      }
    );
  });

  // DELETE /api/festival/g1/teams/:id
  router.delete('/teams/:id', (req, res) => {
    const mode = getMode(req);
    const id = Number(req.params.id);

    db.run(
      `DELETE FROM teams WHERE id=? AND mode=?`,
      [id, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:team:del', { id });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:teams:updated');
        res.json({ ok: true, deletedId: id });
      }
    );
  });

  // POST /api/festival/g1/teams/:id/wins
  router.post('/teams/:id/wins', (req, res) => {
    const mode = getMode(req);
    const id = Number(req.params.id);
    const wins = Number(req.body?.wins || 0);

    if (!id) {
      return res.status(400).json({ error: 'Ungültige Team-ID' });
    }

    db.run(
      `UPDATE teams SET wins=? WHERE id=? AND mode=?`,
      [wins, id, mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'festival:team:wins', { id, wins });
          await makeSnapshot(db);
        } catch {}

        ioF.emit('festival:teams:updated');
        res.json({ ok: true });
      }
    );
  });

  // DELETE /api/festival/g1/teams
  router.delete('/teams', (req, res) => {
    const mode = getMode(req);

    db.run(
      `DELETE FROM teams WHERE mode=?`,
      [mode],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        db.run(`DELETE FROM sqlite_sequence WHERE name='teams'`, [], async () => {
          try {
            await appendOp(db, 'festival:team:delAll', {});
            await makeSnapshot(db);
          } catch {}

          ioF.emit('festival:teams:updated');
          res.json({ ok: true, deletedAll: true });
        });
      }
    );
  });

  return router;
};
