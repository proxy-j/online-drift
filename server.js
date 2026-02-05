const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let players = {};

io.on('connection', (socket) => {
  console.log('A racer connected: ' + socket.id);
  
  // Initialize player with a default name
  players[socket.id] = {
    x: 0,
    y: 0,
    z: 0,
    angle: 0,
    isDrifting: false,
    color: Math.random() * 0xffffff,
    name: "Racer " + socket.id.substr(0,4),
    gameMode: 'freeplay',
    isIt: false,
    kills: 0,
    deaths: 0
  };
  
  // Send current state to new player
  socket.emit('currentPlayers', players);
  
  // Tell everyone else a new player joined
  socket.broadcast.emit('newPlayer', { 
    id: socket.id, 
    player: players[socket.id] 
  });
  
  // Listen for the Name Entry event
  socket.on('joinGame', (data) => {
    if(players[socket.id]) {
        if(typeof data === 'string') {
          // Old format compatibility
          players[socket.id].name = data;
        } else {
          players[socket.id].name = data.name;
          players[socket.id].gameMode = data.gameMode || 'freeplay';
          
          // If tag mode, make first player "it"
          if(data.gameMode === 'tag') {
            const tagPlayers = Object.keys(players).filter(id => players[id].gameMode === 'tag');
            if(tagPlayers.length === 1) {
              players[socket.id].isIt = true;
            }
          }
        }
        io.emit('updatePlayerName', { id: socket.id, name: players[socket.id].name });
    }
  });
  
  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y || 0;
      players[socket.id].z = movementData.z;
      players[socket.id].angle = movementData.angle;
      players[socket.id].isDrifting = movementData.isDrifting;
      
      socket.broadcast.emit('playerMoved', {
        id: socket.id,
        x: players[socket.id].x,
        y: players[socket.id].y,
        z: players[socket.id].z,
        angle: players[socket.id].angle,
        isDrifting: players[socket.id].isDrifting
      });
    }
  });
  
  // Tag mode
  socket.on('tagPlayer', (targetId) => {
    if(players[socket.id] && players[targetId]) {
      if(players[socket.id].isIt && players[socket.id].gameMode === 'tag' && players[targetId].gameMode === 'tag') {
        players[socket.id].isIt = false;
        players[targetId].isIt = true;
        
        io.emit('tagUpdate', {
          tagger: socket.id,
          tagged: targetId
        });
      }
    }
  });
  
  // Shooting mode
  socket.on('shoot', (bulletData) => {
    if(players[socket.id] && players[socket.id].gameMode === 'shooting') {
      socket.broadcast.emit('playerShot', {
        playerId: socket.id,
        x: bulletData.x,
        y: bulletData.y,
        z: bulletData.z,
        velX: bulletData.velX,
        velZ: bulletData.velZ
      });
    }
  });
  
  socket.on('hit', (victimId) => {
    if(players[socket.id] && players[victimId]) {
      if(players[socket.id].gameMode === 'shooting' && players[victimId].gameMode === 'shooting') {
        players[socket.id].kills++;
        players[victimId].deaths++;
        
        io.emit('playerHit', {
          killer: socket.id,
          victim: victimId
        });
      }
    }
  });
  
  socket.on('respawn', () => {
    if(players[socket.id]) {
      players[socket.id].kills = 0;
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
