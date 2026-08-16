import type { Card, Rank, Variant } from '../types/poker';

const RANK_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const RANK_VALUE: Record<Rank, number> = RANK_ORDER.reduce((acc, r, i) => {
  acc[r] = i + 2; // '2' -> 2, ..., 'A' -> 14
  return acc;
}, {} as Record<Rank, number>);

/**
 * [catégorie, ...départages] comparable terme à terme (plus grand = meilleur). La catégorie va de
 * 0 (carte haute) à 8 (quinte flush) ; les départages qui suivent dépendent de la catégorie
 * (ex : brelan → [3, rangDuBrelan, kicker1, kicker2]).
 */
export type HandRank = number[];

function chooseK<T>(arr: T[], k: number): T[][] {
  const results: T[][] = [];
  const combo: T[] = [];
  function backtrack(start: number) {
    if (combo.length === k) {
      results.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1);
      combo.pop();
    }
  }
  backtrack(0);
  return results;
}

function evaluate5(cards: Card[]): HandRank {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0].suit);

  const uniqueValues = Array.from(new Set(values)).sort((a, b) => b - a);
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueValues.length === 5) {
    if (uniqueValues[0] - uniqueValues[4] === 4) {
      isStraight = true;
      straightHigh = uniqueValues[0];
    } else if (uniqueValues.join(',') === '14,5,4,3,2') {
      // Quinte basse A-2-3-4-5 : l'as compte comme carte basse, la quinte "culmine" à 5.
      isStraight = true;
      straightHigh = 5;
    }
  }

  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Trié par nombre d'occurrences (desc) puis par rang (desc) : place naturellement le brelan
  // avant la paire dans un full, la paire haute avant la basse dans une double paire, etc.
  const grouped = Array.from(counts.entries()).sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : b[0] - a[0]));
  const pattern = grouped.map(([, c]) => c);

  if (isStraight && isFlush) return [8, straightHigh];
  if (pattern[0] === 4) return [7, grouped[0][0], grouped[1][0]];
  if (pattern[0] === 3 && pattern[1] === 2) return [6, grouped[0][0], grouped[1][0]];
  if (isFlush) return [5, ...values];
  if (isStraight) return [4, straightHigh];
  if (pattern[0] === 3) return [3, grouped[0][0], grouped[1][0], grouped[2][0]];
  if (pattern[0] === 2 && pattern[1] === 2) return [2, grouped[0][0], grouped[1][0], grouped[2][0]];
  if (pattern[0] === 2) return [1, grouped[0][0], grouped[1][0], grouped[2][0], grouped[3][0]];
  return [0, ...values];
}

export function compareHandRanks(a: HandRank, b: HandRank): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? -1) - (b[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** Meilleure main de 5 cartes parmi les `cards` fournies (typiquement 7 : 2 en main + 5 au board).
 * Hold'em uniquement : n'importe quelles 5 des cartes disponibles (on peut jouer le board). */
export function bestHandRank(cards: Card[]): HandRank {
  if (cards.length < 5) throw new Error('bestHandRank requires at least 5 cards');
  let best: HandRank | null = null;
  for (const combo of chooseK(cards, 5)) {
    const rank = evaluate5(combo);
    if (!best || compareHandRanks(rank, best) > 0) best = rank;
  }
  return best!;
}

/**
 * Meilleure main pour une variante Omaha (PLO/PLO5) : EXACTEMENT 2 cartes fermées + EXACTEMENT 3 du
 * board. C'est la règle fondamentale qui distingue l'Omaha du Hold'em — on ne peut jamais jouer le
 * board, ni utiliser 1, 3 ou 4 cartes de sa main. Suppose `board.length >= 3` (toujours vrai à
 * l'évaluation : le board est complété à 5 cartes avant tout calcul de gagnant ou d'équité).
 */
function bestOmahaHandRank(holeCards: Card[], board: Card[]): HandRank {
  let best: HandRank | null = null;
  // Les triplets du board sont sortis de la boucle : ils ne dépendent pas de la paire fermée, et
  // les reconstruire à chaque itération multipliait le travail par le nombre de paires possibles
  // (10 en PLO5).
  const board3s = chooseK(board, 3);
  for (const hole2 of chooseK(holeCards, 2)) {
    for (const board3 of board3s) {
      const rank = evaluate5([...hole2, ...board3]);
      if (!best || compareHandRanks(rank, best) > 0) best = rank;
    }
  }
  if (!best) throw new Error('bestOmahaHandRank requires >= 2 hole cards and >= 3 board cards');
  return best;
}

/** Meilleure main d'un joueur selon la variante — aiguille vers la règle Hold'em (5 libres parmi 7)
 * ou Omaha (2 en main + 3 au board obligatoires). Point d'entrée unique pour ne jamais dupliquer le
 * choix de règle entre la désignation du gagnant et le calcul d'équité. */
export function bestHandForVariant(holeCards: Card[], board: Card[], variant: Variant): HandRank {
  return variant === 'nlhe' ? bestHandRank([...holeCards, ...board]) : bestOmahaHandRank(holeCards, board);
}

export interface HandContender {
  seatId: string;
  holeCards: Card[];
}

/**
 * ID(s) du/des siège(s) à égalité EXACTE pour la meilleure main sur ce board — un seul élément
 * s'il n'y a pas d'égalité, plusieurs en cas de split pot. Utilisé à la fois pour déterminer le(s)
 * vainqueur(s) réel(s) d'une main (`handEngine.determineWinner`) et pour la part d'équité de
 * chaque run-out simulé (`equity.computeEquity`) — une seule implémentation, pas de logique de
 * départage dupliquée entre les deux.
 */
export function bestHandWinners(contenders: HandContender[], board: Card[], variant: Variant = 'nlhe'): string[] {
  let bestRank = bestHandForVariant(contenders[0].holeCards, board, variant);
  let winners = [contenders[0].seatId];
  for (let i = 1; i < contenders.length; i++) {
    const rank = bestHandForVariant(contenders[i].holeCards, board, variant);
    const cmp = compareHandRanks(rank, bestRank);
    if (cmp > 0) {
      bestRank = rank;
      winners = [contenders[i].seatId];
    } else if (cmp === 0) {
      winners.push(contenders[i].seatId);
    }
  }
  return winners;
}
