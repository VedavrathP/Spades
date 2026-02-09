import { useState } from 'react';
import { useGame } from '../context/GameContext';
import './BidPanel.css';

export default function BidPanel() {
  const { gameState, placeBid, playerName } = useGame();
  const [selectedBid, setSelectedBid] = useState(0);

  if (!gameState || gameState.phase !== 'bidding') return null;

  const isMyTurnToBid = gameState.currentPlayer === playerName && gameState.bids[playerName] === undefined;
  const alreadyBid = gameState.bids[playerName] !== undefined;
  const maxBid = gameState.currentRound;

  return (
    <div className="bid-panel">
      <h3>Round {gameState.currentRound} — Bidding</h3>

      {/* Show whose turn it is */}
      <div className="bidding-turn-info">
        {isMyTurnToBid
          ? <span className="your-turn-badge">🎯 Your turn to bid!</span>
          : alreadyBid
            ? <span className="bid-done-badge">✅ You bid {gameState.nilBids[playerName] ? 'NIL' : gameState.bids[playerName]}</span>
            : <span className="waiting-badge">Waiting for <strong>{gameState.currentPlayer}</strong> to bid...</span>
        }
      </div>

      {/* Bid selector — only shown when it's your turn */}
      {isMyTurnToBid && (
        <>
          <p className="bid-hint">How many tricks will you win? (0-{maxBid})</p>
          <div className="bid-selector">
            {Array.from({ length: maxBid + 1 }, (_, i) => i).map(bid => (
              <button
                key={bid}
                className={`bid-btn ${selectedBid === bid ? 'selected' : ''}`}
                onClick={() => setSelectedBid(bid)}
              >
                {bid}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-lg" onClick={() => placeBid(selectedBid)}>
            Confirm Bid: {selectedBid}
          </button>
        </>
      )}

      {/* Bids status for all players */}
      <div className="bids-status">
        {gameState.playerOrder.map(p => (
          <div key={p} className={`bid-status-item ${gameState.bids[p] !== undefined ? 'bid-done' : ''} ${gameState.currentPlayer === p && gameState.bids[p] === undefined ? 'bidding-now' : ''}`}>
            <span className="bid-player-name">
              {p}{p === playerName ? ' (You)' : ''}
            </span>
            <span className="bid-value">
              {gameState.bids[p] !== undefined
                ? (gameState.nilBids[p] ? 'NIL' : gameState.bids[p])
                : gameState.currentPlayer === p
                  ? '🔄'
                  : '...'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
