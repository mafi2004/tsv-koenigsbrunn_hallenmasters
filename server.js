
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

// Server starten
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
