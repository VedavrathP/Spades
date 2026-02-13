import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { getCardDisplay } from '../utils/cardUtils';
import Hand from './Hand';
import BidPanel from './BidPanel';
import NilPrompt from './NilPrompt';
import Scoreboard from './Scoreboard';
import DealingAnimation from './DealingAnimation';
import './GameBoard.css';

/**
 * Arrange other players around the table.
 * Returns an array of { name, position } where position is
 * one of: 'top', 'top-left', 'top-right', 'left', 'right'
 * depending on how many opponents there are.
 */
function getPlayerPositions(otherPlayers) {
  const count = otherPlayers.length;
  const positions = [];

  if (count === 1) {
    positions.push('top');
  } else if (count === 2) {
    positions.push('top-left', 'top-right');
  } else if (count === 3) {
    positions.push('left', 'top', 'right');
  } else if (count === 4) {
    positions.push('left', 'top-left', 'top-right', 'right');
  } else if (count === 5) {
    positions.push('left', 'top-left', 'top', 'top-right', 'right');
  } else if (count === 6) {
    positions.push('bottom-left', 'left', 'top-left', 'top-right', 'right', 'bottom-right');
  } else if (count === 7) {
    positions.push('bottom-left', 'left', 'top-left', 'top', 'top-right', 'right', 'bottom-right');
  } else {
    // fallback
    const allPos = ['bottom-left', 'left', 'top-left', 'top', 'top-right', 'right', 'bottom-right'];
    for (let i = 0; i < count; i++) {
      positions.push(allPos[i % allPos.length]);
    }
  }

  return otherPlayers.map((name, i) => ({ name, position: positions[i] }));
}

/** Render face-down card backs */
function CardBacks({ count }) {
  const n = Math.min(count, 11);
  return (
    <div className="card-backs">
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="card-back"
          style={{ marginLeft: i > 0 ? '-18px' : '0' }}
        >
          <div className="card-back-inner">♠</div>
        </div>
      ))}
    </div>
  );
}

export default function GameBoard() {
  const {
    gameState, playerName, roomCode, trickResult, roundEnd,
    playCard, nextRound, roomState, error,
    restartGame, endGame, leaveGame, playedCardId, reconnecting
  } = useGame();
  const [scoreExpanded, setScoreExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 600);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'restart' | 'end' | 'leave'
  const [isDealing, setIsDealing] = useState(false);
  const lastSeenRound = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 600);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Detect new round → trigger dealing animation
  useEffect(() => {
    if (!gameState) return;
    const round = gameState.currentRound;
    const phase = gameState.phase;
    // Only trigger on a fresh round (bidding or nil-prompt with trickNumber 0)
    if (
      round !== lastSeenRound.current &&
      (phase === 'bidding' || phase === 'nil-prompt') &&
      gameState.trickNumber === 0
    ) {
      lastSeenRound.current = round;
      setIsDealing(true);
    }
  }, [gameState]);

  const handleDealingComplete = useCallback(() => {
    setIsDealing(false);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
        setConfirmAction(null);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  if (!gameState) return <div className="loading">Loading game...</div>;

  const isHost = roomState?.players?.find(p => p.name === playerName)?.id === roomState?.hostId;

  const handleConfirmAction = () => {
    if (confirmAction === 'restart') restartGame();
    else if (confirmAction === 'end') endGame();
    else if (confirmAction === 'leave') leaveGame();
    setConfirmAction(null);
    setShowMenu(false);
  };
  const isMyTurn = gameState.currentPlayer === playerName;
  const myHand = gameState.hand || [];

  // Game Over screen
  if (gameState.gameOver && gameState.winner) {
    return (
      <div className="game-over-screen">
        <div className="game-over-content">
          <h1>🏆 Game Over!</h1>
          <div className="winner-announcement">
            <h2>{gameState.winner.name} Wins!</h2>
            <p className="winner-score">Final Score: {gameState.winner.score}</p>
          </div>
          <Scoreboard expanded={true} onToggle={() => {}} />
          <div className="game-over-actions">
            {isHost ? (
              <>
                <button className="btn btn-primary btn-lg" onClick={restartGame}>🔄 Play Again</button>
                <button className="btn btn-outline btn-lg" onClick={endGame}>❌ End Game</button>
              </>
            ) : (
              <button className="btn btn-outline btn-lg" onClick={leaveGame}>🚪 Leave</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Round End screen
  if (gameState.phase === 'round-end' && roundEnd) {
    return (
      <div className="round-end-screen">
        <div className="round-end-content">
          <h2>Round {roundEnd.round} Complete!</h2>

          <div className="round-scores">
            {Object.entries(roundEnd.roundScores).map(([name, score]) => (
              <div key={name} className={`round-score-item ${score >= 0 ? 'positive' : 'negative'}`}>
                <span className="rs-name">{name}</span>
                <span className="rs-score">{score >= 0 ? '+' : ''}{score}</span>
                {roundEnd.penalties[name] && (
                  <span className="rs-penalty">⚠️ -55 Penalty!</span>
                )}
              </div>
            ))}
          </div>

          <div className="current-standings">
            <h3>Current Standings</h3>
            {Object.entries(roundEnd.scores)
              .sort(([, a], [, b]) => b - a)
              .map(([name, score], i) => (
                <div key={name} className="standing-item">
                  <span className="standing-rank">#{i + 1}</span>
                  <span className="standing-name">{name}</span>
                  <span className="standing-score">{score}</span>
                </div>
              ))}
          </div>

          {isHost && (
            <button className="btn btn-primary btn-lg" onClick={nextRound}>
              Start Round {roundEnd.round + 1}
            </button>
          )}
          {!isHost && <p className="waiting-hint">Waiting for host to start next round...</p>}
        </div>
      </div>
    );
  }

  // Other players (everyone except me)
  const otherPlayers = gameState.playerOrder.filter(p => p !== playerName);
  const seatedPlayers = getPlayerPositions(otherPlayers);

  // Find which card in the trick belongs to which player
  const trickCardByPlayer = {};
  for (const play of gameState.currentTrick) {
    trickCardByPlayer[play.playerId] = play.card;
  }

  return (
    <div className="game-board">
      {/* Top bar */}
      <div className="game-top-bar">
        <div className="round-info">
          <span className="room-code-badge" title="Share this code to let players rejoin">🔑 {roomCode}</span>
          <span className="round-badge">Round {gameState.currentRound}/11</span>
          <span className="trick-badge">Trick {gameState.trickNumber + 1}/{gameState.currentRound}</span>
        </div>
        <div className="phase-info">
          {gameState.phase === 'nil-prompt' && '🎯 Nil Decision'}
          {gameState.phase === 'bidding' && (isMyTurn && gameState.bids?.[playerName] === undefined ? '📝 Your Bid!' : `📝 ${gameState.currentPlayer} is bidding`)}
          {gameState.phase === 'playing' && (isMyTurn ? '🃏 Your Turn!' : `Waiting for ${gameState.currentPlayer}`)}
        </div>
        <div className="game-menu-wrapper" ref={menuRef}>
          <button className="btn-menu" onClick={() => { setShowMenu(!showMenu); setConfirmAction(null); }} title="Game Menu">
            ☰
          </button>
          {showMenu && (
            <div className="game-menu-dropdown">
              {confirmAction ? (
                <div className="confirm-action">
                  <p className="confirm-text">
                    {confirmAction === 'restart' && 'Restart game? All progress will be lost.'}
                    {confirmAction === 'end' && 'End game? Room will be closed for everyone.'}
                    {confirmAction === 'leave' && 'Leave game? You will lose your spot.'}
                  </p>
                  <div className="confirm-buttons">
                    <button className="btn btn-danger btn-sm" onClick={handleConfirmAction}>Yes</button>
                    <button className="btn btn-outline btn-sm" onClick={() => setConfirmAction(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  {isHost && (
                    <>
                      <button className="menu-item" onClick={() => setConfirmAction('restart')}>
                        🔄 Restart Game
                      </button>
                      <button className="menu-item menu-danger" onClick={() => setConfirmAction('end')}>
                        ❌ End Game
                      </button>
                    </>
                  )}
                  {!isHost && (
                    <button className="menu-item menu-danger" onClick={() => setConfirmAction('leave')}>
                      🚪 Leave Game
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div className="game-error">{error}</div>}
      {reconnecting && (
        <div className="reconnecting-banner">
          <span className="reconnecting-spinner">⟳</span> Reconnecting to server...
        </div>
      )}

      {/* Dealing Animation */}
      {isDealing && (
        <DealingAnimation
          playerOrder={gameState.playerOrder}
          playerName={playerName}
          cardsPerRound={gameState.currentRound}
          myCards={myHand}
          dealerIndex={gameState.dealerIndex}
          onComplete={handleDealingComplete}
          isMobile={isMobile}
        />
      )}

      {/* ─── TABLE VIEW (always visible during all game phases) ─── */}
      {!isDealing && (
        <div className="table-container">
          <div className="table">
            <div className="table-felt">
              {/* Opponents row — scrollable on mobile, absolutely positioned on desktop */}
              <div className="opponents-row">
                {seatedPlayers.map(({ name, position }) => {
                  const isActive = gameState.phase === 'playing' && gameState.currentPlayer === name;
                  const cardPlayed = trickCardByPlayer[name];
                  const cardDisplay = cardPlayed ? getCardDisplay(cardPlayed) : null;
                  const cardCount = gameState.otherHandCounts[name] || 0;

                  return (
                    <div key={name} className={`table-seat seat-${position}`}>
                      <div className={`seat-player ${isActive ? 'active-turn' : ''}`}>
                        <div className="seat-name">{name}</div>
                        <div className="seat-stats">
                          {gameState.bids[name] !== undefined && (
                            <span>B:{gameState.nilBids[name] ? 'NIL' : gameState.bids[name]}</span>
                          )}
                          <span>W:{gameState.tricksWon[name] || 0}</span>
                        </div>
                        <CardBacks count={cardCount} />
                      </div>

                      {cardDisplay && (
                        <div className={`table-played-card ${cardDisplay.color === '#e74c3c' ? 'red' : 'black'}`}>
                          <span className="tpc-rank">{cardDisplay.rank}</span>
                          <span className="tpc-suit">{cardDisplay.symbol}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Table center — shows phase-dependent content */}
              <div className="table-center">
                {gameState.phase === 'nil-prompt' && (
                  <div className="table-center-overlay">
                    <NilPrompt />
                  </div>
                )}
                {gameState.phase === 'bidding' && (
                  <div className="table-center-overlay">
                    <BidPanel />
                  </div>
                )}
                {gameState.phase === 'playing' && (
                  <>
                    {gameState.currentTrick.map((play, i) => {
                      const d = getCardDisplay(play.card);
                      return (
                        <div key={i} className="trick-card-wrapper">
                          <div className={`table-played-card ${play.playerId === playerName ? 'my-played' : ''} ${d.color === '#e74c3c' ? 'red' : 'black'}`}>
                            <span className="tpc-rank">{d.rank}</span>
                            <span className="tpc-suit">{d.symbol}</span>
                          </div>
                          <span className="trick-card-label">{play.playerId === playerName ? 'You' : play.playerId}</span>
                        </div>
                      );
                    })}

                    {trickResult && (
                      <div className="trick-result-bubble">
                        <span className="trick-winner">{trickResult.winner} wins!</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* My seat at the bottom of the table */}
              <div className="table-seat seat-bottom">
                <div className={`seat-player my-seat ${isMyTurn ? 'active-turn' : ''}`}>
                  <div className="seat-name">{playerName} (You)</div>
                  <div className="seat-stats">
                    {gameState.bids[playerName] !== undefined && (
                      <span>Bid: {gameState.nilBids[playerName] ? 'NIL' : gameState.bids[playerName]}</span>
                    )}
                    <span>Won: {gameState.tricksWon[playerName] || 0}</span>
                    <span>Score: {gameState.scores[playerName] || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* My Hand — visible during bidding and playing */}
          {(gameState.phase === 'bidding' || gameState.phase === 'playing') && (
            <Hand
              cards={myHand}
              onPlayCard={gameState.phase === 'playing' ? playCard : () => {}}
              isMyTurn={isMyTurn}
              phase={gameState.phase}
              playedCardId={playedCardId}
            />
          )}
        </div>
      )}

      {/* Scoreboard */}
      <Scoreboard expanded={scoreExpanded} onToggle={() => setScoreExpanded(!scoreExpanded)} />
    </div>
  );
}
