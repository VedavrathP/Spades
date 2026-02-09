import { useState } from 'react';
import { useGame } from '../context/GameContext';
import './BidPanel.css';

export default function BidPanel() {
  const { gameState, placeBid, playerName } = useGame();
  const [selectedBid, setSelectedBid] = useState(0);

  if (!gameState || gameState.phase !== 'bidding') return null;

  // If player already bid (e.g., nil player)
  if (gameState.bids[playerName] !== undefined) {
    return (
      <div className="bid-panel">
        <div className="bid-submitted">
          <h3>Your Bid: {gameState.nilBids[playerName] ? 'NIL' : gameState.bids[playerName]}</h3>
          <p>Waiting for others to bid...</p>
        </div>
        <div className="bids-status">
          {gameState.playerOrder.map(p => (
            <div key={p} className={`bid-status-item ${gameState.bids[p] !== undefined ? 'bid-done' : ''}`}>
              <span className="bid-player-name">{p}</span>
              <span className="bid-value">
                {gameState.bids[p] !== undefined
                  ? (gameState.nilBids[p] ? 'NIL' : gameState.bids[p])
                  : '...'}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const maxBid = gameState.currentRound;

  return (
    <div className="bid-panel">
      <h3>Round {gameState.currentRound} — Place Your Bid</h3>
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

      <div className="bids-status">
        {gameState.playerOrder.map(p => (
          <div key={p} className={`bid-status-item ${gameState.bids[p] !== undefined ? 'bid-done' : ''}`}>
            <span className="bid-player-name">{p}</span>
            <span className="bid-value">
              {gameState.bids[p] !== undefined
                ? (gameState.nilBids[p] ? 'NIL' : gameState.bids[p])
                : '...'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
