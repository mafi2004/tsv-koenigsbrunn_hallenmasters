
const express = require('express');
const db = require('../db');
const { appendOp, makeSnapshot } = require('../utils/recovery');

module.exports = (io3) => {
	const router = express.Router();
	
	// Alle Teams abrufen
	router.get('/', (req, res) => {
	  db.all(`SELECT * FROM teams WHERE mode = '3v3'`, [], (err, rows) => {
		if (err) return res.status(500).json({ error: err.message });
		res.json(rows);
	  });
	});

	// Neues Team hinzufügen
	router.post('/', async (req, res) => {
	  const { name, groupName } = req.body;
	  if (!name) return res.status(400).json({ error: 'Teamname fehlt' });
	  const grp = groupName ? String(groupName).trim().toUpperCase() : null;

	  db.run(
		`INSERT INTO teams (name, groupName, mode) VALUES (?, ?, '3v3')`,
		[name, grp],
		async function (err) {
		  if (err) return res.status(500).json({ error: err.message });

		  // Log + Snapshot
		  try {
			await appendOp(db, 'team:add', { id: this.lastID, name, groupName: grp });
			await makeSnapshot(db);
		  } catch {}
		  
		  io3.emit("teams:updated");

		  res.json({ id: this.lastID, name, groupName: grp });
		}
	  );
	});

	// Team löschen
	router.delete('/:id', (req, res) => {
	  const id = Number(req.params.id);
	  db.run(`DELETE FROM teams WHERE id = ? AND mode = '3v3'`, [id], async function (err) {
		if (err) return res.status(500).json({ error: err.message });

		// Log + Snapshot
		try {
		  await appendOp(db, 'team:del', { id });
		  await makeSnapshot(db);
		} catch {}
		
		io3.emit("teams:updated");

		res.json({ success: true, deletedId: id });
	  });
	});

	router.patch('/:id', async (req, res) => {
		try {
			const id = Number(req.params.id);
			const { name } = req.body;

			if (!id || !name || !name.trim()) {
			return res.status(400).json({ ok: false, msg: 'Ungültige Daten.' });
			}

			await db.run(`UPDATE teams SET name = ? WHERE id = ? AND mode='3v3'`,
			[name.trim(), id]
			);

			// Viewer live aktualisieren
			if (io3) {
			io3.emit('teams:updated', { id, name });
			}

			res.json({ ok: true });
		} catch (err) {
			console.error('PATCH /teams/:id Fehler:', err);
			res.status(500).json({ ok: false, msg: err.message });
		}
		});


	// Alle Teams löschen (+ Autoincrement zurücksetzen)
	router.delete('/', (req, res) => {
	  db.run(`DELETE FROM teams WHERE mode = '3v3'`, [], async function (err) {
		if (err) return res.status(500).json({ error: err.message });

		db.run(`DELETE FROM sqlite_sequence WHERE name = 'teams'`, [], async () => {
		  // Log + Snapshot
		  try {
			await appendOp(db, 'team:delAll', {});
			await makeSnapshot(db);
		  } catch {}
		  
		  io3.emit("teams:updated");

		  res.json({ ok: true, deletedAll: true });
		});
	  });
	});

  return router;
};