// backend/modules/festival/redistribute.js
const express = require("express");
const router = express.Router();

module.exports = (db, ioF) => {

  router.post("/", async (req, res) => {
    try {
      const { fieldCount } = req.body;

      if (!fieldCount || fieldCount < 1) {
        return res.status(400).json({ error: "fieldCount fehlt oder ungültig" });
      }

      // Teams holen (sortiert nach Siegen)
      const teams = await new Promise((resolve, reject) => {
        db.all(
          "SELECT * FROM teams WHERE mode='festival' ORDER BY wins DESC, name ASC",
          [],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      if (!teams.length) {
        return res.json({ ok: true, message: "Keine Teams vorhanden" });
      }

      // Paarbildung: immer 2 Teams pro Feld
      let field = 1;

      for (let i = 0; i < teams.length; i++) {
        const t = teams[i];

        await new Promise((resolve, reject) => {
          db.run(
            "UPDATE teams SET field = ? WHERE id = ?",
            [field, t.id],
            (err) => err ? reject(err) : resolve()
          );
        });

        // Nach jedem 2er-Paar Feld erhöhen
        if (i % 2 === 1) {
          field++;
          if (field > fieldCount) field = 1;
        }
      }

      ioF.emit("festival:teams:updated");

      res.json({ ok: true });

    } catch (err) {
      console.error("Fehler bei redistribute:", err);
      res.status(500).json({ error: "Serverfehler bei redistribute" });
    }
  });

  return router;
};
