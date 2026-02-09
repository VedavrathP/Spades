import { useState } from 'react';
import { useGame } from '../context/GameContext';
import './Home.css';

export default function Home() {
  const { createRoom, joinRoom, connected, error } = useGame();
  const [mode, setMode] = useState(null); // null, 'create', 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [gameMode, setGameMode] = useState('individual');

  const handleCreate = () => {
    if (!name.trim()) return;
    createRoom(name.trim(), gameMode);
  };

  const handleJoin = () => {
    if (!name.trim() || !code.trim()) return;
    joinRoom(code.trim().toUpperCase(), name.trim());
  };

  return (
    <div className="home">
      <div className="home-bg">
        <div className="floating-card c1">♠</div>
        <div className="floating-card c2">♥</div>
        <div className="floating-card c3">♦</div>
        <div className="floating-card c4">♣</div>
      </div>

      <div className="home-content">
        <div className="home-title">
          <h1>♠ Spades</h1>
          <p className="subtitle">Family Card Game</p>
          {!connected && <p className="connection-status">Connecting to server...</p>}
        </div>

        {error && <div className="error-message">{error}</div>}

        {!mode && (
          <div className="home-actions">
            <button className="btn btn-primary btn-xl" onClick={() => setMode('create')} disabled={!connected}>
              Create Game
            </button>
            <button className="btn btn-secondary btn-xl" onClick={() => setMode('join')} disabled={!connected}>
              Join Game
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="home-form">
            <h2>Create a New Game</h2>
            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
              autoFocus
            />
            <div className="form-group">
              <label>Game Mode</label>
              <div className="mode-toggle">
                <button
                  className={`btn ${gameMode === 'individual' ? 'btn-active' : 'btn-outline'}`}
                  onClick={() => setGameMode('individual')}
                >
                  Individual
                </button>
                <button
                  className={`btn ${gameMode === 'teams' ? 'btn-active' : 'btn-outline'}`}
                  onClick={() => setGameMode('teams')}
                  type="button"
                >
                  Teams
                </button>
              </div>
            </div>
            <button className="btn btn-primary btn-lg" onClick={handleCreate} disabled={!name.trim()}>
              Create Room
            </button>
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Back</button>
          </div>
        )}

        {mode === 'join' && (
          <div className="home-form">
            <h2>Join a Game</h2>
            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={15}
              autoFocus
            />
            <input
              type="text"
              placeholder="Room Code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={6}
              className="room-code-input"
            />
            <button className="btn btn-primary btn-lg" onClick={handleJoin} disabled={!name.trim() || !code.trim()}>
              Join Room
            </button>
            <button className="btn btn-ghost" onClick={() => setMode(null)}>Back</button>
          </div>
        )}

        <div className="home-rules">
          <details>
            <summary>📖 Game Rules</summary>
            <div className="rules-content">
              <p><strong>11 Rounds</strong> — Round N deals N cards per player.</p>
              <p><strong>Bidding</strong> — Bid how many tricks you'll win (0 to N).</p>
              <p><strong>Spades are Trump</strong> — Spades beat all other suits.</p>
              <p><strong>Scoring</strong> — Make your bid = 10 x bid + 1 per overtrick. Miss = -10 x bid.</p>
              <p><strong>Nil Rounds (10-11)</strong> — Bid zero before seeing cards: +100 if you win 0 tricks, -100 if you fail.</p>
              <p><strong>Denominator Penalty</strong> — If your total ends in 5, lose 55 points!</p>
              <p><strong>Winner</strong> — Highest score after all 11 rounds.</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
