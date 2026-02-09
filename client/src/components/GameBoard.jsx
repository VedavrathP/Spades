import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { getCardDisplay } from '../utils/cardUtils';
import Hand from './Hand';
import BidPanel from './BidPanel';
import NilPrompt from './NilPrompt';
import Scoreboard from './Scoreboard';
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
    gameState, playerName, trickResult, roundEnd,
    playCard, nextRound, roomState, error
  } = useGame();
  const [scoreExpanded, setScoreExpanded] = useState(false);

  if (!gameState) return <div className="loading">Loading game...</div>;

  const isHost = roomState?.players?.find(p => p.name === playerName)?.id === roomState?.hostId;
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
          <span className="round-badge">Round {gameState.currentRound}/11</span>
          <span className="trick-badge">Trick {gameState.trickNumber + 1}/{gameState.currentRound}</span>
        </div>
        <div className="phase-info">
          {gameState.phase === 'nil-prompt' && '🎯 Nil Decision'}
          {gameState.phase === 'bidding' && (isMyTurn && gameState.bids?.[playerName] === undefined ? '📝 Your Bid!' : `📝 ${gameState.currentPlayer} is bidding`)}
          {gameState.phase === 'playing' && (isMyTurn ? '🃏 Your Turn!' : `Waiting for ${gameState.currentPlayer}`)}
        </div>
      </div>

      {error && <div className="game-error">{error}</div>}

      {/* Nil Prompt */}
      {gameState.phase === 'nil-prompt' && <NilPrompt />}

      {/* Bid Panel + Hand visible during bidding */}
      {gameState.phase === 'bidding' && (
        <div className="bidding-area">
          <BidPanel />
          <Hand
            cards={myHand}
            onPlayCard={() => {}}
            isMyTurn={false}
            phase={gameState.phase}
          />
        </div>
      )}

      {/* ─── TABLE VIEW (playing phase) ─── */}
      {gameState.phase === 'playing' && (
        <div className="table-container">
          <div className="table">
            {/* Felt surface */}
            <div className="table-felt">

              {/* Other players seated around the table */}
              {seatedPlayers.map(({ name, position }) => {
                const isActive = gameState.currentPlayer === name;
                const cardPlayed = trickCardByPlayer[name];
                const cardDisplay = cardPlayed ? getCardDisplay(cardPlayed) : null;
                const cardCount = gameState.otherHandCounts[name] || 0;

                return (
                  <div key={name} className={`table-seat seat-${position}`}>
                    {/* Player info */}
                    <div className={`seat-player ${isActive ? 'active-turn' : ''}`}>
                      <div className="seat-name">{name}</div>
                      <div className="seat-stats">
                        <span>B:{gameState.nilBids[name] ? 'NIL' : gameState.bids[name]}</span>
                        <span>W:{gameState.tricksWon[name] || 0}</span>
                      </div>
                      <CardBacks count={cardCount} />
                    </div>

                    {/* Card thrown on table */}
                    {cardDisplay && (
                      <div className={`table-played-card ${cardDisplay.color === '#e74c3c' ? 'red' : 'black'}`}>
                        <span className="tpc-rank">{cardDisplay.rank}</span>
                        <span className="tpc-suit">{cardDisplay.symbol}</span>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Center trick area */}
              <div className="table-center">
                {/* My played card (if any) */}
                {trickCardByPlayer[playerName] && (() => {
                  const d = getCardDisplay(trickCardByPlayer[playerName]);
                  return (
                    <div className={`table-played-card my-played ${d.color === '#e74c3c' ? 'red' : 'black'}`}>
                      <span className="tpc-rank">{d.rank}</span>
                      <span className="tpc-suit">{d.symbol}</span>
                    </div>
                  );
                })()}

                {/* Trick Result overlay */}
                {trickResult && (
                  <div className="trick-result-bubble">
                    <span className="trick-winner">{trickResult.winner} wins!</span>
                  </div>
                )}
              </div>

              {/* My seat at the bottom */}
              <div className="table-seat seat-bottom">
                <div className={`seat-player my-seat ${isMyTurn ? 'active-turn' : ''}`}>
                  <div className="seat-name">{playerName} (You)</div>
                  <div className="seat-stats">
                    <span>Bid: {gameState.nilBids[playerName] ? 'NIL' : gameState.bids[playerName]}</span>
                    <span>Won: {gameState.tricksWon[playerName] || 0}</span>
                    <span>Score: {gameState.scores[playerName] || 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* My Hand */}
          <Hand
            cards={myHand}
            onPlayCard={playCard}
            isMyTurn={isMyTurn}
            phase={gameState.phase}
          />
        </div>
      )}

      {/* Scoreboard */}
      <Scoreboard expanded={scoreExpanded} onToggle={() => setScoreExpanded(!scoreExpanded)} />
    </div>
  );
}
