import type { Action, Post, Seat } from '../types/poker';

const seats: Seat[] = [
  { id: 's-utg', position: 'UTG', startingStack: 500, isHero: false },
  { id: 's-hj', position: 'HJ', startingStack: 500, isHero: false, playerName: 'Marco_75' },
  {
    id: 's-co',
    position: 'CO',
    startingStack: 500,
    isHero: true,
    playerName: 'Hero',
    holeCards: [
      { rank: 'Q', suit: 'c' },
      { rank: 'Q', suit: 'd' },
    ],
  },
  { id: 's-btn', position: 'BTN', startingStack: 500, isHero: false },
  { id: 's-sb', position: 'SB', startingStack: 500, isHero: false },
  { id: 's-bb', position: 'BB', startingStack: 500, isHero: false },
];

const actions: Action[] = [
  { id: 'a1', street: 'preflop', seatId: 's-sb', type: 'post-sb', amount: 2, order: 1 },
  { id: 'a2', street: 'preflop', seatId: 's-bb', type: 'post-bb', amount: 5, order: 2 },
  { id: 'a3', street: 'preflop', seatId: 's-utg', type: 'fold', order: 3 },
  { id: 'a4', street: 'preflop', seatId: 's-hj', type: 'raise', amount: 15, order: 4 },
  { id: 'a5', street: 'preflop', seatId: 's-co', type: 'call', amount: 15, order: 5 },
  { id: 'a6', street: 'preflop', seatId: 's-btn', type: 'fold', order: 6 },
  { id: 'a7', street: 'preflop', seatId: 's-sb', type: 'fold', order: 7 },
  { id: 'a8', street: 'preflop', seatId: 's-bb', type: 'call', amount: 15, order: 8 },

  { id: 'a9', street: 'flop', seatId: 's-bb', type: 'check', order: 9 },
  { id: 'a10', street: 'flop', seatId: 's-hj', type: 'bet', amount: 30, order: 10 },
  { id: 'a11', street: 'flop', seatId: 's-co', type: 'call', amount: 30, order: 11 },
  { id: 'a12', street: 'flop', seatId: 's-bb', type: 'fold', order: 12 },

  { id: 'a13', street: 'turn', seatId: 's-hj', type: 'bet', amount: 70, order: 13 },
  { id: 'a14', street: 'turn', seatId: 's-co', type: 'fold', order: 14 },
];

export const testPost: Post = {
  id: 'post-1',
  authorId: 'user-1',
  authorName: 'Hero',
  createdAt: '2026-07-14T21:30:00.000Z',
  location: 'Club Circus, Bruxelles',
  buyIn: undefined,
  level: undefined,
  title: 'Hero call contre un reg au club circus',
  voteQuestion: 'Tu payes cette river ?',
  voteCounts: { Oui: 34, Non: 12 },
  likeCount: 24,
  commentCount: 7,
  visibility: 'public',
  hand: {
    id: 'hand-1',
    variant: 'nlhe',
    gameType: 'cash',
    blinds: { sb: 2, bb: 5 },
    effectiveStack: 500,
    visibility: 'public',
    seats,
    board: {
      flop: [
        { rank: 'K', suit: 'h' },
        { rank: '9', suit: 'd' },
        { rank: '4', suit: 'c' },
      ],
      turn: { rank: '2', suit: 's' },
      river: { rank: '7', suit: 'd' },
    },
    actions,
  },
};
