import { getCardDisplay } from '../utils/cardUtils';
import './Hand.css';

export default function Hand({ cards, onPlayCard, isMyTurn, phase }) {
  const canPlay = isMyTurn && phase === 'playing';

  return (
    <div className="hand-container">
      <div className="hand">
        {cards.map((card, index) => {
          const display = getCardDisplay(card);
          const totalCards = cards.length;
          const fanAngle = Math.min(3, 30 / totalCards);
          const rotation = (index - (totalCards - 1) / 2) * fanAngle;
          const translateY = Math.abs(index - (totalCards - 1) / 2) * 3;

          return (
            <div
              key={card.id}
              className={`card ${canPlay ? 'playable' : ''} ${display.color === '#e74c3c' ? 'red' : 'black'}`}
              style={{
                transform: `rotate(${rotation}deg) translateY(${translateY}px)`,
                zIndex: index
              }}
              onClick={() => canPlay && onPlayCard(card.id)}
            >
              <div className="card-corner top-left">
                <span className="card-rank">{display.rank}</span>
                <span className="card-suit">{display.symbol}</span>
              </div>
              <div className="card-center">
                <span className="card-suit-large">{display.symbol}</span>
              </div>
              <div className="card-corner bottom-right">
                <span className="card-rank">{display.rank}</span>
                <span className="card-suit">{display.symbol}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
