import type { Action, Board, Card, Hand, Position, Seat, Street, Variant } from '../types/poker';
import { formatChipAmount, roundMoney } from '../utils/chipFormat';
import { bestHandWinners } from './handEvaluator';
import { equityIfImmediate, type EquityContender } from './equity';

const STREET_ORDER: Street[] = ['preflop', 'flop', 'turn', 'river'];

/**
 * Un "step" de replay est une action, une révélation de street (le board avance), ou la
 * résolution finale de la main ("showdown"). Les trois sont distingués explicitement pour ne
 * jamais confondre deux moments différents dans le même step — c'était le cas avant pour
 * street/action (la street changeait ET la première action de cette street s'appliquaient d'un
 * coup) et ça l'est resté longtemps pour la toute dernière action/le gagnant (la dernière décision
 * ET "untel gagne, les jetons glissent vers lui" arrivaient ensemble) : chacun de ces changements
 * doit rester un clic à part entière.
 */
export type ReplayEvent =
  | { kind: 'action'; action: Action }
  | { kind: 'reveal'; street: Street }
  | { kind: 'revealCards' }
  | { kind: 'showdown' };

function hasBoardDataFor(hand: Hand, street: Street): boolean {
  if (street === 'flop') return Boolean(hand.board.flop);
  if (street === 'turn') return Boolean(hand.board.turn);
  if (street === 'river') return Boolean(hand.board.river);
  return false; // le préflop n'a jamais besoin d'une révélation (cartes en main connues d'emblée)
}

/**
 * Reconstruit la main comme une suite d'événements plutôt qu'une simple liste d'actions : un
 * changement de street insère un événement "reveal" AVANT la première action de cette street,
 * qu'il s'agisse d'une transition normale (entre deux actions) ou d'un run-out en fin de main
 * (plus aucune action, juste les cartes restantes qui tombent) — les deux cas sont désormais
 * traités de façon uniforme.
 */
export function buildReplayEvents(hand: Hand): ReplayEvent[] {
  if (hand.actions.length === 0) return [];

  const events: ReplayEvent[] = [];
  const revealed = new Set<Street>(['preflop']);

  for (const action of hand.actions) {
    if (!revealed.has(action.street) && hasBoardDataFor(hand, action.street)) {
      events.push({ kind: 'reveal', street: action.street });
      revealed.add(action.street);
    }
    events.push({ kind: 'action', action });
  }

  const lastStreet = hand.actions[hand.actions.length - 1].street;
  for (let i = STREET_ORDER.indexOf(lastStreet) + 1; i < STREET_ORDER.length; i++) {
    const street = STREET_ORDER[i];
    if (!revealed.has(street) && hasBoardDataFor(hand, street)) {
      events.push({ kind: 'reveal', street });
      revealed.add(street);
    }
  }

  // Si le créateur a choisi de cacher des mains connues jusqu'au showdown (`revealShowdown`), leur
  // retournement (dos → face) est lui-même un step à part, AVANT "untel gagne" — sinon les cartes
  // se dévoilent et le pot part vers le vainqueur dans le même clic, alors que ce sont deux
  // moments distincts (d'abord on voit les mains, ensuite on voit qui gagne).
  const hasHiddenReveal = Boolean(hand.revealShowdown) && hand.seats.some((s) => !s.isHero && s.holeCards);
  if (hasHiddenReveal) {
    events.push({ kind: 'revealCards' });
  }

  // Dernier event, toujours : "untel gagne" (ou split) et le glissement des jetons vers le(s)
  // vainqueur(s) n'apparaissent qu'ici, jamais au même step que la dernière action/révélation qui
  // précède — cf. `computeHandState`, qui ne détermine le(s) gagnant(s) qu'à ce step précis.
  events.push({ kind: 'showdown' });

  return events;
}

/** Nombre total de steps pour rejouer une main (actions + révélations de street, cf. `buildReplayEvents`). */
export function totalReplaySteps(hand: Hand): number {
  return buildReplayEvents(hand).length;
}

/**
 * Poster la SB/BB, les antes (dont la "bombe" d'un bomb pot) et un éventuel straddle n'est pas une
 * décision du joueur : on démarre le replay juste après ces mises forcées, pour ne pas faire cliquer
 * sur ces steps mécaniques à chaque main — d'autant plus pertinent en bomb pot, où chaque joueur
 * poste un ante (jusqu'à 9 clics mécaniques sinon). Les mises apparaissent déjà postées dès la
 * première frame (cf. `computeHandState`, qui inclut toujours tous les events jusqu'à `step` exclu,
 * skippés ou non).
 */
const MECHANICAL_POSTS = new Set(['post-sb', 'post-bb', 'post-ante', 'post-straddle']);
export function initialReplayStep(hand: Hand): number {
  const events = buildReplayEvents(hand);
  let i = 0;
  while (i < events.length) {
    const ev = events[i];
    const type = ev.kind === 'action' ? ev.action.type : null;
    if (type && MECHANICAL_POSTS.has(type)) {
      i++;
    } else {
      break;
    }
  }
  return i;
}

/**
 * Index des events de fold « sans enjeu », à jouer plus vite en lecture automatique.
 *
 * Un fold préflop d'un siège qui n'a pas mis UN SEUL jeton volontairement ne raconte rien : le pot
 * ne bouge pas, personne n'a pris de décision devant quoi que ce soit, seul le nombre de joueurs
 * encore en vie change. Sur une table à 9, ces folds-là occupaient à eux seuls les premières
 * secondes de chaque main. Les durées, elles, vivent dans `HandReplayer` : ici on ne décide que du
 * CRITÈRE, qui est une question de poker.
 *
 * Deux garde-fous, tranchés avec Victor le 23/08 :
 *
 * 1. **Les mises forcées ne comptent pas comme un jeton mis** — blindes, antes et straddle. Le
 *    straddle est volontaire dans son geste mais forcé dans sa nature : celui qui straddle puis se
 *    couche n'a pas plus décidé que la BB qui passe. C'est exactement `MECHANICAL_POSTS`, le même
 *    ensemble qui fait démarrer le replay après ces postages. Sans cette exclusion, une main avec
 *    antes n'aurait plus AUCUN fold accéléré : tout le monde aurait « mis un jeton ».
 * 2. **Le fold qui termine la main n'est jamais accéléré.** Quand tout le monde passe sur une
 *    relance, le dernier fold est la conclusion de la main, pas du remplissage — l'expédier ferait
 *    s'arrêter le replayer sur une fin sèche, sans qu'on ait vu que c'était fini.
 */
export function expeditedFoldEventIndices(hand: Hand): Set<number> {
  const events = buildReplayEvents(hand);
  const expedited = new Set<number>();

  let lastActionIndex = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i].kind === 'action') lastActionIndex = i;
  }

  // Se remplit AU FIL des events : au moment où on examine un fold, cet ensemble décrit donc bien
  // ce que le siège avait mis AVANT de se coucher.
  const hasInvested = new Set<string>();
  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind !== 'action') continue;
    const { action } = ev;

    if (
      action.type === 'fold' &&
      action.street === 'preflop' &&
      !hasInvested.has(action.seatId) &&
      i !== lastActionIndex
    ) {
      expedited.add(i);
    }

    // Reste donc : call, bet, raise. Un check n'ajoute rien au pot (la BB qui checke préflop
    // n'a toujours rien misé volontairement), un fold non plus.
    if (!MECHANICAL_POSTS.has(action.type) && action.type !== 'fold' && action.type !== 'check') {
      hasInvested.add(action.seatId);
    }
  }

  return expedited;
}

/**
 * Total misé par chaque siège sur l'ensemble des actions fournies.
 * `amount` est cumulé par street pour les actions de mise (check/call/bet/raise/blindes) : on garde
 * donc la dernière valeur de chaque street. L'ante est une mise forcée indépendante (elle ne compte
 * pas dans ce qu'il faut suivre) : ses montants s'additionnent plutôt que de s'écraser, pour le cas
 * où un même siège poste à la fois une blinde et un ante sur la même street (ex: BB ante).
 */
export function committedBySeat(actions: Action[]): Record<string, number> {
  const perStreet: Record<string, Partial<Record<Street, number>>> = {};
  const antePerStreet: Record<string, Partial<Record<Street, number>>> = {};
  for (const a of actions) {
    if (a.amount == null) continue;
    if (a.type === 'post-ante') {
      antePerStreet[a.seatId] = antePerStreet[a.seatId] ?? {};
      antePerStreet[a.seatId]![a.street] = (antePerStreet[a.seatId]![a.street] ?? 0) + a.amount;
    } else {
      perStreet[a.seatId] = perStreet[a.seatId] ?? {};
      perStreet[a.seatId]![a.street] = a.amount;
    }
  }
  const seatIds = new Set([...Object.keys(perStreet), ...Object.keys(antePerStreet)]);
  const totals: Record<string, number> = {};
  for (const seatId of seatIds) {
    totals[seatId] = STREET_ORDER.reduce(
      (sum, st) => sum + (perStreet[seatId]?.[st] ?? 0) + (antePerStreet[seatId]?.[st] ?? 0),
      0
    );
  }
  return totals;
}

/** Tout ce dont un calcul d'équité a besoin — de quoi le lancer ailleurs que pendant le rendu. */
export interface EquitySituation {
  contenders: EquityContender[];
  board: Card[];
  variant: Variant;
}

export interface HandState {
  step: number;
  totalSteps: number;
  /** Street actuellement affichée — avance à chaque événement traité (reveal OU action), qu'il
   * s'agisse d'une transition normale ou d'un run-out. Pilote à la fois le libellé (PRÉFLOP/FLOP/
   * TURN/RIVER) et les mises "en cours" (`streetContribution`) : les deux avancent ensemble
   * puisque c'est la même street, contrairement à l'ancien système à deux valeurs séparées. */
  currentStreet: Street;
  /** IDs des sièges couchés au moment de ce step */
  foldedSeatIds: Set<string>;
  /** Stack restant par siège après les mises effectuées jusqu'à ce step */
  stacks: Record<string, number>;
  /** Mise en cours affichée devant chaque siège sur la street courante */
  streetContribution: Record<string, number>;
  /** Total du pot (toutes streets confondues) */
  potTotal: number;
  /** IDs des sièges à tapis (stack à 0, pas couchés) à ce step — persiste jusqu'à la fin de la main */
  allInSeatIds: Set<string>;
  /** Cartes du board visibles à ce step */
  board: Card[];
  /** Cartes du SECOND board visibles à ce step (double board bomb pot) — tableau vide si la main n'a
   * qu'un board. Se révèle en même temps que `board` (même event `reveal`). */
  board2: Card[];
  /** Dernière ACTION jouée (pour les mises/le halo "à toi de jouer"), même si le step courant est
   * lui-même un événement "reveal" — contrairement à `lastEvent`, ne recule jamais. */
  lastAction: Action | null;
  /** Événement exactement à ce step (action OU reveal) — sert au libellé central : une révélation
   * affiche "Le flop tombe" etc., une action la description habituelle. `null` avant le tout début. */
  lastEvent: ReplayEvent | null;
  /** ID(s) du/des siège(s) gagnant(s) (fold ou showdown résolu — plusieurs en cas de split pot),
   * tableau vide si main non terminée ou cartes inconnues */
  winningSeatIds: string[];
  /** Répartition détaillée du pot par siège (fractions) — utile au double board où les parts ne sont
   * pas égales. Vide tant que la main n'est pas résolue. Cohérent avec `winningSeatIds` (mêmes sièges). */
  potAwards: PotAward[];
  /** % d'équité par siège (tapis avant la river) : plus aucune action possible, board incomplet,
   * 2+ joueurs encore en lice avec cartes connues. `null` sinon (pas de situation figée, cartes
   * d'un contendant inconnues, ou calcul encore à faire — cf. `equityPending`). */
  equities: Record<string, number> | null;
  /** Situation d'équité qu'il reste à CALCULER, quand `equities` est `null` faute d'un résultat
   * déjà disponible. Non nul uniquement pour le préflop hors cache, le seul cas assez coûteux pour
   * devoir sortir du rendu. Sert à deux choses dans `HandReplayer` : lancer le calcul par tranches,
   * et distinguer "équité en cours" de "pas d'équité du tout" à l'affichage. */
  equityPending: EquitySituation | null;
  /** Vrai à partir de l'event `revealCards` (s'il existe, cf. `buildReplayEvents`) ou, à défaut,
   * de l'event `showdown` — les mains adverses cachées jusqu'au showdown (`hand.revealShowdown`)
   * se retournent face visible à ce step précis, un cran AVANT que le gagnant ne soit désigné. */
  cardsRevealed: boolean;
}

export function computeHandState(hand: Hand, step: number): HandState {
  const events = buildReplayEvents(hand);
  const eventsSoFar = events.slice(0, step);
  const lastEvent = eventsSoFar[eventsSoFar.length - 1] ?? null;

  const actionsSoFar: Action[] = [];
  for (const ev of eventsSoFar) {
    if (ev.kind === 'action') actionsSoFar.push(ev.action);
  }
  const lastAction = actionsSoFar[actionsSoFar.length - 1] ?? null;

  // Avance à chaque event (reveal OU action), pas seulement à la dernière action — cf. le
  // commentaire sur `currentStreet` dans `HandState`. Les events terminaux ("revealCards",
  // "showdown") ne changent pas de street : la main reste sur la dernière street jouée pendant
  // qu'on révèle les mains puis le gagnant.
  let currentStreet: Street = 'preflop';
  for (const ev of eventsSoFar) {
    if (ev.kind === 'reveal') currentStreet = ev.street;
    else if (ev.kind === 'action') currentStreet = ev.action.street;
  }

  const cardsRevealed = eventsSoFar.some((ev) => ev.kind === 'revealCards' || ev.kind === 'showdown');

  const foldedSeatIds = new Set<string>();
  const contributions: Record<string, Partial<Record<Street, number>>> = {};
  const anteContributions: Record<string, Partial<Record<Street, number>>> = {};

  for (const act of actionsSoFar) {
    if (act.type === 'fold') {
      foldedSeatIds.add(act.seatId);
      continue;
    }
    if (act.amount == null) continue;
    if (act.type === 'post-ante') {
      anteContributions[act.seatId] = anteContributions[act.seatId] ?? {};
      anteContributions[act.seatId]![act.street] = (anteContributions[act.seatId]![act.street] ?? 0) + act.amount;
    } else {
      contributions[act.seatId] = contributions[act.seatId] ?? {};
      contributions[act.seatId]![act.street] = act.amount;
    }
  }

  const contributionFor = (seatId: string, street: Street) =>
    (contributions[seatId]?.[street] ?? 0) + (anteContributions[seatId]?.[street] ?? 0);

  let potTotal = 0;
  const stacks: Record<string, number> = {};
  for (const seat of hand.seats) {
    let totalContributed = 0;
    for (const street of STREET_ORDER) {
      const v = contributionFor(seat.id, street);
      if (v) {
        totalContributed += v;
        potTotal += v;
      }
    }
    // `roundMoney` : sans effet sur des jetons de tournoi (déjà entiers), corrige les imprécisions
    // flottantes d'une somme de montants réels fractionnaires (cash game, ex: blindes 0.2/0.4).
    stacks[seat.id] = roundMoney(seat.startingStack - totalContributed);
  }
  potTotal = roundMoney(potTotal);

  // Un siège à 0 (et toujours dans le coup) est à tapis. Basé sur le stack cumulé plutôt que sur
  // un type d'action dédié (le modèle n'en a pas) : couvre aussi bien un bet/call/raise qui vide
  // le stack qu'une blinde/ante postée avec un stack déjà très court.
  const allInSeatIds = new Set<string>();
  for (const seat of hand.seats) {
    if (!foldedSeatIds.has(seat.id) && stacks[seat.id] <= 0) {
      allInSeatIds.add(seat.id);
    }
  }

  // La bulle de mise devant le siège ne montre que la blinde/mise/relance en cours, pas l'ante :
  // l'ante part directement au pot (dead money), il ne reste pas "devant" le joueur.
  //
  // EXCEPTION bomb pot : l'ante EST la bombe, on le montre devant chaque joueur sur le premier
  // segment (street preflop) pour que le bomb pot se lise d'un coup d'œil ; il glissera au pot quand
  // le flop tombera (comme une blinde ordinaire, cf. l'animation de fin de street dans SeatView).
  const streetContribution: Record<string, number> = {};
  for (const seat of hand.seats) {
    const bet = contributions[seat.id]?.[currentStreet] ?? 0;
    const bombAnte = hand.bombPot ? anteContributions[seat.id]?.[currentStreet] ?? 0 : 0;
    const v = bet + bombAnte;
    if (v) streetContribution[seat.id] = v;
  }

  // Board(s) : concaténation des cartes de chaque event "reveal" traité jusqu'ici, dans l'ordre —
  // couvre uniformément les révélations normales ET le run-out de fin de main (même type d'event).
  // Le second board (double board bomb pot) se révèle en même temps, cran par cran.
  const board: Card[] = [];
  const board2: Card[] = [];
  const pushStreet = (dest: Card[], b: Board | undefined, street: Street) => {
    if (!b) return;
    if (street === 'flop' && b.flop) dest.push(...b.flop);
    if (street === 'turn' && b.turn) dest.push(b.turn);
    if (street === 'river' && b.river) dest.push(b.river);
  };
  for (const ev of eventsSoFar) {
    if (ev.kind !== 'reveal') continue;
    pushStreet(board, hand.board, ev.street);
    pushStreet(board2, hand.board2, ev.street);
  }

  const totalSteps = totalReplaySteps(hand);

  // Au dernier step, déterminer le(s) gagnant(s) et la répartition du pot.
  let winningSeatIds: string[] = [];
  let potAwards: PotAward[] = [];
  if (step >= totalSteps) {
    potAwards = determinePotAwards(hand);
    winningSeatIds = potAwards.map((a) => a.seatId);
  }

  // Équité "tapis avant la river" : plus aucune action possible (toutes les vraies actions sont
  // jouées, on n'est plus qu'en train de révéler les cartes du run-out), board pas encore complet,
  // et au moins 2 joueurs encore en lice avec des cartes connues. Sans quoi impossible/inutile à
  // calculer (une seule main = déjà gagnante ; cartes inconnues = pas d'équité calculable).
  // Double board : l'équité par board n'est pas encore calculée — on la masque plutôt que d'afficher
  // un chiffre faux (cf. phase 2, à compléter).
  //
  // Ce qui est disponible SANS BLOQUER (déjà en cache, ou énumération exacte à partir du turn) est
  // rempli ici même. Le préflop hors cache, lui, coûte 168 ms de fil JS gelé sur un Mac et jusqu'à
  // 0,8 s sur un iPhone : le calculer ici — pendant le rendu — rendait l'app inerte le temps qu'il
  // dure. On ne rend donc que la SITUATION à calculer, que `HandReplayer` fait avancer par tranches
  // hors du chemin de rendu (cf. `runEquityInSlices`).
  let equities: Record<string, number> | null = null;
  let equityPending: EquitySituation | null = null;
  if (!hand.board2 && winningSeatIds.length === 0 && board.length < 5 && step >= hand.actions.length) {
    const contenders = hand.seats.filter((s) => !foldedSeatIds.has(s.id));
    if (contenders.length >= 2 && contenders.every((s) => s.holeCards)) {
      const situation: EquitySituation = {
        contenders: contenders.map((s) => ({ seatId: s.id, holeCards: s.holeCards! })),
        board,
        variant: hand.variant,
      };
      equities = equityIfImmediate(situation.contenders, situation.board, situation.variant);
      if (!equities) equityPending = situation;
    }
  }

  return {
    step,
    totalSteps,
    currentStreet,
    foldedSeatIds,
    stacks,
    allInSeatIds,
    streetContribution,
    potTotal,
    board,
    board2,
    lastAction,
    lastEvent,
    winningSeatIds,
    potAwards,
    equities,
    equityPending,
    cardsRevealed,
  };
}

const STRADDLE_RANK_LABELS = ['Straddle', 'Double straddle', 'Triple straddle'];

/** "Straddle" / "Double straddle" / "Triple straddle" selon le rang (0/1/2) du straddleur parmi
 * les straddles consécutifs de la main. */
function straddleRankLabel(rank: number): string {
  return STRADDLE_RANK_LABELS[rank] ?? 'Straddle';
}

// UTG/UTG1/UTG2 sont des noms "early position" relatifs au PREMIER PARLEUR (pas au bouton) : une
// fois qu'un straddle absorbe les premiers rangs, ces noms se décalent pour repartir de UTG (ex :
// UTG1 devient UTG s'il n'y a qu'un simple straddle). LJ/HJ/CO/BTN/SB/BB sont relatifs au bouton et
// ne bougent eux jamais, quel que soit le straddle.
const UTG_FAMILY: Position[] = ['UTG', 'UTG1', 'UTG2', 'UTG3'];

/**
 * Libellé de position pour le rang `rank` (0 = premier parleur naturel, avant tout straddle) d'une
 * table dont l'ordre d'action préflop est `orderedPositions`, compte tenu de `straddleCount`
 * straddles consécutifs :
 * - les `straddleCount` premiers rangs deviennent "Straddle"/"Double straddle"/"Triple straddle"
 *   (ils postent une mise forcée, ils NE parlent PLUS en premier) ;
 * - les rangs UTG/UTG1/UTG2 restants reprennent un nom en repartant de UTG ;
 * - les autres (LJ/HJ/CO/BTN/SB/BB) gardent leur nom d'origine.
 * Partagé entre `straddleSeatLabel` ci-dessous (une fois les actions connues, cf. replayer/
 * `StreetStep`/`ShowdownStep`) et `ContextStep.tsx` (qui doit afficher le même résultat AVANT que
 * les actions n'existent, à partir du seul rang dans l'ordre d'action préflop).
 */
export function straddleAwarePositionLabel(
  orderedPositions: Position[],
  rank: number,
  straddleCount: number
): string {
  if (straddleCount > 0 && rank < straddleCount) return straddleRankLabel(rank);
  const utgFamilyCount = orderedPositions.filter((p) => UTG_FAMILY.includes(p)).length;
  if (straddleCount > 0 && rank < utgFamilyCount) return UTG_FAMILY[rank - straddleCount];
  return orderedPositions[rank];
}

/** Libellé de position pour ce siège une fois le straddle pris en compte (cf.
 * `straddleAwarePositionLabel`) — `null` seulement si le siège est introuvable dans `seats`, qui
 * DOIT être la liste COMPLÈTE des sièges dans l'ordre d'action préflop (celui de `buildSeats`/
 * `hand.seats`), jamais un sous-ensemble filtré (le rang calculé serait sinon faux). Remplace
 * l'acronyme de position brut (UTG, HJ...) partout où le siège est affiché SANS nom de joueur
 * personnalisé (cf. `seatLabel` ci-dessous, et son équivalent côté créateur dans
 * `StreetStep.tsx`/`ShowdownStep.tsx`). */
export function straddleSeatLabel(seats: Seat[], actions: Action[], seatId: string): string | null {
  const rank = seats.findIndex((s) => s.id === seatId);
  if (rank === -1) return null;
  const straddleCount = actions.filter((a) => a.type === 'post-straddle').length;
  return straddleAwarePositionLabel(
    seats.map((s) => s.position),
    rank,
    straddleCount
  );
}

function seatLabel(hand: Hand, seatId: string): string {
  const seat = hand.seats.find((s) => s.id === seatId);
  return seat?.playerName ?? straddleSeatLabel(hand.seats, hand.actions, seatId) ?? seat?.position ?? '';
}

/** Part du pot attribuée à un siège, en FRACTION du pot total (0..1). En simple board, un gagnant
 * unique a 1, un split à N a 1/N. En double board, chaque board vaut 0,5 : un siège qui gagne un
 * seul board a 0,5 (0,25 s'il le partage), un scoop des deux a 1. */
export interface PotAward {
  seatId: string;
  fraction: number;
}

/** 5 cartes complètes d'un board, ou `null` s'il est incomplet (ne devrait pas arriver au showdown). */
function completeBoard(board: Board | undefined): Card[] | null {
  if (!board?.flop || !board.turn || !board.river) return null;
  return [...board.flop, board.turn, board.river];
}

/**
 * Répartit le pot entre les sièges (cf. `PotAward`). Gère à la fois le simple board et le double
 * board d'un bomb pot (`hand.board2`) : chaque board distribue sa moitié (ou la totalité s'il est
 * seul) au(x) meilleur(s) sa main, cumulées par siège — un scoop des deux boards récupère donc tout.
 *
 * Cas 1 : un seul joueur n'a pas foldé → il rafle tout, sans besoin de connaître les cartes.
 * Cas 2 : abattage → sur CHAQUE board complet, on compare la meilleure main de 5 cartes selon la
 * variante (Hold'em : 5 libres ; Omaha : 2 en main + 3 du board), à la manière de `bestHandWinners`.
 * Un joueur non couché mais dont les cartes n'ont pas été saisies est traité comme mucked (exclu),
 * pas comme rendant la main indéterminable. Renvoie un tableau vide si rien n'est déterminable.
 */
export function determinePotAwards(hand: Hand): PotAward[] {
  const foldedSeatIds = new Set<string>();
  for (const action of hand.actions) {
    if (action.type === 'fold') foldedSeatIds.add(action.seatId);
  }

  const notFoldedSeats = hand.seats.filter((s) => !foldedSeatIds.has(s.id));
  if (notFoldedSeats.length === 1) {
    return [{ seatId: notFoldedSeats[0].id, fraction: 1 }];
  }

  const contenders = notFoldedSeats.filter((s) => s.holeCards);
  if (contenders.length === 0) return [];

  // Un seul board en temps normal ; deux en double board (chacun pèse alors la moitié du pot).
  const boards = [hand.board, ...(hand.board2 ? [hand.board2] : [])]
    .map(completeBoard)
    .filter((b): b is Card[] => b !== null);
  if (boards.length === 0) return [];
  const sharePerBoard = 1 / boards.length;

  // ─── POTS SECONDAIRES ────────────────────────────────────────────────────────────────────────
  // Ce bloc répartissait auparavant des fractions du pot TOTAL, sans jamais regarder qui avait mis
  // quoi. Un tapis court qui gagnait l'abattage raflait donc la totalité : mesuré, un joueur à
  // tapis pour 100 remportait un pot de 900 construit par des relances qu'il n'avait pas suivies.
  //
  // La règle : on ne peut gagner que ce qu'on a soi-même couvert. On découpe donc le pot en
  // tranches, une par niveau d'engagement. Chaque tranche est alimentée par TOUS ceux qui ont
  // atteint ce niveau (les couchés y compris — leur argent reste au pot), mais n'est disputée que
  // par ceux qui sont encore en lice.
  const committed = committedBySeat(hand.actions);
  const total = Object.values(committed).reduce((sum, v) => sum + v, 0);
  if (total <= 0) return [];

  const niveaux = [...new Set(Object.values(committed).filter((v) => v > 0))].sort((a, b) => a - b);

  const gains = new Map<string, number>();
  let plancher = 0;
  let orphelin = 0;
  let derniersGagnants: string[] = [];

  for (const niveau of niveaux) {
    const epaisseur = niveau - plancher;
    plancher = niveau;
    if (epaisseur <= 0) continue;

    const alimentent = Object.values(committed).filter((v) => v >= niveau).length;
    const montant = epaisseur * alimentent;

    // Un joueur ne peut prétendre à une tranche que s'il l'a couverte.
    const eligibles = contenders.filter((s) => (committed[s.id] ?? 0) >= niveau);
    if (eligibles.length === 0) {
      orphelin += montant;
      continue;
    }

    const aRepartir = montant + orphelin;
    orphelin = 0;
    const gagnantsDeLaTranche = new Set<string>();
    for (const board of boards) {
      const winners =
        eligibles.length === 1
          ? [eligibles[0].id]
          : bestHandWinners(
              eligibles.map((s) => ({ seatId: s.id, holeCards: s.holeCards! })),
              board,
              hand.variant
            );
      const part = (aRepartir * sharePerBoard) / winners.length;
      for (const id of winners) {
        gains.set(id, (gains.get(id) ?? 0) + part);
        gagnantsDeLaTranche.add(id);
      }
    }
    derniersGagnants = [...gagnantsDeLaTranche];
  }

  // La tranche du dessus n'a souvent qu'un seul alimentateur : c'est la mise que personne n'a
  // suivie, et la boucle la lui rend d'elle-même (il est seul éligible). Le cas « personne
  // d'éligible » ne survient que sur une main incomplète — cartes non saisies pour tout le monde à
  // ce niveau. Plutôt que de faire disparaître ces jetons de l'affichage, on les verse aux derniers
  // gagnants connus : les fractions continuent ainsi de totaliser 1.
  if (orphelin > 0 && derniersGagnants.length > 0) {
    const part = orphelin / derniersGagnants.length;
    for (const id of derniersGagnants) gains.set(id, (gains.get(id) ?? 0) + part);
  }

  if (gains.size === 0) return [];
  return [...gains.entries()].map(([seatId, montant]) => ({ seatId, fraction: montant / total }));
}

/** ID des sièges gagnants (au moins une part du pot). Enveloppe `determinePotAwards` pour les
 * usages qui n'ont besoin que du surlignage (pas des montants). */
export function determineWinner(hand: Hand): string[] {
  return determinePotAwards(hand).map((a) => a.seatId);
}

/**
 * `isAllIn` : ajoute le suffixe "— ALL-IN" quand cette action précise vide le stack du joueur.
 * `useBB` : affiche le montant en grosses blindes plutôt qu'en jetons bruts (préférence globale
 * au feed, cf. `useDisplayUnit`).
 */
export function describeAction(hand: Hand, action: Action, isAllIn = false, useBB = false): string {
  const who = seatLabel(hand, action.seatId);
  const amount =
    action.amount != null
      ? formatChipAmount(action.amount, hand.gameType, { bb: hand.blinds.bb, useBB })
      : undefined;
  let base: string;
  switch (action.type) {
    case 'post-sb':
      base = `${who} poste la petite blinde (${amount})`;
      break;
    case 'post-bb':
      base = `${who} poste la grosse blinde (${amount})`;
      break;
    case 'post-ante':
      base = `${who} poste l'ante (${amount})`;
      break;
    case 'post-straddle': {
      const seat = hand.seats.find((s) => s.id === action.seatId);
      const label = straddleSeatLabel(hand.seats, hand.actions, action.seatId)!.toLowerCase();
      // Sans nom de joueur personnalisé, `who` EST déjà ce label ("Straddle"/"Double straddle"/...,
      // cf. `seatLabel`) : le répéter donnerait "Straddle straddle (10€)".
      base = seat?.playerName ? `${who} ${label} (${amount})` : `${who} poste (${amount})`;
      break;
    }
    case 'fold':
      base = `${who} se couche`;
      break;
    case 'check':
      base = `${who} check`;
      break;
    case 'call':
      base = `${who} suit (${amount})`;
      break;
    case 'bet':
      base = `${who} mise ${amount}`;
      break;
    case 'raise':
      base = `${who} relance à ${amount}`;
      break;
    default:
      base = who;
  }
  return isAllIn ? `${base} — ALL-IN` : base;
}
