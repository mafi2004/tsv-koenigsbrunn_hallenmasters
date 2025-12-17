const express = require('express');
const http = require('http');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Socket.io einrichten
const io = require('socket.io')(server, { cors: { origin: "*" } });

app.use(cors());
app.use(bodyParser.json());

// Statische Dateien aus dem Ordner "public" bereitstellen
// -> dort liegen admin.html und viewer.html
app.use(express.static(path.join(__dirname, 'public')));

// Routen importieren
const teamsRouter   = require('./routes/teams');
const matchesRouter = require('./routes/matches')(io);
const resultsRouter = require('./routes/results')(io);   // io wird übergeben
const funinoRouter  = require('./routes/funino')(io);    // Feldrotation

// Routen registrieren
app.use('/api/teams',   teamsRouter);
app.use('/api/matches', matchesRouter);
app.use('/api/results', resultsRouter);
app.use('/api/funino',  funinoRouter);

// Server starten
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Backend läuft auf Port ${PORT}`);
});
