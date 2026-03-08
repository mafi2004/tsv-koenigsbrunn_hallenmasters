// server.js
// -----------------------------------------------------------------------------
// Haupt-Serverdatei des Turniersystems.
//
// Verantwortlichkeiten:
// - Express-Server + HTTP-Server starten
// - Socket.io für 3v3 (/minis3) und 5v5 (/minis5) initialisieren
// - Viewer-Tracking (aktuelle Zuschauer + Gesamtbesucher)
// - Statische Dateien bereitstellen (Admin/Viewer)
// - Alle API-Routen registrieren (3v3 + 5v5)
// - Reset-Endpunkte für 3v3, 5v5 und Komplett-Reset
//
// Diese Datei verbindet das gesamte Backend zu einem funktionierenden System.
// -----------------------------------------------------------------------------

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// -----------------------------------------------------------------------------
// Pretty URLs für Admin/Viewer (ohne .html)
// -----------------------------------------------------------------------------
app.get('/3v3/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '3v3', 'admin.html'));
});
app.get('/3v3/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '3v3', 'viewer.html'));
});

// -----------------------------------------------------------------------------
// Socket.io einrichten
// Zwei Namespaces:
//   /minis3 → 3v3-Modus
//   /minis5 → 5v5-Modus
// -----------------------------------------------------------------------------
const io = require('socket.io')(server, { cors: { origin: '*' } });
const io3 = io.of("/minis3");
const io5 = io.of("/minis5");

// io global verfügbar machen (z. B. für Broadcasts in Routen)
app.set('io', io);

// -----------------------------------------------------------------------------
// Viewer-Tracking (Live-Zuschauer + Gesamtbesucher)
// Für Admins wird nicht gezählt.
// -----------------------------------------------------------------------------
let viewerCount3 = 0;
let viewerCount5 = 0;
let totalVisitors3 = 0;
let totalVisitors5 = 0;

// --- 3v3 Viewer-Tracking ---
io3.on("connection", socket => {
  const isAdmin = socket.handshake.query.admin === "true";

  if (!isAdmin) {
    viewerCount3++;
    totalVisitors3++;
  }

  io3.emit("totalVisitors3", totalVisitors3);
  io3.emit("viewerCount3", viewerCount3);

  socket.on("disconnect", () => {
    if (!isAdmin) {
      viewerCount3--;
      io3.emit("viewerCount3", viewerCount3);
    }
  });
});

// --- 5v5 Viewer-Tracking ---
io5.on("connection", socket => {
  const isAdmin = socket.handshake.query.admin === "true";

  if (!isAdmin) {
    viewerCount5++;
    totalVisitors5++;
  }

  io5.emit("totalVisitors5", totalVisitors5);
  io5.emit("viewerCount5", viewerCount5);

  socket.on("disconnect", () => {
    if (!isAdmin) {
      viewerCount5--;
      io5.emit("viewerCount5", viewerCount5);
    }
  });
});

// -----------------------------------------------------------------------------
// Middleware
// -----------------------------------------------------------------------------
app.use(cors());
app.use(bodyParser.json());

// Statische Dateien aus /public
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------------------------------------------------------
// Datenbank laden
// -----------------------------------------------------------------------------
const db = require('./db');

// -----------------------------------------------------------------------------
// Routen importieren (3v3)
// -----------------------------------------------------------------------------
const teamsRouter       = require('./routes/teams')(io3);
const matchesRouter     = require('./routes/matches')(io3);
const resultsRouter     = require('./routes/results')(io3);
const funinoRouter      = require('./routes/funino')(io3);
const scheduleRouter    = require('./routes/schedule')(io3);
const reseedRouter      = require('./routes/reseedGroups')(db, io3);
const adminOpsRouter    = require('./routes/adminOps')(io3);
const historyRouter     = require('./routes/history')(io3);
const metaRouter        = require('./routes/meta')(io3);
const qrRouter          = require('./routes/qr');

// -----------------------------------------------------------------------------
// Routen importieren (5v5)
// -----------------------------------------------------------------------------
const minis5Router        = require('./routes/minis5')(io5);
const minis5TeamsRouter   = require('./routes/minis5/teams')(io5);
const minis5MatchesRouter = require('./routes/minis5/matches')(io5);

// -----------------------------------------------------------------------------
// Routen registrieren
// -----------------------------------------------------------------------------
app.use('/api/teams', teamsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/results', resultsRouter);
app.use('/api/funino', funinoRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/funino', reseedRouter);
app.use('/api/adminOps', adminOpsRouter);
app.use('/api/history', historyRouter);
app.use('/api/meta', metaRouter);
app.use('/api/qr', qrRouter);

// 5v5
app.use('/api/minis5', minis5Router);
app.use('/api/minis5/teams', minis5TeamsRouter);
app.use('/api/minis5/matches', minis5MatchesRouter);

// -----------------------------------------------------------------------------
// RESET-ROUTES (mit Socket-Broadcasts)
// Diese Endpunkte setzen Module oder das gesamte Turnier zurück.
// -----------------------------------------------------------------------------

// --- Reset 3v3 ---
app.post('/admin/reset-3v3', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams WHERE mode = '3v3';
      DELETE FROM matches WHERE mode = '3v3';
      DELETE FROM match_history WHERE mode = '3v3';
      DELETE FROM group_state;
      VACUUM;
    `);

    console.log("3v3 Modul zurückgesetzt");
    io3.emit("reset-3v3");

    res.json({ success: true, message: "3v3 Modul erfolgreich zurückgesetzt" });

  } catch (err) {
    console.error("Fehler beim Reset 3v3:", err);
    res.status(500).json({ success: false, message: "Fehler beim Reset 3v3" });
  }
});

// --- Reset 5v5 ---
app.post('/admin/reset-5v5', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams WHERE mode = '5v5';
      DELETE FROM matches WHERE mode = '5v5';
      DELETE FROM match_history WHERE mode = '5v5';
      VACUUM;
    `);

    console.log("5v5 Modul zurückgesetzt");
    io5.emit("reset-5v5");

    res.json({ success: true, message: "5v5 Modul erfolgreich zurückgesetzt" });

  } catch (err) {
    console.error("Fehler beim Reset 5v5:", err);
    res.status(500).json({ success: false, message: "Fehler beim Reset 5v5" });
  }
});

// --- Komplett-Reset ---
app.post('/admin/reset-all', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams;
      DELETE FROM matches;
      DELETE FROM match_history;
      DELETE FROM group_state;
      DELETE FROM admin_ops;
      DELETE FROM admin_snapshots;
      UPDATE tournament_meta SET 
        yearLabel = NULL,
        timeHHMM = NULL,
        dur = NULL,
        brk = NULL,
        updatedAt = datetime('now');
      VACUUM;
    `);

    console.log("Komplett-Reset durchgeführt");
    io3.emit("reset-all");
    io5.emit("reset-all");

    res.json({ success: true, message: "Komplett‑Reset erfolgreich durchgeführt" });

  } catch (err) {
    console.error("Fehler beim Komplett‑Reset:", err);
    res.status(500).json({ success: false, message: "Fehler beim Komplett‑Reset" });
  }
});

// -----------------------------------------------------------------------------
// Server starten
// -----------------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
