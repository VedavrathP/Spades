import { useState, useEffect, useMemo } from 'react';
import { getCardDisplay } from '../utils/cardUtils';
import './DealingAnimation.css';

/**
 * Map position names to CSS translate targets (percentage offsets from center).
 * These match the seat positions used in GameBoard.
 */
const SEAT_TARGETS = {
  'top':          { x: 0,    y: -42 },
  'top-left':     { x: -36,  y: -36 },
  'top-right':    { x: 36,   y: -36 },
  'left':         { x: -48,  y: 0 },
  'right':        { x: 48,   y: 0 },
  'bottom-left':  { x: -34,  y: 36 },
  'bottom-right': { x: 34,   y: 36 },
  'bottom':       { x: 0,    y: 42 },
};

/**
 * Get seat positions for all players (same logic as GameBoard's getPlayerPositions,
 * but includes "you" at the bottom).
 */
function getAllPlayerPositions(playerOrder, myName) {
  const others = playerOrder.filter(p => p !== myName);
  const count = others.length;
  const positions = {};

  const positionList = [];
  if (count === 1) {
    positionList.push('top');
  } else if (count === 2) {
    positionList.push('top-left', 'top-right');
  } else if (count === 3) {
    positionList.push('left', 'top', 'right');
  } else if (count === 4) {
    positionList.push('left', 'top-left', 'top-right', 'right');
  } else if (count === 5) {
    positionList.push('left', 'top-left', 'top', 'top-right', 'right');
  } else if (count === 6) {
    positionList.push('bottom-left', 'left', 'top-left', 'top-right', 'right', 'bottom-right');
  } else if (count === 7) {
    positionList.push('bottom-left', 'left', 'top-left', 'top', 'top-right', 'right', 'bottom-right');
  } else {
    const allPos = ['bottom-left', 'left', 'top-left', 'top', 'top-right', 'right', 'bottom-right'];
    for (let i = 0; i < count; i++) {
      positionList.push(allPos[i % allPos.length]);
    }
  }

  others.forEach((name, i) => {
    positions[name] = positionList[i];
  });
  positions[myName] = 'bottom';

  return positions;
}

/**
 * DealingAnimation — shows cards flying from center to each player in round-robin order.
 *
 * Props:
 *  - playerOrder: array of player names in deal order
 *  - playerName: the current user's name
 *  - cardsPerRound: number of cards each player gets
 *  - myCards: array of the player's actual cards (to show face-up)
 *  - dealerIndex: index of the dealer in playerOrder
 *  - onComplete: callback when animation finishes
 *  - isMobile: boolean
 */
export default function DealingAnimation({
  playerOrder,
  playerName,
  cardsPerRound,
  myCards,
  dealerIndex,
  onComplete,
  isMobile,
}) {
  const [done, setDone] = useState(false);

  const positions = useMemo(
    () => getAllPlayerPositions(playerOrder, playerName),
    [playerOrder, playerName]
  );

  // Build the dealing sequence: round-robin starting from player after dealer
  const dealSequence = useMemo(() => {
    const seq = [];
    const numPlayers = playerOrder.length;
    const startIdx = (dealerIndex + 1) % numPlayers;

    // Track how many cards each player has received so far
    const playerCardCount = {};
    playerOrder.forEach(p => { playerCardCount[p] = 0; });

    for (let cardNum = 0; cardNum < cardsPerRound * numPlayers; cardNum++) {
      const playerIdx = (startIdx + (cardNum % numPlayers)) % numPlayers;
      const name = playerOrder[playerIdx];
      const isMe = name === playerName;
      const myCardIndex = playerCardCount[name];
      playerCardCount[name]++;

      seq.push({
        id: cardNum,
        targetPlayer: name,
        isMe,
        position: positions[name],
        // If it's my card, we'll show the face after it lands
        myCard: isMe && myCards[myCardIndex] ? myCards[myCardIndex] : null,
      });
    }
    return seq;
  }, [playerOrder, playerName, cardsPerRound, myCards, dealerIndex, positions]);

  // Total animation duration — scale delay so animation stays ~2-3 seconds
  const totalCards = dealSequence.length;
  const CARD_DELAY = totalCards > 30 ? 30 : totalCards > 15 ? 45 : 60; // ms between each card
  const CARD_FLY_DURATION = 300; // ms for each card to fly
  const totalDuration = totalCards * CARD_DELAY + CARD_FLY_DURATION + 400; // +400ms buffer

  useEffect(() => {
    const timer = setTimeout(() => {
      setDone(true);
      onComplete();
    }, totalDuration);
    return () => clearTimeout(timer);
  }, [totalDuration, onComplete]);

  if (done) return null;

  return (
    <div className={`dealing-overlay ${isMobile ? 'dealing-mobile' : ''}`}>
      <div className="dealing-table">
        {/* Player labels around the table */}
        {playerOrder.map(name => {
          const pos = positions[name];
          const isMe = name === playerName;
          return (
            <div
              key={name}
              className={`dealing-seat dealing-seat-${pos} ${isMe ? 'dealing-seat-me' : ''}`}
            >
              <span className="dealing-seat-name">
                {isMe ? `${name} (You)` : name}
              </span>
            </div>
          );
        })}

        {/* Deck in center */}
        <div className="dealing-deck">
          <div className="dealing-deck-card">
            <div className="dealing-deck-inner">♠</div>
          </div>
        </div>

        {/* Animated cards */}
        {dealSequence.map((item) => {
          const target = SEAT_TARGETS[item.position] || { x: 0, y: 0 };
          const delay = item.id * CARD_DELAY;

          return (
            <div
              key={item.id}
              className={`dealing-card ${item.isMe ? 'dealing-card-mine' : ''}`}
              style={{
                '--target-x': `${target.x}%`,
                '--target-y': `${target.y}%`,
                '--fly-duration': `${CARD_FLY_DURATION}ms`,
                animationDelay: `${delay}ms`,
              }}
            >
              {item.isMe && item.myCard ? (
                <div className="dealing-card-face">
                  <DealCardFace card={item.myCard} delay={delay + CARD_FLY_DURATION} />
                </div>
              ) : (
                <div className="dealing-card-back">
                  <span>♠</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Round label */}
      <div className="dealing-round-label">
        Dealing Round {cardsPerRound} — {cardsPerRound} cards each
      </div>
    </div>
  );
}

/** Small face-up card shown for the player's own cards after they land */
function DealCardFace({ card, delay }) {
  const display = getCardDisplay(card);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className={`dealing-face-inner ${revealed ? 'revealed' : ''} ${display.color === '#e74c3c' ? 'red' : 'black'}`}>
      <span className="df-rank">{display.rank}</span>
      <span className="df-suit">{display.symbol}</span>
    </div>
  );
}
