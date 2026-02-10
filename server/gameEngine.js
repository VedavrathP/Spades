/**
 * Game Engine for Spades
 * Handles: deck creation (double deck), shuffle, deal, card ranking,
 * trick resolution, bidding, scoring, round/game progression.
 */

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

/**
 * Create a double deck (104 cards). Each card has a unique id
 * to distinguish duplicates from the two decks.
 */
function createDoubleDeck() {
  const deck = [];
  let id = 0;
  for (let deckNum = 0; deckNum < 2; deckNum++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ id: id++, suit, rank, value: RANK_VALUES[rank], deckNum });
      }
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle
 */
function shuffle(deck) {
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Deal N cards to each player from a shuffled double deck.
 */
function deal(players, cardsPerPlayer) {
  const deck = shuffle(createDoubleDeck());
  const hands = {};
  for (let i = 0; i < players.length; i++) {
    hands[players[i]] = deck.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer);
  }
  return hands;
}

/**
 * Determine trick winner.
 * - The led suit must be followed if possible (enforced elsewhere).
 * - Spades are trump and beat all non-spade cards.
 * - Among same suit, highest rank wins.
 * - If multiple spades played, highest spade wins.
 * - On exact tie (same suit & rank from double deck), first played wins.
 *
 * @param {Array} trick - Array of { playerId, card } in play order
 * @param {string} ledSuit - The suit that was led
 * @returns {{ winnerId: string, winningCard: object }}
 */
function determineTrickWinner(trick, ledSuit) {
  let bestIdx = 0;
  let bestCard = trick[0].card;

  for (let i = 1; i < trick.length; i++) {
    const card = trick[i].card;
    const isBetter = isCardBetter(card, bestCard, ledSuit);
    if (isBetter) {
      bestIdx = i;
      bestCard = card;
    }
  }

  return {
    winnerId: trick[bestIdx].playerId,
    winningCard: bestCard
  };
}

/**
 * Compare if cardA (played later) beats cardB (played earlier) given the led suit.
 * Spades are trump.
 * On exact tie (same suit & rank from double deck), later card wins.
 */
function isCardBetter(cardA, cardB, ledSuit) {
  const aIsSpade = cardA.suit === 'spades';
  const bIsSpade = cardB.suit === 'spades';
  const aFollows = cardA.suit === ledSuit;
  const bFollows = cardB.suit === ledSuit;

  // If A is spade and B is not -> A wins (trump)
  if (aIsSpade && !bIsSpade) return true;
  // If B is spade and A is not -> B wins (trump)
  if (bIsSpade && !aIsSpade) return false;
  // Both spades -> higher or equal value wins (later card wins ties)
  if (aIsSpade && bIsSpade) {
    return cardA.value >= cardB.value;
  }
  // Neither is spade
  // If A follows led suit and B doesn't -> A wins
  if (aFollows && !bFollows) return true;
  // If B follows led suit and A doesn't -> B wins
  if (bFollows && !aFollows) return false;
  // Both follow same suit -> higher or equal value wins (later card wins ties)
  return cardA.value >= cardB.value;
}

/**
 * Check if a player can play a given card.
 * Must follow led suit if they have cards of that suit.
 * No spades-breaking restriction — any card can be led at any time.
 */
function isValidPlay(card, hand, ledSuit, spadesBroken, isLeading) {
  if (isLeading) {
    // Any card can be led, including spades
    return true;
  }

  // Following: must follow suit if possible
  if (ledSuit) {
    const hasLedSuit = hand.some(c => c.suit === ledSuit);
    if (hasLedSuit && card.suit !== ledSuit) return false;
  }

  return true;
}

/**
 * Calculate score for a player/team for a single round.
 * @param {number} bid - The bid amount
 * @param {number} tricksWon - Tricks actually won
 * @param {boolean} isNil - Whether this was a Nil bid
 * @returns {{ roundScore: number, overtricks: number }}
 */
function calculateRoundScore(bid, tricksWon, isNil) {
  if (isNil) {
    // Nil: +100 if 0 tricks, -100 if any tricks won
    return {
      roundScore: tricksWon === 0 ? 100 : -100,
      overtricks: 0
    };
  }

  if (bid === 0) {
    // Bid 0 (not Nil): 0 for bid, +1 per trick won
    return {
      roundScore: tricksWon,
      overtricks: tricksWon
    };
  }

  if (tricksWon >= bid) {
    // Made bid: 10 * bid + 1 per overtrick
    const overtricks = tricksWon - bid;
    return {
      roundScore: (bid * 10) + overtricks,
      overtricks
    };
  } else {
    // Failed bid: -10 * bid
    return {
      roundScore: -(bid * 10),
      overtricks: 0
    };
  }
}

/**
 * Check and apply the denominator penalty.
 * If the score crosses or lands on any number ending in 5 (e.g. 5, 15, 25, ..., -5, -15, ...),
 * deduct 55 points. "Crosses" means the previous score was below x5 and new score is at or above it.
 *
 * @param {number} previousScore - Score before this round
 * @param {number} newScore - Score after adding this round's points
 * @returns {{ newTotal: number, penaltyApplied: boolean }}
 */
function applyDenominatorPenalty(previousScore, newScore) {
  // Find all x5 boundaries between previousScore and newScore
  // A boundary is any integer ending in 5: ..., -15, -5, 5, 15, 25, 35, ...

  if (previousScore === newScore) {
    return { newTotal: newScore, penaltyApplied: false };
  }

  const low = Math.min(previousScore, newScore);
  const high = Math.max(previousScore, newScore);

  // Find the first x5 value that is > low and <= high
  // Start from the nearest x5 above low
  let firstX5 = Math.floor(low / 10) * 10 + 5;
  if (firstX5 <= low) firstX5 += 10;

  let crossed = false;
  if (firstX5 <= high) {
    crossed = true;
  }

  // Also check negative direction: if score decreased and crossed a negative x5
  // The above logic handles both directions since we use low/high

  if (crossed) {
    return {
      newTotal: newScore - 55,
      penaltyApplied: true
    };
  }

  return {
    newTotal: newScore,
    penaltyApplied: false
  };
}

/**
 * Create initial game state for a room.
 */
function createGameState(players, gameMode, teams) {
  const playerOrder = [...players];

  const scores = {};
  const roundHistory = {};
  for (const p of players) {
    scores[p] = 0;
    roundHistory[p] = [];
  }

  let teamScores = null;
  let teamRoundHistory = null;
  if (gameMode === 'teams' && teams) {
    teamScores = {};
    teamRoundHistory = {};
    for (const teamName of Object.keys(teams)) {
      teamScores[teamName] = 0;
      teamRoundHistory[teamName] = [];
    }
  }

  return {
    currentRound: 1,
    phase: 'nil-prompt', // nil-prompt -> bidding -> playing -> round-end -> (next round or game-over)
    playerOrder,
    currentPlayerIndex: 0,
    hands: {},
    bids: {},
    nilBids: {}, // playerId -> true if nil
    tricksWon: {},
    currentTrick: [],
    trickNumber: 0,
    ledSuit: null,
    spadesBroken: false,
    scores,
    roundHistory,
    teams,
    teamScores,
    teamRoundHistory,
    gameMode,
    dealerIndex: 0,
    biddingStartIndex: 0,
    firstLeadIndex: 0,
    lastTrickWinner: null,
    gameOver: false,
    winner: null
  };
}

/**
 * Start a new round: deal cards, reset trick state.
 * For rounds 10-11, phase starts at 'nil-prompt'.
 * For rounds 1-9, phase starts at 'bidding'.
 *
 * Bidding rotates sequentially (dealer button style).
 * First card lead goes to whoever won the last trick of the previous round.
 * For round 1 (no previous winner), the player after the dealer leads.
 */
function startRound(gameState) {
  const round = gameState.currentRound;
  const players = gameState.playerOrder;

  // Deal cards
  gameState.hands = deal(players, round);
  gameState.bids = {};
  gameState.nilBids = {};
  gameState.tricksWon = {};
  gameState.currentTrick = [];
  gameState.trickNumber = 0;
  gameState.ledSuit = null;
  gameState.spadesBroken = false;

  for (const p of players) {
    gameState.tricksWon[p] = 0;
  }

  // Dealer rotates each round (bidding starts from dealer position going sequentially)
  gameState.dealerIndex = (round - 1) % players.length;
  // Bidding starts from the player after the dealer
  gameState.biddingStartIndex = (gameState.dealerIndex + 1) % players.length;
  gameState.currentPlayerIndex = gameState.biddingStartIndex;

  // First card lead: last trick winner from previous round, or player after dealer for round 1
  if (gameState.lastTrickWinner) {
    gameState.firstLeadIndex = players.indexOf(gameState.lastTrickWinner);
    if (gameState.firstLeadIndex === -1) {
      gameState.firstLeadIndex = (gameState.dealerIndex + 1) % players.length;
    }
  } else {
    gameState.firstLeadIndex = (gameState.dealerIndex + 1) % players.length;
  }

  // Nil prompt only for rounds 10 and 11
  if (round >= 10) {
    gameState.phase = 'nil-prompt';
  } else {
    gameState.phase = 'bidding';
  }

  return gameState;
}

/**
 * Get the current player's ID.
 */
function getCurrentPlayer(gameState) {
  return gameState.playerOrder[gameState.currentPlayerIndex];
}

/**
 * Sort a hand for display: by suit (spades, hearts, diamonds, clubs), then by rank.
 */
function sortHand(hand) {
  const suitOrder = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 };
  return [...hand].sort((a, b) => {
    if (suitOrder[a.suit] !== suitOrder[b.suit]) {
      return suitOrder[a.suit] - suitOrder[b.suit];
    }
    return b.value - a.value;
  });
}

module.exports = {
  createDoubleDeck,
  shuffle,
  deal,
  determineTrickWinner,
  isCardBetter,
  isValidPlay,
  calculateRoundScore,
  applyDenominatorPenalty,
  createGameState,
  startRound,
  getCurrentPlayer,
  sortHand,
  SUITS,
  RANKS,
  RANK_VALUES
};
