
const express = require('express');
const router = express.Router();
const db = require('../db');

// Alle Teams abrufen
router.get('/', (req, res) => {
  db.all(`SELECT * FROM teams`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Neues Team hinzufügen
router.post('/', (req, res) => {
  const { name, groupName } = req.body;
  if (!name) return res.status(400).json({ error: 'Teamname fehlt' });

  const grp = groupName ? String(groupName).trim().toUpperCase() : null;

  db.run(
    `INSERT INTO teams (name, groupName) VALUES (?, ?)`,
    [name, grp],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, groupName: grp });
    }
  );
});

// Team löschen
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.run(`DELETE FROM teams WHERE id = ?`, [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deletedId: id });
  });
});

// Alle Teams löschen (+ Autoincrement zurücksetzen)
router.delete('/', (req, res) => {
  db.run(`DELETE FROM teams`, [], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    db.run(`DELETE FROM sqlite_sequence WHERE name = 'teams'`, [], () => {
      res.json({ ok: true, deletedAll: true });
    });
  });
});

module.exports = router;
