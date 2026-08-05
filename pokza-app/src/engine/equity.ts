import type { Card, Rank, Suit, Variant } from '../types/poker';
import { bestHandWinners } from './handEvaluator';

const ALL_RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const ALL_SUITS: Suit[] = ['h', 'd', 'c', 's'];
const FULL_DECK: Card[] = ALL_RANKS.flatMap((rank) => ALL_SUITS.map((suit) => ({ rank, suit })));

function cardKey(c: Card): string {
  return `${c.rank}${c.suit}`;
}

export interface EquityContender {
  seatId: string;
  holeCards: Card[];
}

// Préflop/flop tapis (3 ou 4 cartes à venir) : énumérer tous les run-outs exacts serait bien trop
// coûteux côté client (jusqu'à ~1,7M combinaisons à 5 cartes) — simulation Monte Carlo à la place.
// Turn/river connus (0-2 cartes à venir) restent énumérés exactement, largement assez rapides
// (au pire ~1000 combinaisons).
const MONTE_CARLO_SAMPLES = 2000;

function combinations<T>(arr: T[], k: number): T[][] {
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

// Tirage sans remise de `k` cartes par mélange de Fisher-Yates PARTIEL (on ne mélange que les k
// premières positions dont on a besoin, pas tout le tableau) — inutile de trier/mélanger les
// dizaines de cartes qu'on ne tirera jamais.
function sampleWithoutReplacement<T>(arr: T[], k: number): T[] {
  const copy = [...arr];
  const n = copy.length;
  const take = Math.min(k, n);
  for (let i = 0; i < take; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, take);
}

/**
 * Équité de chaque contendant : part moyenne du pot remportée sur l'ensemble des run-outs
 * possibles, étant donné leurs cartes connues et le board actuel (0 à 100). Un split exact entre
 * plusieurs gagnants sur un run-out donné partage la part également entre eux pour ce tirage.
 */
export function computeEquity(
  contenders: EquityContender[],
  board: Card[],
  variant: Variant = 'nlhe'
): Record<string, number> {
  const usedKeys = new Set<string>();
  for (const c of contenders) {
    for (const card of c.holeCards) usedKeys.add(cardKey(card));
  }
  for (const c of board) usedKeys.add(cardKey(c));

  const unseenDeck = FULL_DECK.filter((c) => !usedKeys.has(cardKey(c)));
  const cardsToDeal = 5 - board.length;

  const totals: Record<string, number> = {};
  for (const c of contenders) totals[c.seatId] = 0;

  let simCount = 0;
  const tally = (fullBoard: Card[]) => {
    const winners = bestHandWinners(contenders, fullBoard, variant);
    const share = 1 / winners.length;
    for (const w of winners) totals[w] += share;
    simCount++;
  };

  if (cardsToDeal <= 2) {
    for (const combo of combinations(unseenDeck, cardsToDeal)) {
      tally([...board, ...combo]);
    }
  } else {
    for (let i = 0; i < MONTE_CARLO_SAMPLES; i++) {
      tally([...board, ...sampleWithoutReplacement(unseenDeck, cardsToDeal)]);
    }
  }

  const equities: Record<string, number> = {};
  for (const c of contenders) {
    equities[c.seatId] = (totals[c.seatId] / simCount) * 100;
  }
  return equities;
}
