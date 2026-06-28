// server/routes/festival/teams.js
// -----------------------------------------------------------------------------
// Teams für das Outdoor-Festival.
// Extrem einfache Struktur:
// - Keine Gruppen
// - Nur eine flache Teamliste
// - mode='festival'
// - Admin-Log + Snapshot + Live-Events
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../../db');
const { appendOp, makeSnapshot } = require('../../utils/recovery');

module.exports = (ioF) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // GET /api/festival/teams
  // Liefert alle Festival-Teams.
  // ---------------------------------------------------------------------------
  router.get('/', (req, res) => {
    db.all(
      `SELECT id, name, wins, field FROM teams WHERE mode='festival' ORDER BY id ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/festival/teams
  // Fügt ein neues Team hinzu.
  //
  // Body:
  //   { name }
  // ---------------------------------------------------------------------------
  router.post('/', (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Teamname fehlt' });
    }

    db.run(
      `INSERT INTO teams (name, groupName, mode) VALUES (?, NULL, 'festival')`,
      [name],
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

  // ---------------------------------------------------------------------------
  // PATCH /api/festival/teams/:id
  // Teamnamen ändern.
  // ---------------------------------------------------------------------------
  router.patch('/:id', (req, res) => {
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();

    if (!id || !name) {
      return res.status(400).json({ error: 'Ungültige Daten.' });
    }

    db.run(
      `UPDATE teams SET name=? WHERE id=? AND mode='festival'`,
      [name, id],
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

  // ---------------------------------------------------------------------------
  // DELETE /api/festival/teams/:id
  // Einzelnes Team löschen.
  // ---------------------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);

    db.run(
      `DELETE FROM teams WHERE id=? AND mode='festival'`,
      [id],
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

  // ---------------------------------------------------------------------------
// POST /api/festival/teams/:id/wins
// Siege eines Teams setzen
// ---------------------------------------------------------------------------
router.post('/:id/wins', (req, res) => {
  const id = Number(req.params.id);
  const wins = Number(req.body?.wins || 0);

  if (!id) {
    return res.status(400).json({ error: 'Ungültige Team-ID' });
  }

  db.run(
    `UPDATE teams SET wins=? WHERE id=? AND mode='festival'`,
    [wins, id],
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

  // ---------------------------------------------------------------------------
  // DELETE /api/festival/teams
  // Alle Festival-Teams löschen.
  // ---------------------------------------------------------------------------
  router.delete('/', (req, res) => {
    db.run(
      `DELETE FROM teams WHERE mode='festival'`,
      [],
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
