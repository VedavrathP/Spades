const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const roomManager = require('./roomManager');
const gameEngine = require('./gameEngine');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  },
  pingTimeout: 30000,      // Wait 30s before considering a client disconnected
  pingInterval: 10000,     // Ping every 10s to keep connection alive
  connectTimeout: 20000    // Allow 20s for initial connection
});

app.use(cors());

// Per-room processing locks to prevent race conditions (e.g. double card play)
const roomLocks = new Map();

function acquireRoomLock(roomCode) {
  if (roomLocks.get(roomCode)) return false; // Already locked
  roomLocks.set(roomCode, true);
  return true;
}

function releaseRoomLock(roomCode) {
  roomLocks.delete(roomCode);
}

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

// ─── Helper: broadcast room state to all players ───
function broadcastRoomState(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  const roomData = {
    code: room.code,
    hostId: room.hostId,
    gameMode: room.gameMode,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      ready: p.ready,
      connected: p.connected
    })),
    teams: room.teams,
    started: room.started
  };

  io.to(roomCode).emit('room-update', roomData);
}

// ─── Helper: broadcast game state to each player (hiding other hands) ───
function broadcastGameState(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return;
  const gs = room.gameState;

  for (const player of room.players) {
    const playerName = player.name;
    const isNilPromptPhase = gs.phase === 'nil-prompt';

    // In nil-prompt phase, don't send hands until player decides
    const hand = isNilPromptPhase && !gs.nilBids[playerName] && gs.nilBids[playerName] !== false
      ? [] // Don't show cards yet during nil prompt
      : gameEngine.sortHand(gs.hands[playerName] || []);

    const state = {
      currentRound: gs.currentRound,
      phase: gs.phase,
      playerOrder: gs.playerOrder,
      currentPlayerIndex: gs.currentPlayerIndex,
      currentPlayer: gameEngine.getCurrentPlayer(gs),
      hand: hand,
      bids: gs.bids,
      nilBids: gs.nilBids,
      tricksWon: gs.tricksWon,
      currentTrick: gs.currentTrick,
      trickNumber: gs.trickNumber,
      ledSuit: gs.ledSuit,
      spadesBroken: gs.spadesBroken,
      scores: gs.scores,
      overtrickBag: gs.overtrickBag,
      roundHistory: gs.roundHistory,
      teams: gs.teams,
      teamScores: gs.teamScores,
      teamOvertrickBag: gs.teamOvertrickBag,
      teamRoundHistory: gs.teamRoundHistory,
      gameMode: gs.gameMode,
      dealerIndex: gs.dealerIndex,
      gameOver: gs.gameOver,
      winner: gs.winner,
      otherHandCounts: {},
      myName: playerName
    };

    // Send other players' hand counts (not their cards)
    for (const p of gs.playerOrder) {
      if (p !== playerName) {
        state.otherHandCounts[p] = gs.hands[p] ? gs.hands[p].length : 0;
      }
    }

    player.connected && io.to(player.id).emit('game-state', state);
  }
}

// ─── Helper: advance to next player ───
function advancePlayer(gs) {
  gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
}

// ─── Helper: skip disconnected players ───
// If the current player is disconnected, auto-skip them.
// For playing phase: auto-play their first valid card.
// For bidding phase: auto-bid 0.
// For nil-prompt phase: auto-decide "see cards" (no nil).
function handleDisconnectedTurn(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return;
  const gs = room.gameState;
  const currentPlayerName = gameEngine.getCurrentPlayer(gs);
  if (!currentPlayerName) return;

  const player = room.players.find(p => p.name === currentPlayerName);
  if (!player || player.connected) return; // Player is connected, no need to skip

  console.log(`[${roomCode}] Auto-handling disconnected player: ${currentPlayerName} (phase: ${gs.phase})`);

  if (gs.phase === 'playing') {
    // Auto-play their first valid card
    const hand = gs.hands[currentPlayerName];
    if (!hand || hand.length === 0) return;

    const isLeading = gs.currentTrick.length === 0;
    const ledSuit = isLeading ? null : gs.currentTrick[0].card.suit;

    // Find a valid card to play
    let cardToPlay = hand[0]; // default: first card
    for (const card of hand) {
      if (gameEngine.isValidPlay(card, hand, ledSuit, gs.spadesBroken, isLeading)) {
        cardToPlay = card;
        break;
      }
    }

    // Play the card
    if (isLeading) gs.ledSuit = cardToPlay.suit;
    if (cardToPlay.suit === 'spades' && !gs.spadesBroken) gs.spadesBroken = true;
    const cardIndex = hand.findIndex(c => c.id === cardToPlay.id);
    hand.splice(cardIndex, 1);
    gs.currentTrick.push({ playerId: currentPlayerName, card: cardToPlay });

    if (gs.currentTrick.length === gs.playerOrder.length) {
      broadcastGameState(roomCode);
      setTimeout(() => processEndOfTrick(roomCode), 500);
    } else {
      advancePlayer(gs);
      broadcastGameState(roomCode);
      // Check if the next player is also disconnected
      setTimeout(() => handleDisconnectedTurn(roomCode), 300);
    }
  } else if (gs.phase === 'bidding') {
    // Auto-bid 0 for disconnected player
    if (gs.nilBids[currentPlayerName] === true) return; // already nil
    gs.bids[currentPlayerName] = 0;

    // Advance to next bidder
    let next = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
    let safety = 0;
    while (safety < gs.playerOrder.length) {
      const nextPlayer = gs.playerOrder[next];
      if (gs.bids[nextPlayer] === undefined) break;
      next = (next + 1) % gs.playerOrder.length;
      safety++;
    }
    gs.currentPlayerIndex = next;

    const allBid = gs.playerOrder.every(p =>
      gs.nilBids[p] === true || gs.bids[p] !== undefined
    );

    if (allBid) {
      gs.phase = 'playing';
      gs.currentTrick = [];
      gs.trickNumber = 0;
      gs.currentPlayerIndex = gs.firstLeadIndex;
    }

    broadcastGameState(roomCode);
    // Check if next player is also disconnected
    setTimeout(() => handleDisconnectedTurn(roomCode), 300);
  } else if (gs.phase === 'nil-prompt') {
    // Nil-prompt is simultaneous — auto-decide for ALL disconnected undecided players
    for (const pName of gs.playerOrder) {
      if (gs.nilBids[pName] !== undefined) continue; // already decided
      const p = room.players.find(pl => pl.name === pName);
      if (p && !p.connected) {
        gs.nilBids[pName] = false; // auto: don't go nil
        console.log(`[${roomCode}] Auto nil-decision for disconnected: ${pName} -> no nil`);
      }
    }

    const allDecided = gs.playerOrder.every(p => gs.nilBids[p] === true || gs.nilBids[p] === false);
    if (allDecided) {
      gs.phase = 'bidding';
      gs.currentPlayerIndex = gs.biddingStartIndex;
      let safety = 0;
      while (safety < gs.playerOrder.length) {
        const p = gs.playerOrder[gs.currentPlayerIndex];
        if (gs.nilBids[p] !== true) break;
        gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
        safety++;
      }
    }

    broadcastGameState(roomCode);
    // Check if next player to act is also disconnected
    setTimeout(() => handleDisconnectedTurn(roomCode), 300);
  }
}

// ─── Helper: process end of trick ───
function processEndOfTrick(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return; // Guard against deleted rooms
  const gs = room.gameState;
  if (!gs.currentTrick || gs.currentTrick.length === 0) return; // Guard
  const ledSuit = gs.currentTrick[0].card.suit;
  const result = gameEngine.determineTrickWinner(gs.currentTrick, ledSuit);

  gs.tricksWon[result.winnerId] = (gs.tricksWon[result.winnerId] || 0) + 1;

  // Check if spades were broken
  if (!gs.spadesBroken && gs.currentTrick.some(t => t.card.suit === 'spades')) {
    gs.spadesBroken = true;
  }

  // Broadcast trick result
  io.to(roomCode).emit('trick-result', {
    winner: result.winnerId,
    winningCard: result.winningCard,
    trick: gs.currentTrick
  });

  gs.trickNumber++;

  // Always save the latest trick winner (used for next round's first lead)
  gs.lastTrickWinner = result.winnerId;

  // Check if round is over (all tricks played)
  if (gs.trickNumber >= gs.currentRound) {
    // Round over — process scoring (lastTrickWinner carries over to next round)
    setTimeout(() => processEndOfRound(roomCode), 2000);
  } else {
    // Next trick — winner leads
    gs.currentTrick = [];
    gs.ledSuit = null;
    gs.currentPlayerIndex = gs.playerOrder.indexOf(result.winnerId);
    setTimeout(() => {
      broadcastGameState(roomCode);
      // Check if the next player (trick winner) is disconnected
      setTimeout(() => handleDisconnectedTurn(roomCode), 300);
    }, 1500);
  }
}

// ─── Helper: process end of round ───
function processEndOfRound(roomCode) {
  const room = roomManager.getRoom(roomCode);
  if (!room || !room.gameState) return; // Guard against deleted rooms
  const gs = room.gameState;

  const roundScores = {};
  const penalties = {};

  if (gs.gameMode === 'individual') {
    // Individual scoring
    for (const playerName of gs.playerOrder) {
      const bid = gs.bids[playerName] || 0;
      const tricks = gs.tricksWon[playerName] || 0;
      const isNil = gs.nilBids[playerName] === true;

      const result = gameEngine.calculateRoundScore(bid, tricks, isNil);
      roundScores[playerName] = result.roundScore;

      gs.scores[playerName] += result.roundScore;

      // Check denominator penalty (based on accumulated overtricks)
      const penaltyResult = gameEngine.applyDenominatorPenalty(
        gs.scores[playerName],
        gs.overtrickBag[playerName] || 0,
        result.overtricks
      );
      gs.scores[playerName] = penaltyResult.newTotal;
      gs.overtrickBag[playerName] = penaltyResult.newBag;
      if (penaltyResult.penaltyApplied) {
        penalties[playerName] = true;
      }

      gs.roundHistory[playerName].push({
        round: gs.currentRound,
        bid,
        tricks,
        isNil,
        roundScore: result.roundScore,
        overtricks: result.overtricks,
        bagAfter: gs.overtrickBag[playerName],
        totalAfter: gs.scores[playerName],
        penaltyApplied: !!penalties[playerName]
      });
    }
  } else {
    // Team scoring
    for (const [teamName, members] of Object.entries(gs.teams)) {
      let teamBid = 0;
      let teamTricks = 0;
      let hasNilPlayer = false;
      let nilPlayerResults = [];

      for (const playerName of members) {
        const bid = gs.bids[playerName] || 0;
        const tricks = gs.tricksWon[playerName] || 0;
        const isNil = gs.nilBids[playerName] === true;

        if (isNil) {
          hasNilPlayer = true;
          const nilResult = gameEngine.calculateRoundScore(bid, tricks, true);
          nilPlayerResults.push({ playerName, score: nilResult.roundScore });
          // Individual round history for nil player
          gs.roundHistory[playerName].push({
            round: gs.currentRound,
            bid: 0,
            tricks,
            isNil: true,
            roundScore: nilResult.roundScore,
            totalAfter: gs.scores[playerName],
            penaltyApplied: false
          });
        } else {
          teamBid += bid;
          teamTricks += tricks;
        }
      }

      // Calculate team score for non-nil members
      const teamResult = gameEngine.calculateRoundScore(teamBid, teamTricks, false);
      let teamRoundScore = teamResult.roundScore;

      // Add nil player scores
      for (const nr of nilPlayerResults) {
        teamRoundScore += nr.score;
      }

      roundScores[teamName] = teamRoundScore;
      gs.teamScores[teamName] += teamRoundScore;

      // Also track individual scores for display
      for (const playerName of members) {
        const bid = gs.bids[playerName] || 0;
        const tricks = gs.tricksWon[playerName] || 0;
        const isNil = gs.nilBids[playerName] === true;
        if (!isNil) {
          const indResult = gameEngine.calculateRoundScore(bid, tricks, false);
          gs.scores[playerName] += indResult.roundScore;
          gs.roundHistory[playerName].push({
            round: gs.currentRound,
            bid,
            tricks,
            isNil: false,
            roundScore: indResult.roundScore,
            totalAfter: gs.scores[playerName],
            penaltyApplied: false
          });
        }
      }

      // Check denominator penalty for team (based on accumulated overtricks)
      const penaltyResult = gameEngine.applyDenominatorPenalty(
        gs.teamScores[teamName],
        (gs.teamOvertrickBag && gs.teamOvertrickBag[teamName]) || 0,
        teamResult.overtricks
      );
      gs.teamScores[teamName] = penaltyResult.newTotal;
      if (gs.teamOvertrickBag) gs.teamOvertrickBag[teamName] = penaltyResult.newBag;
      if (penaltyResult.penaltyApplied) {
        penalties[teamName] = true;
      }

      if (!gs.teamRoundHistory[teamName]) gs.teamRoundHistory[teamName] = [];
      gs.teamRoundHistory[teamName].push({
        round: gs.currentRound,
        bid: teamBid,
        tricks: teamTricks,
        roundScore: teamRoundScore,
        overtricks: teamResult.overtricks,
        bagAfter: gs.teamOvertrickBag ? gs.teamOvertrickBag[teamName] : 0,
        totalAfter: gs.teamScores[teamName],
        penaltyApplied: !!penalties[teamName]
      });
    }
  }

  // Emit round results
  io.to(roomCode).emit('round-end', {
    round: gs.currentRound,
    roundScores,
    scores: gs.gameMode === 'teams' ? gs.teamScores : gs.scores,
    penalties,
    roundHistory: gs.gameMode === 'teams' ? gs.teamRoundHistory : gs.roundHistory
  });

  // Check if game is over (after round 11)
  if (gs.currentRound >= 11) {
    gs.gameOver = true;
    gs.phase = 'game-over';

    if (gs.gameMode === 'teams') {
      let maxScore = -Infinity;
      let winner = null;
      for (const [teamName, score] of Object.entries(gs.teamScores)) {
        if (score > maxScore) {
          maxScore = score;
          winner = teamName;
        }
      }
      gs.winner = { name: winner, score: maxScore, type: 'team' };
    } else {
      let maxScore = -Infinity;
      let winner = null;
      for (const [playerName, score] of Object.entries(gs.scores)) {
        if (score > maxScore) {
          maxScore = score;
          winner = playerName;
        }
      }
      gs.winner = { name: winner, score: maxScore, type: 'individual' };
    }

    broadcastGameState(roomCode);
  } else {
    // Next round
    gs.currentRound++;
    gs.phase = 'round-end';
    broadcastGameState(roomCode);
  }
}

// ─── Socket.IO Connection Handler ───
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // ─── ROOM EVENTS ───

  socket.on('create-room', ({ playerName, gameMode }, callback) => {
    const room = roomManager.createRoom(socket.id, playerName, gameMode);
    socket.join(room.code);
    callback({ success: true, roomCode: room.code });
    broadcastRoomState(room.code);
  });

  socket.on('join-room', ({ roomCode, playerName }, callback) => {
    const result = roomManager.joinRoom(roomCode.toUpperCase(), socket.id, playerName);
    if (result.error) {
      callback({ success: false, error: result.error });
      return;
    }

    socket.join(roomCode.toUpperCase());
    callback({ success: true, roomCode: roomCode.toUpperCase() });

    if (result.reconnected) {
      // Update game state with new socket id
      const room = result.room;
      if (room.gameState) {
        const gs = room.gameState;
        // Update player order if needed (names stay the same)
        broadcastGameState(roomCode.toUpperCase());
      }
    }

    broadcastRoomState(roomCode.toUpperCase());
  });

  socket.on('toggle-ready', ({ roomCode }) => {
    roomManager.toggleReady(roomCode, socket.id);
    broadcastRoomState(roomCode);
  });

  socket.on('set-game-mode', ({ roomCode, gameMode }) => {
    roomManager.setGameMode(roomCode, gameMode);
    broadcastRoomState(roomCode);
  });

  socket.on('assign-team', ({ roomCode, playerName, teamName }) => {
    roomManager.assignTeam(roomCode, playerName, teamName);
    broadcastRoomState(roomCode);
  });

  socket.on('update-teams', ({ roomCode, numTeams }) => {
    roomManager.updateTeams(roomCode, numTeams);
    broadcastRoomState(roomCode);
  });

  // ─── GAME START ───

  socket.on('start-game', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (!roomManager.canStart(roomCode)) return;

    room.started = true;
    const playerNames = room.players.map(p => p.name);
    room.gameState = gameEngine.createGameState(playerNames, room.gameMode, room.teams);
    gameEngine.startRound(room.gameState);

    broadcastRoomState(roomCode);
    broadcastGameState(roomCode);
    // Check if first player is disconnected
    setTimeout(() => handleDisconnectedTurn(roomCode), 300);
  });

  // ─── NIL PROMPT (Rounds 10-11) ───

  socket.on('nil-decision', ({ roomCode, goNil }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    const playerName = roomManager.getPlayerName(room, socket.id);
    if (!playerName) return;
    if (gs.phase !== 'nil-prompt') return;

    gs.nilBids[playerName] = goNil;

    if (goNil) {
      gs.bids[playerName] = 0;
    }

    // Check if all players have made nil decision
    const allDecided = gs.playerOrder.every(p => gs.nilBids[p] === true || gs.nilBids[p] === false);

    if (allDecided) {
      gs.phase = 'bidding';
      // Start bidding from biddingStartIndex, but skip nil players
      gs.currentPlayerIndex = gs.biddingStartIndex;
      let safety = 0;
      while (safety < gs.playerOrder.length) {
        const p = gs.playerOrder[gs.currentPlayerIndex];
        if (gs.nilBids[p] !== true) break; // found a non-nil player
        gs.currentPlayerIndex = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
        safety++;
      }
    }

    broadcastGameState(roomCode);
    // Check if the next player to act is disconnected
    setTimeout(() => handleDisconnectedTurn(roomCode), 300);
  });

  // ─── BIDDING ───

  socket.on('place-bid', ({ roomCode, bid }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;
    const gs = room.gameState;
    const playerName = roomManager.getPlayerName(room, socket.id);
    if (!playerName) return;
    if (gs.phase !== 'bidding') return;

    // Nil players already have their bid set
    if (gs.nilBids[playerName] === true) return;

    // Enforce turn-by-turn bidding: only the current bidder can bid
    if (gameEngine.getCurrentPlayer(gs) !== playerName) return;

    // Validate bid
    if (bid < 0 || bid > gs.currentRound) return;

    gs.bids[playerName] = bid;

    // Advance to next player who hasn't bid yet (skip nil players who already have bids)
    let next = (gs.currentPlayerIndex + 1) % gs.playerOrder.length;
    let safety = 0;
    while (safety < gs.playerOrder.length) {
      const nextPlayer = gs.playerOrder[next];
      if (gs.bids[nextPlayer] === undefined) {
        break; // This player still needs to bid
      }
      next = (next + 1) % gs.playerOrder.length;
      safety++;
    }
    gs.currentPlayerIndex = next;

    // Check if all non-nil players have bid
    const allBid = gs.playerOrder.every(p =>
      gs.nilBids[p] === true || gs.bids[p] !== undefined
    );

    if (allBid) {
      gs.phase = 'playing';
      gs.currentTrick = [];
      gs.trickNumber = 0;
      // The first card lead goes to the last trick winner (or dealer+1 for round 1)
      gs.currentPlayerIndex = gs.firstLeadIndex;
    }

    broadcastGameState(roomCode);
    // Check if the next player to act is disconnected
    setTimeout(() => handleDisconnectedTurn(roomCode), 300);
  });

  // ─── PLAY CARD ───

  socket.on('play-card', ({ roomCode, cardId }) => {
    // Acquire lock to prevent double card plays from rapid clicks
    if (!acquireRoomLock(roomCode)) {
      return; // Another play is being processed
    }

    try {
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.gameState) return;
      const gs = room.gameState;
      const playerName = roomManager.getPlayerName(room, socket.id);
      if (!playerName) return;
      if (gs.phase !== 'playing') return;
      if (gameEngine.getCurrentPlayer(gs) !== playerName) return;

      const hand = gs.hands[playerName];
      const cardIndex = hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return;

      const card = hand[cardIndex];
      const isLeading = gs.currentTrick.length === 0;
      const ledSuit = isLeading ? null : gs.currentTrick[0].card.suit;

      // Validate play
      if (!gameEngine.isValidPlay(card, hand, ledSuit, gs.spadesBroken, isLeading)) {
        socket.emit('invalid-play', { message: 'Invalid card play. Follow suit if possible.' });
        return;
      }

      // Set led suit if leading
      if (isLeading) {
        gs.ledSuit = card.suit;
      }

      // Check if spades broken
      if (card.suit === 'spades' && !gs.spadesBroken) {
        gs.spadesBroken = true;
      }

      // Remove card from hand
      hand.splice(cardIndex, 1);

      // Add to current trick
      gs.currentTrick.push({ playerId: playerName, card });

      // Advance to next player or end trick
      if (gs.currentTrick.length === gs.playerOrder.length) {
        // All players have played — resolve trick
        broadcastGameState(roomCode);
        setTimeout(() => processEndOfTrick(roomCode), 500);
      } else {
        advancePlayer(gs);
        broadcastGameState(roomCode);
      }
    } finally {
      releaseRoomLock(roomCode);
    }
  });

  // ─── NEXT ROUND ───

  socket.on('next-round', ({ roomCode }) => {
    const room = roomManager.getRoom(roomCode);
    if (!room || !room.gameState) return;
    if (room.hostId !== socket.id) return;
    if (room.gameState.phase !== 'round-end') return;

    gameEngine.startRound(room.gameState);
    broadcastGameState(roomCode);
    // Check if first player is disconnected
    setTimeout(() => handleDisconnectedTurn(roomCode), 300);
  });

  // ─── RESTART GAME (host only) ───

  socket.on('restart-game', ({ roomCode }, callback) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      callback && callback({ success: false, error: 'Room not found' });
      return;
    }
    if (room.hostId !== socket.id) {
      callback && callback({ success: false, error: 'Only the host can restart' });
      return;
    }

    roomManager.resetRoom(roomCode);
    io.to(roomCode).emit('game-reset', { message: 'Host has restarted the game' });
    broadcastRoomState(roomCode);
    callback && callback({ success: true });
  });

  // ─── END GAME (host only — destroys room) ───

  socket.on('end-game', ({ roomCode }, callback) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      callback && callback({ success: false, error: 'Room not found' });
      return;
    }
    if (room.hostId !== socket.id) {
      callback && callback({ success: false, error: 'Only the host can end the game' });
      return;
    }

    // Notify all players before deleting
    io.to(roomCode).emit('game-ended', { message: 'Host has ended the game' });

    // Make all sockets leave the room
    const sockets = io.sockets.adapter.rooms.get(roomCode);
    if (sockets) {
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (s) s.leave(roomCode);
      }
    }

    roomManager.deleteRoom(roomCode);
    callback && callback({ success: true });
  });

  // ─── LEAVE GAME (player leaves mid-game) ───

  socket.on('leave-game', ({ roomCode }, callback) => {
    const room = roomManager.getRoom(roomCode);
    if (!room) {
      callback && callback({ success: false, error: 'Room not found' });
      return;
    }

    socket.leave(roomCode);
    const updatedRoom = roomManager.removePlayerFromGame(roomCode, socket.id);

    if (updatedRoom) {
      broadcastRoomState(roomCode);
      if (updatedRoom.gameState) {
        broadcastGameState(roomCode);
      }
    }

    callback && callback({ success: true });
  });

  // ─── DISCONNECT ───

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    const found = roomManager.findPlayerRoom(socket.id);
    if (found) {
      const room = roomManager.leaveRoom(found.code, socket.id);
      if (room) {
        broadcastRoomState(found.code);
        if (room.gameState) {
          broadcastGameState(found.code);
          // If it was this player's turn, auto-handle after a short delay
          // (give them a chance to reconnect quickly)
          setTimeout(() => handleDisconnectedTurn(found.code), 5000);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Spades server running on port ${PORT}`);
});
