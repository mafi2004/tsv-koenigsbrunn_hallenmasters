const express = require('express');
const db = require('../../db');

module.exports = function(io5) {
  const router = express.Router();

  // TEAMS LADEN
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

  // TEAM ANLEGEN
  router.post('/', (req, res) => {
    const { name, groupName } = req.body;
    const grp = (groupName || '').trim().toUpperCase();
    if (!name || !grp)
      return res.status(400).json({ error: 'Name und Gruppe erforderlich.' });

    db.run(
      `INSERT INTO teams (name, groupName, mode) VALUES (?, ?, '5v5')`,
      [name, grp],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // 🔥 nur 5v5-Viewer informieren
        io5.emit("teams:updated");

        res.json({ id: this.lastID, name, groupName: grp });
      }
    );
  });

  // TEAM LÖSCHEN
  router.delete('/:id', (req, res) => {
    db.run(
      `DELETE FROM teams WHERE id = ? AND mode = '5v5'`,
      [req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });

        // 🔥 nur 5v5-Viewer informieren
        io5.emit("teams:updated");

        res.json({ ok: true });
      }
    );
  });

  // ALLE TEAMS LÖSCHEN
  router.delete('/', (req, res) => {
    db.run(`DELETE FROM teams WHERE mode = '5v5'`, [], function (err) {
      if (err) return res.status(500).json({ error: err.message });

      db.run(`DELETE FROM sqlite_sequence WHERE name='teams'`, [], () => {

        // 🔥 nur 5v5-Viewer informieren
        io5.emit("teams:updated");

        res.json({ ok: true });
      });
    });
  });

  return router;
};
