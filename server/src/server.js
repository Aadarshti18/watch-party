require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const RoomManager = require('./managers/RoomManager');
const SocketHandler = require('./sockets/socketHandler');

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const CLIENT_DIST_DIR = path.join(__dirname, '..', '..', 'client', 'dist');

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

const roomManager = new RoomManager();

app.get('/health', (req, res) => {
  res.json({ status: 'ok', ...roomManager.stats() });
});

// Serves the built React app if it's present (single-service deployment on
// Render/Railway). If you deploy the frontend separately on Vercel/Netlify,
// this simply has nothing to serve and only /health and the socket
// endpoint are used from this service.
app.use(express.static(CLIENT_DIST_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/socket.io') || req.path.startsWith('/health')) return next();
  res.sendFile(path.join(CLIENT_DIST_DIR, 'index.html'), (err) => {
    if (err) next();
  });
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const socketHandler = new SocketHandler(io, roomManager);
socketHandler.init();

httpServer.listen(PORT, () => {
  console.log(`Watch Party server listening on port ${PORT}`);
  console.log(`Allowed client origin: ${CLIENT_ORIGIN}`);
});
