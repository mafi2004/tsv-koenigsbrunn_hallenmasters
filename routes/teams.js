const express = require('express');
const router = express.Router();
const db = require('../db');

// Alle Teams abrufen
router.get('/', (req, res) => {
  db.all("SELECT * FROM teams", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Neues Team hinzufügen
router.post('/', (req, res) => {
  const { name, groupName } = req.body;
  if (!name) return res.status(400).json({ error: "Teamname fehlt" });

  db.run("INSERT INTO teams (name, groupName) VALUES (?, ?)", [name, groupName || null], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID, name, groupName });
  });
});

// Team löschen
router.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.run("DELETE FROM teams WHERE id = ?", [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deletedId: id });
  });
});

module.exports = router;
