
// server.js
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);


const fs = require('fs');

// … deine existierenden app.use('/api/…') Routen …

// "Pretty URLs" für Admin/Viewer (ohne .html)
app.get('/3v3/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '3v3', 'admin.html'));
});
app.get('/3v3/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', '3v3', 'viewer.html'));
});


// Socket.io einrichten
const io = require('socket.io')(server, { cors: { origin: '*' } });
const io3 = io.of("/minis3");
const io5 = io.of("/minis5");
// io im app-Objekt verfügbar machen, z.B. für Broadcasts
app.set('io', io);

// Besucher der Seite tracken
let viewerCount3 = 0;
let viewerCount5 = 0;
let totalVisitors3 = 0;
let totalVisitors5 = 0;

io.of("/minis3").on("connection", socket => {
  const isAdmin = socket.handshake.query.admin === "true";
  
  if (!isAdmin) {
    viewerCount3++;
    totalVisitors3++;
  }
  io.of("/minis3").emit("totalVisitors3", totalVisitors3);

  // allen Clients neue Zahl schicken
  io.of("/minis3").emit("viewerCount3", viewerCount3);

  socket.on("disconnect", () => {
    if (!isAdmin) {
      viewerCount3--;
      io.of("/minis3").emit("viewerCount3", viewerCount3);
	}
  });
});
io.of("/minis5").on("connection", socket => {
  const isAdmin = socket.handshake.query.admin === "true";
  
  if (!isAdmin) {
    viewerCount5++;
    totalVisitors5++;
  }
  io.of("/minis5").emit("totalVisitors5", totalVisitors5);

  // allen Clients neue Zahl schicken
  io.of("/minis5").emit("viewerCount5", viewerCount5);

  socket.on("disconnect", () => {
	if (!isAdmin) {
      viewerCount5--;
      io.of("/minis5").emit("viewerCount5", viewerCount5);
	}
  });
});

app.use(cors());
app.use(bodyParser.json());

// Statische Dateien aus dem Ordner "public" bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// DB laden (sqlite3 Handle aus db.js)
const db = require('./db'); // <- sqlite3-Instanz

// Routen importieren
const teamsRouter = require('./routes/teams')(io3);
const matchesRouter = require('./routes/matches')(io3);
const resultsRouter = require('./routes/results')(io3);
const funinoRouter = require('./routes/funino')(io3);
const scheduleRouter = require('./routes/schedule')(io3);
const reseedRouterFactory = require('./routes/reseedGroups')(db, io3);
const adminOpsRouter = require('./routes/adminOps')(io3);
const historyRouter = require('./routes/history')(io3);
const metaRouter = require('./routes/meta')(io3);
const qrRouter = require('./routes/qr');

// minis5
const minis5Router = require('./routes/minis5')(io5);
const minis5TeamsRouter = require('./routes/minis5/teams')(io5);
const minis5MatchesRouter = require('./routes/minis5/matches')(io5);

// Routen registrieren
app.use('/api/teams', teamsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/results', resultsRouter);
app.use('/api/funino', funinoRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/funino', reseedRouterFactory);
app.use('/api/adminOps', adminOpsRouter);
app.use('/api/history', historyRouter);
app.use('/api/meta', metaRouter);
app.use('/api/qr', qrRouter);

// minis5
app.use('/api/minis5', minis5Router);
app.use('/api/minis5/teams', minis5TeamsRouter);
app.use('/api/minis5/matches', minis5MatchesRouter);

// ---------------------------------------------
// RESET ROUTES MIT SOCKET-BROADCASTS
// ---------------------------------------------

// Reset 3v3 Modul
app.post('/admin/reset-3v3', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams WHERE mode = '3v3';
      DELETE FROM matches WHERE mode = '3v3';
      DELETE FROM match_history WHERE mode = '3v3';
      DELETE FROM group_state; -- 3v3 nutzt nur eine group_state Tabelle
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


// Reset 5v5 Modul
app.post('/admin/reset-5v5', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams WHERE mode = '5v5';
      DELETE FROM matches WHERE mode = '5v5';
      DELETE FROM match_history WHERE mode = '5v5';
      -- group_state NICHT löschen, das ist nur für 3v3
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


// Komplett-Reset (alle Module)
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


// Server starten
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
