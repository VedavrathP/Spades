/**
 * Room Manager
 * Handles room creation, joining, player management, team assignment.
 */

const rooms = new Map();

/**
 * Generate a random 6-character room code.
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Create a new room.
 * @param {string} hostId - Socket ID of the host
 * @param {string} hostName - Display name of the host
 * @param {string} gameMode - 'individual' or 'teams'
 * @returns {object} Room object
 */
function createRoom(hostId, hostName, gameMode = 'individual') {
  let code = generateRoomCode();
  while (rooms.has(code)) {
    code = generateRoomCode();
  }

  const room = {
    code,
    hostId,
    gameMode,
    players: [{ id: hostId, name: hostName, ready: false, connected: true }],
    teams: null,
    gameState: null,
    started: false
  };

  if (gameMode === 'teams') {
    room.teams = { 'Team 1': [], 'Team 2': [] };
  }

  rooms.set(code, room);
  return room;
}

/**
 * Join an existing room.
 */
function joinRoom(roomCode, playerId, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  if (room.started) {
    // Check if reconnecting
    const existing = room.players.find(p => p.name === playerName);
    if (existing) {
      const oldId = existing.id;
      existing.id = playerId;
      existing.connected = true;
      // Update host ID if this was the host
      if (room.hostId === oldId) {
        room.hostId = playerId;
      }
      return { room, reconnected: true, oldId };
    }
    return { error: 'Game already started' };
  }
  if (room.players.length >= 8) return { error: 'Room is full (max 8 players)' };
  if (room.players.some(p => p.name === playerName)) return { error: 'Name already taken' };

  room.players.push({ id: playerId, name: playerName, ready: false, connected: true });
  return { room };
}

/**
 * Remove a player from a room.
 */
function leaveRoom(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  if (room.started) {
    // Mark as disconnected but don't remove
    const player = room.players.find(p => p.id === playerId);
    if (player) player.connected = false;
    return room;
  }

  room.players = room.players.filter(p => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return null;
  }

  // Transfer host if needed
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }

  return room;
}

/**
 * Toggle player ready status.
 */
function toggleReady(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  const player = room.players.find(p => p.id === playerId);
  if (player) player.ready = !player.ready;
  return room;
}

/**
 * Set game mode for a room.
 */
function setGameMode(roomCode, gameMode) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  room.gameMode = gameMode;
  if (gameMode === 'teams') {
    const numTeams = Math.floor(room.players.length / 2) || 1;
    room.teams = {};
    for (let i = 1; i <= numTeams; i++) {
      room.teams[`Team ${i}`] = [];
    }
  } else {
    room.teams = null;
  }
  return room;
}

/**
 * Assign a player to a team.
 */
function assignTeam(roomCode, playerName, teamName) {
  const room = rooms.get(roomCode);
  if (!room || !room.teams) return null;

  // Remove from any current team
  for (const team of Object.keys(room.teams)) {
    room.teams[team] = room.teams[team].filter(n => n !== playerName);
  }

  // Add to new team
  if (room.teams[teamName]) {
    room.teams[teamName].push(playerName);
  }

  return room;
}

/**
 * Update teams configuration (number of teams).
 */
function updateTeams(roomCode, numTeams) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  room.teams = {};
  for (let i = 1; i <= numTeams; i++) {
    room.teams[`Team ${i}`] = [];
  }
  return room;
}

/**
 * Check if all players are ready and minimum 2 players.
 */
function canStart(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return false;
  if (room.players.length < 2) return false;
  if (!room.players.every(p => p.ready)) return false;

  if (room.gameMode === 'teams') {
    // Check all players are assigned to teams
    const assigned = Object.values(room.teams).flat();
    const allAssigned = room.players.every(p => assigned.includes(p.name));
    if (!allAssigned) return false;
    // Check even number of players for teams
    if (room.players.length % 2 !== 0) return false;
    // Check each team has at least 1 player
    for (const members of Object.values(room.teams)) {
      if (members.length === 0) return false;
    }
  }

  return true;
}

/**
 * Get a room by code.
 */
function getRoom(roomCode) {
  return rooms.get(roomCode) || null;
}

/**
 * Find which room a player is in.
 */
function findPlayerRoom(playerId) {
  for (const [code, room] of rooms) {
    if (room.players.some(p => p.id === playerId)) {
      return { code, room };
    }
  }
  return null;
}

/**
 * Get player name by socket id.
 */
function getPlayerName(room, playerId) {
  const player = room.players.find(p => p.id === playerId);
  return player ? player.name : null;
}

/**
 * Get team for a player name.
 */
function getPlayerTeam(room, playerName) {
  if (!room.teams) return null;
  for (const [teamName, members] of Object.entries(room.teams)) {
    if (members.includes(playerName)) return teamName;
  }
  return null;
}

/**
 * Reset a room back to lobby state (restart game).
 */
function resetRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  room.started = false;
  room.gameState = null;
  // Reset all players to not-ready
  for (const p of room.players) {
    p.ready = false;
  }
  return room;
}

/**
 * Delete a room entirely (end game).
 */
function deleteRoom(roomCode) {
  rooms.delete(roomCode);
}

/**
 * Remove a player from a started game.
 * Returns the room if it still exists, null if deleted.
 */
function removePlayerFromGame(roomCode, playerId) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const player = room.players.find(p => p.id === playerId);
  if (!player) return room;

  const playerName = player.name;

  // Remove from players list
  room.players = room.players.filter(p => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(roomCode);
    return null;
  }

  // Transfer host if needed
  if (room.hostId === playerId) {
    room.hostId = room.players[0].id;
  }

  // If game is in progress, remove from game state player order
  if (room.gameState) {
    const gs = room.gameState;
    const idx = gs.playerOrder.indexOf(playerName);
    if (idx !== -1) {
      gs.playerOrder.splice(idx, 1);
    }
    // If it was this player's turn, advance
    if (gs.currentPlayerIndex >= gs.playerOrder.length) {
      gs.currentPlayerIndex = 0;
    }
  }

  return room;
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  toggleReady,
  setGameMode,
  assignTeam,
  updateTeams,
  canStart,
  getRoom,
  findPlayerRoom,
  getPlayerName,
  getPlayerTeam,
  generateRoomCode,
  resetRoom,
  deleteRoom,
  removePlayerFromGame
};
