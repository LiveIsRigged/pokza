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
// Arbitré le 16/08/2026, sur mesure et non sur estimation.
// ────────────────────────────────────────────────────────
// Ce nombre était plafonné par le GEL qu'il provoquait. Depuis que le calcul avance par tranches
// (`runEquityInSlices`), il ne coûte plus qu'un DÉLAI d'affichage — mais un délai réel, puisque
// rien ne s'affiche tant que le chiffre n'est pas prêt (décision produit).
//
// Le vrai plafond n'est pas le confort, c'est la lecture automatique : elle avance toutes les
// 1400 ms (`AUTOPLAY_INTERVAL_MS`) et un changement de pas ANNULE le calcul en cours. Or l'équité
// préflop n'existe qu'à un seul pas. Un calcul plus long que ça n'aboutirait jamais en lecture
// auto, et le pourcentage ne s'afficherait pas du tout.
//
// Mesuré sur l'iPhone de l'utilisateur (écran temporaire `/mesure`, depuis retiré) : le téléphone
// n'est que 1,3 fois plus lent que le Mac, pas 3 à 6 fois comme je l'avais estimé. À 5000 tirages,
// le pire cas — PLO5 à 4 joueurs — prend 448 ms : il resterait dans la fenêtre même sur un
// téléphone deux fois plus lent que celui-ci.
//
// Erreur MESURÉE contre une référence à 200 000 tirages :
//                     2000 (avant)   5000 (ici)
//   NLHE 4 joueurs      0,68 pt       0,39 pt
//   PLO5 4 joueurs      0,74 pt       0,47 pt
//   pire cas            2,35 pt       1,29 pt
//
// ⚠️ Ne pas viser « l'arrondi affiché toujours juste » : ce taux vaut environ le double de
// l'erreur moyenne (un vrai 46,49 bascule pour 0,02 point d'erreur), il faudrait ~1,6 million de
// tirages pour le descendre sous 5 %. La grandeur qui compte est l'erreur en points, parce que
// c'est elle qui peut inverser l'ordre de deux mains proches.
const MONTE_CARLO_SAMPLES = 5000;

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
export function situationKey(contenders: EquityContender[], board: Card[], variant: Variant): string {
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

function memoriser(key: string, equities: Record<string, number>): Record<string, number> {
  if (equityCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = equityCache.keys().next().value;
    if (oldest !== undefined) equityCache.delete(oldest);
  }
  equityCache.set(key, equities);
  // Copie défensive : l'objet gardé en cache ne doit pas pouvoir être modifié par un appelant,
  // sinon la valeur empoisonnée serait resservie à tous les appels suivants sans aucun signe.
  return { ...equities };
}

/** Le paquet restant et le nombre de cartes à venir, une fois écartées toutes les cartes connues. */
function preparer(contenders: EquityContender[], board: Card[]) {
  const usedKeys = new Set<string>();
  for (const c of contenders) {
    for (const card of c.holeCards) usedKeys.add(cardKey(card));
  }
  for (const c of board) usedKeys.add(cardKey(c));
  return { unseenDeck: FULL_DECK.filter((c) => !usedKeys.has(cardKey(c))), cardsToDeal: 5 - board.length };
}

/**
 * Un calcul Monte-Carlo en cours, que l'on peut faire avancer par tranches.
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ `advance` s'arrête TOUJOURS sur une frontière de mélange, jamais au milieu. Ce n'est pas un
 * détail d'implémentation : l'estimateur tire plusieurs boards DISJOINTS par mélange complet, et
 * c'est précisément ce qui divise sa variance par deux (cf. le commentaire de `unMelange`). Couper
 * au milieu d'un mélange casserait cette propriété SANS QUE RIEN NE LE SIGNALE — le pourcentage
 * resterait "juste" en moyenne, simplement deux fois plus dispersé, donc invérifiable à l'œil.
 * En coupant aux bonnes frontières, la suite des tirages est rigoureusement la même qu'en un seul
 * bloc : le résultat est identique bit à bit, ce qui rend l'équivalence PROUVABLE par test
 * différentiel (`scripts/test-equity-tranches.js`).
 */
interface EquityRun {
  /** Avance tant que `budgetMs` n'est pas épuisé (au moins un mélange). Rend `true` si c'est fini. */
  advance(budgetMs: number): boolean;
  /** Équités finales (0-100), mises en cache au passage. À n'appeler qu'après un `advance` vrai. */
  result(): Record<string, number>;
}

function creerRun(
  key: string,
  contenders: EquityContender[],
  board: Card[],
  variant: Variant,
  unseenDeck: Card[],
  cardsToDeal: number
): EquityRun {
  const totals: Record<string, number> = {};
  for (const c of contenders) totals[c.seatId] = 0;

  const random = mulberry32(hashSeed(key));
  const deck = [...unseenDeck];
  const n = deck.length;
  const boardsParMelange = Math.floor(n / cardsToDeal);
  let tires = 0;

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
  const unMelange = () => {
    for (let i = 0; i < n - 1; i++) {
      const j = i + Math.floor(random() * (n - i));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (let b = 0; b < boardsParMelange && tires < MONTE_CARLO_SAMPLES; b++) {
      const winners = bestHandWinners(contenders, [...board, ...deck.slice(b * cardsToDeal, (b + 1) * cardsToDeal)], variant);
      const share = 1 / winners.length;
      for (const w of winners) totals[w] += share;
      tires++;
    }
  };

  return {
    advance(budgetMs: number) {
      const debut = Date.now();
      do {
        if (tires >= MONTE_CARLO_SAMPLES) return true;
        unMelange();
      } while (Date.now() - debut < budgetMs);
      return tires >= MONTE_CARLO_SAMPLES;
    },
    result() {
      const equities: Record<string, number> = {};
      for (const c of contenders) equities[c.seatId] = (totals[c.seatId] / tires) * 100;
      return memoriser(key, equities);
    },
  };
}

function enumererExact(
  key: string,
  contenders: EquityContender[],
  board: Card[],
  variant: Variant,
  unseenDeck: Card[],
  cardsToDeal: number
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const c of contenders) totals[c.seatId] = 0;
  let simCount = 0;
  for (const combo of combinations(unseenDeck, cardsToDeal)) {
    const winners = bestHandWinners(contenders, [...board, ...combo], variant);
    const share = 1 / winners.length;
    for (const w of winners) totals[w] += share;
    simCount++;
  }
  const equities: Record<string, number> = {};
  for (const c of contenders) equities[c.seatId] = (totals[c.seatId] / simCount) * 100;
  return memoriser(key, equities);
}

/**
 * Équité de chaque contendant : part moyenne du pot remportée sur l'ensemble des run-outs
 * possibles, étant donné leurs cartes connues et le board actuel (0 à 100). Un split exact entre
 * plusieurs gagnants sur un run-out donné partage la part également entre eux pour ce tirage.
 *
 * ⚠️ Version SYNCHRONE, donc bloquante : au préflop elle gèle le fil JS le temps du Monte-Carlo
 * (168 ms mesurées sur un Mac, trois à six fois plus sur un iPhone). L'app ne doit plus l'appeler
 * sur ce chemin — cf. `equityIfImmediate` + `runEquityInSlices`. Reste l'entrée des scripts de
 * test, qui n'ont pas d'interface à garder réactive.
 */
export function computeEquity(
  contenders: EquityContender[],
  board: Card[],
  variant: Variant = 'nlhe'
): Record<string, number> {
  const key = situationKey(contenders, board, variant);
  const cached = equityCache.get(key);
  if (cached) return { ...cached };

  const { unseenDeck, cardsToDeal } = preparer(contenders, board);
  if (cardsToDeal <= 2) return enumererExact(key, contenders, board, variant, unseenDeck, cardsToDeal);

  const run = creerRun(key, contenders, board, variant, unseenDeck, cardsToDeal);
  run.advance(Infinity);
  return run.result();
}

/**
 * Équité SI et SEULEMENT SI elle peut être rendue sans bloquer l'interface : déjà en cache, ou
 * calculable par énumération exacte (turn/river connus, au pire ~1000 combinaisons, 1 à 22 ms
 * mesurées). Rend `null` pour le préflop hors cache — c'est le seul cas coûteux, à confier à
 * `runEquityInSlices`.
 *
 * Le fait que ce soit SYNCHRONE est indispensable au replayer : la valeur doit être disponible
 * pendant le rendu, sinon chaque aller-retour dans la main ferait disparaître puis réapparaître
 * les pourcentages déjà calculés.
 */
export function equityIfImmediate(
  contenders: EquityContender[],
  board: Card[],
  variant: Variant = 'nlhe'
): Record<string, number> | null {
  const key = situationKey(contenders, board, variant);
  const cached = equityCache.get(key);
  if (cached) return { ...cached };

  const { unseenDeck, cardsToDeal } = preparer(contenders, board);
  if (cardsToDeal > 2) return null;
  return enumererExact(key, contenders, board, variant, unseenDeck, cardsToDeal);
}

// Durée maximale d'une tranche de calcul. Sous une frame de 60 Hz (16,6 ms), pour qu'une tranche ne
// puisse jamais faire sauter une image. Pas plus bas non plus : chaque tranche se paie un
// `setTimeout` que les navigateurs bornent à ~4 ms, donc trop petit rallongerait la durée totale
// sans rien gagner. Le budget est en TEMPS, pas en nombre de mélanges : un iPhone lent fait
// simplement moins de mélanges par tranche, et le résultat reste identique puisque la coupe tombe
// toujours sur une frontière de mélange.
const TRANCHE_MS = 8;

/**
 * Calcule l'équité par tranches, en rendant la main au navigateur entre chaque — l'app reste
 * réactive pendant le calcul (défilement, boutons, animations). Appelle `onDone` une seule fois,
 * jamais de façon synchrone. Rend une fonction d'annulation : à appeler dès que le résultat n'est
 * plus attendu (l'utilisateur a changé de pas), sans quoi le calcul continuerait pour rien.
 *
 * ⚠️ Pas de Web Worker : ça ne fonctionnerait pas sur le futur build natif.
 */
export function runEquityInSlices(
  contenders: EquityContender[],
  board: Card[],
  variant: Variant,
  onDone: (equities: Record<string, number>) => void
): () => void {
  let annule = false;
  let timer: ReturnType<typeof setTimeout>;

  const key = situationKey(contenders, board, variant);
  const { unseenDeck, cardsToDeal } = preparer(contenders, board);
  const cached = equityCache.get(key);
  const run =
    cached || cardsToDeal <= 2 ? null : creerRun(key, contenders, board, variant, unseenDeck, cardsToDeal);

  const tranche = () => {
    if (annule) return;
    // Rattrapage des deux cas peu coûteux, au cas où l'appelant nous les confierait quand même :
    // ils se règlent en une tranche, mais toujours de façon asynchrone, pour que `onDone` ne
    // parte jamais pendant le rendu de l'appelant.
    if (!run) {
      onDone(cached ? { ...cached } : enumererExact(key, contenders, board, variant, unseenDeck, cardsToDeal));
      return;
    }
    if (run.advance(TRANCHE_MS)) {
      onDone(run.result());
      return;
    }
    timer = setTimeout(tranche, 0);
  };

  timer = setTimeout(tranche, 0);
  return () => {
    annule = true;
    clearTimeout(timer);
  };
}
