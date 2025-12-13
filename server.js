const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Store all connected players
let players = {};

io.on('connection', (socket) => {
  console.log('A racer connected: ' + socket.id);

  // Create a new player object
  players[socket.id] = {
    x: 0,
    z: 0,
    angle: 0,
    isDrifting: false, // <-- crucial for smoke/skids
    color: Math.random() * 0xffffff // Random car color
  };

  // Send the current list of players to the new guy
  socket.emit('currentPlayers', players);

  // Tell everyone else a new guy joined
  socket.broadcast.emit('newPlayer', { 
    id: socket.id, 
    player: players[socket.id] 
  });

  // When a player moves
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].z = movementData.z;
      players[socket.id].angle = movementData.angle;
      players[socket.id].isDrifting = movementData.isDrifting; // Sync drift state
      
      // Relay this movement to everyone else
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

server.listen(3000, () => {
  console.log('DRIFT SERVER running on *:3000');
});
