import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);

const SOCKET_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('spades_playerName') || '');
  const [roomCode, setRoomCode] = useState(() => sessionStorage.getItem('spades_roomCode') || '');
  const [roomState, setRoomState] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [screen, setScreen] = useState('home');
  const [error, setError] = useState('');
  const [trickResult, setTrickResult] = useState(null);
  const [roundEnd, setRoundEnd] = useState(null);
  const hasAttemptedRejoin = useRef(false);
  const [playedCardId, setPlayedCardId] = useState(null); // Optimistic lock for card plays

  // Persist playerName and roomCode to sessionStorage
  useEffect(() => {
    if (playerName) sessionStorage.setItem('spades_playerName', playerName);
  }, [playerName]);

  useEffect(() => {
    if (roomCode) sessionStorage.setItem('spades_roomCode', roomCode);
  }, [roomCode]);

  // Warn before page refresh/close when in a game
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (screen === 'game' || screen === 'lobby') {
        e.preventDefault();
        e.returnValue = 'You are in a game. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [screen]);

  useEffect(() => {
    // Prevent double-mount in StrictMode from creating multiple sockets
    if (socketRef.current) return;

    const s = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,  // Keep trying forever
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,      // Max 5s between attempts
      timeout: 20000,                  // 20s connection timeout
      transports: ['websocket', 'polling'] // Prefer websocket, fallback to polling
    });

    socketRef.current = s;

    s.on('connect', () => {
      setConnected(true);

      // Auto-rejoin if we have saved session data (browser refresh)
      const savedName = sessionStorage.getItem('spades_playerName');
      const savedRoom = sessionStorage.getItem('spades_roomCode');

      if (savedName && savedRoom && !hasAttemptedRejoin.current) {
        hasAttemptedRejoin.current = true;
        s.emit('join-room', { roomCode: savedRoom, playerName: savedName }, (response) => {
          if (response.success) {
            setPlayerName(savedName);
            setRoomCode(response.roomCode);
            setScreen('lobby'); // will switch to 'game' when game-state arrives
            setError('');
          } else {
            // Session expired or room gone — clear saved data and go home
            sessionStorage.removeItem('spades_playerName');
            sessionStorage.removeItem('spades_roomCode');
            setScreen('home');
          }
        });
      }
    });

    s.on('disconnect', () => {
      setConnected(false);
      setReconnecting(true);
    });

    s.on('reconnect', () => {
      // Socket.IO reconnected — auto-rejoin the room
      setReconnecting(false);
      setConnected(true);
      const savedName = sessionStorage.getItem('spades_playerName');
      const savedRoom = sessionStorage.getItem('spades_roomCode');
      if (savedName && savedRoom) {
        s.emit('join-room', { roomCode: savedRoom, playerName: savedName }, (response) => {
          if (response.success) {
            console.log('Auto-rejoined room after reconnection');
          } else {
            console.warn('Failed to rejoin after reconnect:', response.error);
          }
        });
      }
    });

    s.on('reconnect_attempt', (attempt) => {
      setReconnecting(true);
      console.log(`Reconnection attempt ${attempt}...`);
    });

    s.on('reconnect_failed', () => {
      setReconnecting(false);
      setError('Connection lost. Please refresh the page.');
    });

    s.on('room-update', (data) => {
      setRoomState(data);
      if (data.started) {
        setScreen('game');
      }
    });

    s.on('game-state', (data) => {
      setGameState(data);
      setPlayedCardId(null); // Clear optimistic lock — server has processed the play
      setScreen('game');
    });

    s.on('trick-result', (data) => {
      setTrickResult(data);
      setTimeout(() => setTrickResult(null), 2000);
    });

    s.on('round-end', (data) => {
      setRoundEnd(data);
    });

    s.on('invalid-play', (data) => {
      setError(data.message);
      setTimeout(() => setError(''), 3000);
    });

    s.on('game-reset', () => {
      // Host restarted the game — go back to lobby
      setGameState(null);
      setRoundEnd(null);
      setTrickResult(null);
      setScreen('lobby');
    });

    s.on('game-ended', () => {
      // Host ended the game — go back to home
      sessionStorage.removeItem('spades_playerName');
      sessionStorage.removeItem('spades_roomCode');
      setGameState(null);
      setRoomState(null);
      setRoundEnd(null);
      setTrickResult(null);
      setRoomCode('');
      setPlayerName('');
      setScreen('home');
      setError('The host has ended the game.');
      setTimeout(() => setError(''), 5000);
    });

    return () => {
      // Don't disconnect on cleanup in dev mode (StrictMode double-mount)
    };
  }, []);

  const createRoom = useCallback((name, gameMode) => {
    if (!socketRef.current) return;
    setPlayerName(name);
    socketRef.current.emit('create-room', { playerName: name, gameMode }, (response) => {
      if (response.success) {
        setRoomCode(response.roomCode);
        setScreen('lobby');
        setError('');
      } else {
        setError(response.error || 'Failed to create room');
      }
    });
  }, []);

  const joinRoom = useCallback((code, name) => {
    if (!socketRef.current) return;
    setPlayerName(name);
    socketRef.current.emit('join-room', { roomCode: code, playerName: name }, (response) => {
      if (response.success) {
        setRoomCode(response.roomCode);
        setScreen('lobby');
        setError('');
      } else {
        setError(response.error || 'Failed to join room');
      }
    });
  }, []);

  const toggleReady = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('toggle-ready', { roomCode });
  }, [roomCode]);

  const setGameMode = useCallback((gameMode) => {
    if (!socketRef.current) return;
    socketRef.current.emit('set-game-mode', { roomCode, gameMode });
  }, [roomCode]);

  const assignTeam = useCallback((pName, teamName) => {
    if (!socketRef.current) return;
    socketRef.current.emit('assign-team', { roomCode, playerName: pName, teamName });
  }, [roomCode]);

  const updateTeams = useCallback((numTeams) => {
    if (!socketRef.current) return;
    socketRef.current.emit('update-teams', { roomCode, numTeams });
  }, [roomCode]);

  const startGame = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('start-game', { roomCode });
  }, [roomCode]);

  const makeNilDecision = useCallback((goNil) => {
    if (!socketRef.current) return;
    socketRef.current.emit('nil-decision', { roomCode, goNil });
  }, [roomCode]);

  const placeBid = useCallback((bid) => {
    if (!socketRef.current) return;
    socketRef.current.emit('place-bid', { roomCode, bid });
  }, [roomCode]);

  const playCard = useCallback((cardId) => {
    if (!socketRef.current) return;
    if (playedCardId) return; // Already played a card, waiting for server response
    setPlayedCardId(cardId);
    socketRef.current.emit('play-card', { roomCode, cardId });
  }, [roomCode, playedCardId]);

  const nextRound = useCallback(() => {
    if (!socketRef.current) return;
    setRoundEnd(null);
    socketRef.current.emit('next-round', { roomCode });
  }, [roomCode]);

  const leaveRoom = useCallback(() => {
    sessionStorage.removeItem('spades_playerName');
    sessionStorage.removeItem('spades_roomCode');
    setScreen('home');
    setRoomState(null);
    setGameState(null);
    setRoomCode('');
    setRoundEnd(null);
    setTrickResult(null);
  }, []);

  const restartGame = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('restart-game', { roomCode }, (response) => {
      if (!response.success) {
        setError(response.error || 'Failed to restart game');
        setTimeout(() => setError(''), 3000);
      }
    });
  }, [roomCode]);

  const endGame = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('end-game', { roomCode }, (response) => {
      if (response.success) {
        sessionStorage.removeItem('spades_playerName');
        sessionStorage.removeItem('spades_roomCode');
        setGameState(null);
        setRoomState(null);
        setRoundEnd(null);
        setTrickResult(null);
        setRoomCode('');
        setScreen('home');
      } else {
        setError(response.error || 'Failed to end game');
        setTimeout(() => setError(''), 3000);
      }
    });
  }, [roomCode]);

  const hostUndo = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('host-undo', { roomCode }, (response) => {
      if (response.success) {
        const who = response.player || 'someone';
        const what = response.undone === 'nil' ? 'nil decision' : 'bid';
        setError(`↩️ Undid ${what} for ${who}`);
        setTimeout(() => setError(''), 3000);
      } else {
        setError(response.error || 'Nothing to undo');
        setTimeout(() => setError(''), 3000);
      }
    });
  }, [roomCode]);

  const leaveGame = useCallback(() => {
    if (!socketRef.current) return;
    socketRef.current.emit('leave-game', { roomCode }, (response) => {
      sessionStorage.removeItem('spades_playerName');
      sessionStorage.removeItem('spades_roomCode');
      setGameState(null);
      setRoomState(null);
      setRoundEnd(null);
      setTrickResult(null);
      setRoomCode('');
      setScreen('home');
    });
  }, [roomCode]);

  const value = {
    connected,
    reconnecting,
    playerName,
    roomCode,
    roomState,
    gameState,
    screen,
    error,
    trickResult,
    roundEnd,
    playedCardId,
    createRoom,
    joinRoom,
    toggleReady,
    setGameMode,
    assignTeam,
    updateTeams,
    startGame,
    makeNilDecision,
    placeBid,
    playCard,
    nextRound,
    leaveRoom,
    restartGame,
    endGame,
    leaveGame,
    hostUndo,
    setError,
    setScreen
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
