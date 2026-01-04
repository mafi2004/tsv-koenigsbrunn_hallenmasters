const express = require('express');
const router = express.Router();
const db = require('../../db');

router.get('/', (req, res) => {
  db.all(`SELECT * FROM teams WHERE mode = '5v5' ORDER BY groupName ASC, id ASC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

router.post('/', (req, res) => {
  const { name, groupName } = req.body;
  const grp = (groupName || '').trim().toUpperCase();
  if (!name || !grp) return res.status(400).json({ error: 'Name und Gruppe erforderlich.' });

  db.run(
    `INSERT INTO teams (name, groupName, mode) VALUES (?, ?, '5v5')`,
    [name, grp],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, name, groupName: grp });
    }
  );
});

router.delete('/:id', (req, res) => {
  db.run(`DELETE FROM teams WHERE id = ? AND mode = '5v5'`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

router.delete('/', (req, res) => {
  db.run(`DELETE FROM teams`, [], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    db.run(`DELETE FROM sqlite_sequence WHERE name='teams'`, [], () => {
      res.json({ ok: true });
    });
  });
});

module.exports = router;
