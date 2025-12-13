const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

// 1. Tell Express to serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// 2. Serve index.html specifically from the 'public' folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let players = {};

io.on('connection', (socket) => {
  console.log('A racer connected: ' + socket.id);

  players[socket.id] = {
    x: 0,
    z: 0,
    angle: 0,
    isDrifting: false,
    color: Math.random() * 0xffffff
  };

  socket.emit('currentPlayers', players);

  socket.broadcast.emit('newPlayer', { 
    id: socket.id, 
    player: players[socket.id] 
  });

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].z = movementData.z;
      players[socket.id].angle = movementData.angle;
      players[socket.id].isDrifting = movementData.isDrifting;
      
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: players[socket.id].x,
        z: players[socket.id].z,
        angle: players[socket.id].angle,
        isDrifting: players[socket.id].isDrifting
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Racer disconnected: ' + socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`DRIFT SERVER running on port ${PORT}`);
});
