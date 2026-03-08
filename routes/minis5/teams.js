// server/routes/minis5/teams.js
// -----------------------------------------------------------------------------
// API-Routen für das Team-Management im 5v5-Modus.
//
// Hauptaufgaben:
// - Alle Teams laden
// - Neues Team anlegen
// - Team löschen
// - Alle Teams löschen (inkl. Autoincrement-Reset)
// - Live-Events an den 5v5-Viewer senden
//
// Diese Datei ist vollständig getrennt vom 3v3-Team-System.
// -----------------------------------------------------------------------------

const express = require('express');
const db = require('../../db');

module.exports = function(io5) {
  const router = express.Router();

  // ---------------------------------------------------------------------------
  // GET /api/minis5/teams
  // Liefert alle Teams im 5v5-Modus.
  // Sortiert nach groupName und id.
  // ---------------------------------------------------------------------------
  router.get('/', (req, res) => {
    db.all(
      `SELECT * FROM teams WHERE mode = '5v5' ORDER BY groupName ASC, id ASC`,
      [],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows || []);
      }
    );
  });

  // ---------------------------------------------------------------------------
  // POST /api/minis5/teams
  // Legt ein neues Team an.
  //
  // Body:
  //   { name, groupName }
  //
  // Validierung:
  //   - name muss vorhanden sein
  //   - groupName muss vorhanden sein
  //
  // Danach:
  //   - Team einfügen
  //   - Live-Event an 5v5-Viewer senden
  // ---------------------------------------------------------------------------
  router.post('/', (req, res) => {
    const { name, groupName } = req.body;
    const grp = (groupName || '').trim().toUpperCase();

    if (!name || !grp) {
      return res.status(400).json({ error: 'Name und Gruppe erforderlich.' });
    }

    db.run(
      `INSERT INTO teams (name, groupName, mode) VALUES (?, ?, '5v5')`,
      [name, grp],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        io5.emit("teams:updated"); // nur 5v5-Viewer

        res.json({ id: this.lastID, name, groupName: grp });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/minis5/teams/:id
  // Löscht ein einzelnes Team im 5v5-Modus.
  //
  // Danach:
  //   - Live-Event an 5v5-Viewer senden
  // ---------------------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    db.run(
      `DELETE FROM teams WHERE id = ? AND mode = '5v5'`,
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        io5.emit("teams:updated");

        res.json({ ok: true });
      }
    );
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/minis5/teams
  // Löscht ALLE Teams im 5v5-Modus.
  //
  // Ablauf:
  //   - DELETE FROM teams
  //   - Autoincrement zurücksetzen (sqlite_sequence)
  //   - Live-Event senden
  // ---------------------------------------------------------------------------
  router.delete('/', (req, res) => {
    db.run(
      `DELETE FROM teams WHERE mode = '5v5'`,
      [],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        db.run(
          `DELETE FROM sqlite_sequence WHERE name='teams'`,
          [],
          () => {
            io5.emit("teams:updated");
            res.json({ ok: true });
          }
        );
      }
    );
  });

  return router;
};
