// server/routes/teams.js
// -----------------------------------------------------------------------------
// Diese Datei verwaltet alle Team-Operationen für den 3v3-Modus.
//
// Hauptaufgaben:
// - Alle Teams laden
// - Neues Team hinzufügen
// - Team löschen
// - Teamnamen ändern
// - Alle Teams löschen (inkl. Autoincrement-Reset)
// - Admin-Log + Snapshot erzeugen
// - Live-Events an Admin-UI und Viewer senden
//
// Die Teams sind Grundlage für Gruppenzuordnung, Spielplan und Reseed.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // GET /api/teams
  // Liefert alle Teams im 3v3-Modus.
  // Wird vom Admin-Panel genutzt.
  // ---------------------------------------------------------------------------
  router.get('/', (req, res) => {
    db.all(
      `SELECT * FROM teams WHERE mode = '3v3'`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/teams
  // Fügt ein neues Team hinzu.
  //
  // Body:
  //   { name, groupName }
  //
  // Ablauf:
  // - Name validieren
  // - Team einfügen
  // - Admin-Log + Snapshot
  // - Live-Event senden
  // ---------------------------------------------------------------------------
  router.post('/', async (req, res) => {
    const { name, groupName } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Teamname fehlt' });
    }

    const grp = groupName ? String(groupName).trim().toUpperCase() : null;

    db.run(
      `INSERT INTO teams (name, groupName, mode) VALUES (?, ?, '3v3')`,
      [name, grp],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // Admin-Log + Snapshot
        try {
          await appendOp(db, 'team:add', { id: this.lastID, name, groupName: grp });
          await makeSnapshot(db);
        } catch {}

        io3.emit("teams:updated");

        res.json({ id: this.lastID, name, groupName: grp });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/teams/:id
  // Löscht ein einzelnes Team.
  //
  // Ablauf:
  // - Team löschen
  // - Admin-Log + Snapshot
  // - Live-Event senden
  // ---------------------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    const id = Number(req.params.id);

    db.run(
      `DELETE FROM teams WHERE id = ? AND mode = '3v3'`,
      [id],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await appendOp(db, 'team:del', { id });
          await makeSnapshot(db);
        } catch {}

        io3.emit("teams:updated");

        res.json({ success: true, deletedId: id });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/teams/:id
  // Ändert den Namen eines Teams.
  //
  // Body:
  //   { name }
  //
  // Ablauf:
  // - Validierung
  // - UPDATE teams
  // - Live-Event senden
  // ---------------------------------------------------------------------------
  router.patch('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { name } = req.body;

      if (!id || !name || !name.trim()) {
        return res.status(400).json({ ok: false, msg: 'Ungültige Daten.' });
      }

      await db.run(
        `UPDATE teams SET name = ? WHERE id = ? AND mode='3v3'`,
        [name.trim(), id]
      );

      if (io3) {
        io3.emit('teams:updated', { id, name });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('PATCH /teams/:id Fehler:', err);
      res.status(500).json({ ok: false, msg: err.message });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/teams
  // Löscht ALLE Teams im 3v3-Modus.
  //
  // Ablauf:
  // - DELETE FROM teams
  // - Autoincrement zurücksetzen (sqlite_sequence)
  // - Admin-Log + Snapshot
  // - Live-Event senden
  // ---------------------------------------------------------------------------
  router.delete('/', (req, res) => {
    db.run(
      `DELETE FROM teams WHERE mode = '3v3'`,
      [],
      async function (err) {
        if (err) return res.status(500).json({ error: err.message });

        db.run(
          `DELETE FROM sqlite_sequence WHERE name = 'teams'`,
          [],
          async () => {
            try {
              await appendOp(db, 'team:delAll', {});
              await makeSnapshot(db);
            } catch {}

            io3.emit("teams:updated");

            res.json({ ok: true, deletedAll: true });
          }
        );
      }
    );
  });

  return router;
};
