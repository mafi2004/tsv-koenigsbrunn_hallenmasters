// server.js
// -----------------------------------------------------------------------------
// Haupt-Serverdatei des Turniersystems.
// -----------------------------------------------------------------------------

const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

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

// FESTIVAL ADMIN + VIEWER
app.get('/festival/g1/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'festival', 'g1', 'admin.html'));
});
app.get('/festival/g2/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'festival', 'g2', 'admin.html'));
});
app.get('/festival/g1/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'festival', 'g1', 'viewer.html'));
});
app.get('/festival/g2/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'festival', 'g2', 'viewer.html'));
});

// FIX 6 – Pretty Redirects
app.get('/festival/g1', (req, res) => res.redirect('/festival/g1/admin'));
app.get('/festival/g2', (req, res) => res.redirect('/festival/g2/admin'));

// -----------------------------------------------------------------------------
// Socket.io einrichten
// -----------------------------------------------------------------------------
const io = require('socket.io')(server, { cors: { origin: '*' } });
const io3 = io.of("/minis3");
const io5 = io.of("/minis5");
const ioF_g1 = io.of("/festival_g1");
const ioF_g2 = io.of("/festival_g2");

app.set('io', io);

// -----------------------------------------------------------------------------
// Viewer-Tracking (3v3 + 5v5)
// -----------------------------------------------------------------------------
let viewerCount3 = 0;
let viewerCount5 = 0;
let totalVisitors3 = 0;
let totalVisitors5 = 0;

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
// Routen importieren (Festival)
// -----------------------------------------------------------------------------
const festivalTeamsRouter     = require('./routes/festival/teams');
const festivalMatchesRouter   = require('./routes/festival/matches');
const festivalRedisRouter     = require('./routes/festival/redistribute');
const festivalMetaRouter      = require('./routes/festival/meta');

// -----------------------------------------------------------------------------
// Routen registrieren
// -----------------------------------------------------------------------------

// 3v3
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

// Festival g1 (KORREKTES MOUNTING)
app.use('/api/festival/g1', festivalTeamsRouter(ioF_g1));
app.use('/api/festival/g1', festivalMatchesRouter(ioF_g1));
app.use('/api/festival/g1', festivalRedisRouter(db, ioF_g1));
app.use('/api/festival/g1', festivalMetaRouter(ioF_g1));

// Festival g2 (KORREKTES MOUNTING)
app.use('/api/festival/g2', festivalTeamsRouter(ioF_g2));
app.use('/api/festival/g2', festivalMatchesRouter(ioF_g2));
app.use('/api/festival/g2', festivalRedisRouter(db, ioF_g2));
app.use('/api/festival/g2', festivalMetaRouter(ioF_g2));

console.log("Namespaces:", io._nsps.keys());

// -----------------------------------------------------------------------------
// RESET-ROUTES
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
    io3.emit("reset-3v3");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
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
    io5.emit("reset-5v5");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --- Reset Festival G1 ---
app.post('/admin/reset-festival-g1', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams   WHERE mode = 'g1';
      DELETE FROM matches WHERE mode = 'g1';
      DELETE FROM match_history WHERE mode = 'g1';
      VACUUM;
    `);
    ioF_g1.emit("reset-festival-g1");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// --- Reset Festival G2 ---
app.post('/admin/reset-festival-g2', async (req, res) => {
  try {
    await db.exec(`
      DELETE FROM teams   WHERE mode = 'g2';
      DELETE FROM matches WHERE mode = 'g2';
      DELETE FROM match_history WHERE mode = 'g2';
      VACUUM;
    `);
    ioF_g2.emit("reset-festival-g2");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
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
    io3.emit("reset-all");
    io5.emit("reset-all");
    ioF_g1.emit("reset-all");
    ioF_g2.emit("reset-all");
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// -----------------------------------------------------------------------------
// Server starten
// -----------------------------------------------------------------------------
if (require.main === module) {
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`Backend läuft auf Port ${PORT}`);
  });
}

module.exports = app;
