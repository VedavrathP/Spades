import { getCardDisplay } from '../utils/cardUtils';
import './Hand.css';

export default function Hand({ cards, onPlayCard, isMyTurn, phase, playedCardId }) {
  const canPlay = isMyTurn && phase === 'playing' && !playedCardId;
  const totalCards = cards.length;

  // Split into two rows if more than 6 cards
  const useRows = totalCards > 6;
  const midpoint = Math.ceil(totalCards / 2);
  const row1 = useRows ? cards.slice(0, midpoint) : cards;
  const row2 = useRows ? cards.slice(midpoint) : [];

  const renderCard = (card, index, rowLength) => {
    const display = getCardDisplay(card);
    const fanAngle = useRows ? 0 : Math.min(3, 30 / totalCards);
    const rotation = useRows ? 0 : (index - (rowLength - 1) / 2) * fanAngle;
    const translateY = useRows ? 0 : Math.abs(index - (rowLength - 1) / 2) * 3;

    return (
      <div
        key={card.id}
        className={`card ${canPlay ? 'playable' : ''} ${playedCardId === card.id ? 'card-played' : ''} ${display.color === '#e74c3c' ? 'red' : 'black'}`}
        style={{
          transform: useRows ? 'none' : `rotate(${rotation}deg) translateY(${translateY}px)`,
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
  };

  return (
    <div className={`hand-container ${useRows ? 'hand-rows' : ''}`}>
      <div className="hand-row">
        {row1.map((card, i) => renderCard(card, i, row1.length))}
      </div>
      {useRows && (
        <div className="hand-row">
          {row2.map((card, i) => renderCard(card, i, row2.length))}
        </div>
      )}
    </div>
  );
}
