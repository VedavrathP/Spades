/**
 * Card rendering utilities
 */

const SUIT_SYMBOLS = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣'
};

const SUIT_COLORS = {
  spades: '#1a1a2e',
  hearts: '#e74c3c',
  diamonds: '#e74c3c',
  clubs: '#1a1a2e'
};

export function getSuitSymbol(suit) {
  return SUIT_SYMBOLS[suit] || '';
}

export function getSuitColor(suit) {
  return SUIT_COLORS[suit] || '#000';
}

export function getCardDisplay(card) {
  if (!card) return { rank: '', suit: '', symbol: '', color: '' };
  return {
    rank: card.rank,
    suit: card.suit,
    symbol: SUIT_SYMBOLS[card.suit],
    color: SUIT_COLORS[card.suit]
  };
}

export function getCardKey(card) {
  return `${card.rank}-${card.suit}-${card.deckNum}`;
}
