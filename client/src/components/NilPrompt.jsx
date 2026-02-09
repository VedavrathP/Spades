import { useGame } from '../context/GameContext';
import './NilPrompt.css';

export default function NilPrompt() {
  const { gameState, makeNilDecision, playerName } = useGame();

  if (!gameState || gameState.phase !== 'nil-prompt') return null;

  const alreadyDecided = gameState.nilBids[playerName] === true || gameState.nilBids[playerName] === false;

  if (alreadyDecided) {
    return (
      <div className="nil-prompt">
        <div className="nil-decided">
          <h3>{gameState.nilBids[playerName] ? '🎯 You chose NIL!' : '👀 You chose to see your cards'}</h3>
          <p>Waiting for other players to decide...</p>
          <div className="nil-status-list">
            {gameState.playerOrder.map(p => (
              <div key={p} className={`nil-status-item ${gameState.nilBids[p] !== undefined ? 'decided' : ''}`}>
                <span>{p}</span>
                <span>
                  {gameState.nilBids[p] === true ? 'NIL' :
                   gameState.nilBids[p] === false ? 'Playing' : '...'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="nil-prompt">
      <div className="nil-modal">
        <h2>Round {gameState.currentRound} — Nil Bid?</h2>
        <p className="nil-description">
          This is a Nil-eligible round! You can bid <strong>Nil (zero tricks)</strong> before
          seeing your cards for a chance at <strong>+100 points</strong>.
        </p>
        <p className="nil-warning">
          But if you win even one trick, you lose <strong>100 points</strong>!
        </p>
        <p className="nil-note">
          Once you choose to see your cards, you cannot bid Nil.
        </p>

        <div className="nil-buttons">
          <button className="btn btn-nil" onClick={() => makeNilDecision(true)}>
            🎯 Go Nil!
            <span className="btn-sub">+100 if you win 0 tricks</span>
          </button>
          <button className="btn btn-see-cards" onClick={() => makeNilDecision(false)}>
            👀 See My Cards
            <span className="btn-sub">Bid normally this round</span>
          </button>
        </div>
      </div>
    </div>
  );
}
