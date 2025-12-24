
const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io einrichten
const io = require('socket.io')(server, { cors: { origin: '*' } });

// io im app-Objekt verfügbar machen
app.set('io', io);

app.use(cors());
app.use(bodyParser.json());

// Statische Dateien aus dem Ordner "public" bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// DB laden (sqlite3 Handle aus db.js)
const db = require('./db');

// Routen importieren
const teamsRouter = require('./routes/teams');
const matchesRouter = require('./routes/matches')(io);
const resultsRouter = require('./routes/results')(io);
const funinoRouter = require('./routes/funino')(io);
const scheduleRouter = require('./routes/schedule');
const reseedRouterFactory = require('./routes/reseedGroups');
const historyRouter = require('./routes/history')(io); // <— NEU

// Routen registrieren
app.use('/api/teams', teamsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/results', resultsRouter);
app.use('/api/funino', funinoRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/funino', reseedRouterFactory(db, io));
app.use('/api/history', historyRouter); // <— NEU

// Server starten
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
``
