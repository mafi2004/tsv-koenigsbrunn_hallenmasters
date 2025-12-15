const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const teamsRoutes = require('./routes/teams');
const matchesRoutes = require('./routes/matches');
const resultsRoutes = require('./routes/results');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(bodyParser.json());

// Socket.io für Live-Updates
app.set('io', io);

// API-Routen
app.use('/api/teams', teamsRoutes);
app.use('/api/matches', matchesRoutes);
app.use('/api/results', resultsRoutes);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Backend läuft auf Port ${PORT}`));
