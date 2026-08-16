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

// Générateur pseudo-aléatoire déterministe (mulberry32), à la place de `Math.random()`.
// ─────────────────────────────────────────────────────────────────────────────────────
// ⚠️ CE N'EST PAS UN DÉTAIL D'IMPLÉMENTATION, c'est le correctif d'un bug visible.
// Avec `Math.random()`, la MÊME situation donnait un pourcentage différent à chaque calcul :
// amplitude mesurée de 2,0 points sur AA contre KK. Or l'équité est recalculée à chaque step du
// replayer — reculer d'un cran puis avancer à nouveau suffisait à voir le chiffre bouger sous les
// yeux, ce qui donne l'impression d'un chiffre inventé. Pire pour une app sociale : deux personnes
// qui commentent la même main y lisaient deux valeurs différentes.
// La graine est dérivée de la SITUATION elle-même (cartes, board, variante), pas d'une constante :
// deux situations différentes gardent des tirages indépendants, et une situation donnée rend
// toujours exactement le même résultat, sur n'importe quel appareil.
// Ce que ça NE corrige pas : la précision. Le chiffre reste une estimation à ~1 point près de la
// valeur exacte, il est simplement toujours la MÊME estimation. Augmenter `MONTE_CARLO_SAMPLES`
// est le seul levier sur ce point, et il se paie en temps de calcul (cf. le cache plus bas).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage FNV-1a 32 bits — de quoi transformer la clé de situation en graine. */
function hashSeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Clé canonique d'une situation d'équité. Les contendants sont triés par `seatId` pour que l'ordre
 * des sièges dans le tableau n'influe ni sur la graine ni sur le cache — la même situation décrite
 * dans un autre ordre doit rendre le même résultat.
 */
function situationKey(contenders: EquityContender[], board: Card[], variant: Variant): string {
  const mains = contenders
    .map((c) => `${c.seatId}:${c.holeCards.map(cardKey).join('')}`)
    .sort()
    .join('|');
  return `${variant}#${board.map(cardKey).join('')}#${mains}`;
}

// Cache des équités déjà calculées. Le replayer recalcule TOUT l'état de la main à chaque step
// (`computeHandState` dans un `useMemo` sur `[hand, step]`), donc sans ça, chaque aller-retour dans
// la main repayait le calcul complet — 560 ms mesurées en PLO5 à 4 joueurs sur un Mac, trois à six
// fois plus sur un iPhone, en synchrone pendant le rendu. Avec le cache, seule la première visite
// d'une situation coûte quelque chose ; revenir en arrière ou relancer la lecture est gratuit.
// La borne évite qu'un long défilement de feed ne fasse enfler la mémoire indéfiniment : au-delà,
// on évince la plus ancienne entrée insérée (une `Map` conserve l'ordre d'insertion).
const CACHE_MAX_ENTRIES = 200;
const equityCache = new Map<string, Record<string, number>>();

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
  const key = situationKey(contenders, board, variant);
  const cached = equityCache.get(key);
  // Copie défensive : l'objet rendu au cache ne doit pas pouvoir être modifié par un appelant,
  // sinon la valeur empoisonnée serait resservie à tous les appels suivants sans aucun signe.
  if (cached) return { ...cached };

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
    // Tirage par BLOCS DISJOINTS, et non par run-outs indépendants : on mélange une fois tout le
    // paquet restant, puis on y découpe des boards qui ne partagent aucune carte (9 boards de 5
    // cartes dans 48). Deux boards du même mélange ne peuvent donc pas contenir le même roi — les
    // tirages se répartissent mécaniquement mieux sur le paquet qu'une suite de tirages
    // indépendants, où rien n'empêche la même carte de ressortir dix fois de suite.
    // L'estimateur reste sans biais (chaque bloc est, pris seul, un board uniforme) mais sa
    // dispersion tombe : écart-type mesuré 0,57 point contre 0,797, soit deux fois moins de
    // variance POUR LE MÊME COÛT (un mélange complet pour 9 boards revient au même nombre
    // d'échanges que 9 mélanges partiels de 5 cartes). Vérifié sur 400 graines dans
    // `scripts/test-equity.js`.
    const random = mulberry32(hashSeed(key));
    const deck = [...unseenDeck];
    const n = deck.length;
    const boardsParMelange = Math.floor(n / cardsToDeal);
    let tires = 0;
    while (tires < MONTE_CARLO_SAMPLES) {
      for (let i = 0; i < n - 1; i++) {
        const j = i + Math.floor(random() * (n - i));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      for (let b = 0; b < boardsParMelange && tires < MONTE_CARLO_SAMPLES; b++) {
        tally([...board, ...deck.slice(b * cardsToDeal, (b + 1) * cardsToDeal)]);
        tires++;
      }
    }
  }

  const equities: Record<string, number> = {};
  for (const c of contenders) {
    equities[c.seatId] = (totals[c.seatId] / simCount) * 100;
  }

  if (equityCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = equityCache.keys().next().value;
    if (oldest !== undefined) equityCache.delete(oldest);
  }
  equityCache.set(key, equities);
  return { ...equities };
}
