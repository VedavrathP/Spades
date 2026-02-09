import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const GameContext = createContext(null);

const SOCKET_URL = import.meta.env.PROD ? '' : 'http://localhost:3001';

export function GameProvider({ children }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [roomState, setRoomState] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [screen, setScreen] = useState('home'); // home, lobby, game
  const [error, setError] = useState('');
  const [trickResult, setTrickResult] = useState(null);
  const [roundEnd, setRoundEnd] = useState(null);

  useEffect(() => {
    // Prevent double-mount in StrictMode from creating multiple sockets
    if (socketRef.current) return;

    const s = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = s;

    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('room-update', (data) => {
      setRoomState(data);
      if (data.started) {
        setScreen('game');
      }
    });

    s.on('game-state', (data) => {
      setGameState(data);
      if (data.phase === 'game-over') {
        setScreen('game');
      }
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
    socketRef.current.emit('play-card', { roomCode, cardId });
  }, [roomCode]);

  const nextRound = useCallback(() => {
    if (!socketRef.current) return;
    setRoundEnd(null);
    socketRef.current.emit('next-round', { roomCode });
  }, [roomCode]);

  const leaveRoom = useCallback(() => {
    setScreen('home');
    setRoomState(null);
    setGameState(null);
    setRoomCode('');
    setRoundEnd(null);
    setTrickResult(null);
  }, []);

  const value = {
    connected,
    playerName,
    roomCode,
    roomState,
    gameState,
    screen,
    error,
    trickResult,
    roundEnd,
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
