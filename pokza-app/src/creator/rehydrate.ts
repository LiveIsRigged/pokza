import type { Action, Board, Card, Position, Post, Seat, Street } from '../types/poker';
import type { AnteType, ContextData, ReviewData, Snapshot } from './types';
import { DEFAULT_CONTEXT } from './types';

/**
 * Tout ce dont `LiveHandCreator` a besoin pour repartir d'une main déjà publiée, dans la forme
 * exacte de ses propres états. C'est l'inverse de `finalize()` : ce que celui-ci assemble en un
 * `Hand`, celui-ci le redémonte en réglages d'étapes.
 */
export interface CreatorSeed {
  context: ContextData;
  seats: Seat[];
  heroCards: (Card | undefined)[];
  actions: Action[];
  activeSeatIds: string[];
  board: Board;
  board2: Board;
  revealedCards: Record<string, (Card | undefined)[]>;
  revealShowdown: boolean;
  review: ReviewData;
}

/**
 * Redémonte une main publiée en réglages de créateur, pour « Corriger la main ».
 *
 * POURQUOI C'EST FIABLE MALGRÉ L'ALLER-RETOUR
 * Les identifiants de sièges sont déterministes (`s-btn`, `s-bb`… cf. `buildSeats`) : reconstruire
 * le contexte redonne les MÊMES sièges, donc les `seatId` des actions restent valides même si
 * l'auteur remonte jusqu'à l'étape 1 et redescend. Rien ne repose sur un identifiant tiré au vol.
 *
 * DEUX AMBIGUÏTÉS QUI NE SE DEVINENT PAS DEPUIS `blinds`, ET QUI SE LISENT DANS LES ACTIONS
 *   • L'ante : `blinds.ante` vaut le même montant qu'il ait été posté par la seule BB ou par tout
 *     le monde. Un seul `post-ante` = « BB ante » ; plusieurs = un ante par joueur. Se tromper
 *     changerait le pot de départ à la republication.
 *   • Le straddle : il ne vit que dans les actions (`post-straddle`), jamais dans `blinds`. Son
 *     nombre et son montant se relèvent donc là, et nulle part ailleurs.
 */
export function postToSeed(post: Post): CreatorSeed {
  const hand = post.hand;
  const hero = hand.seats.find((s) => s.isHero);
  const bombPot = !!hand.bombPot;

  const antes = hand.actions.filter((a) => a.type === 'post-ante');
  const straddles = hand.actions.filter((a) => a.type === 'post-straddle');
  const bbSeatId = hand.seats.find((s) => s.position === 'BB')?.id;

  // Un bomb pot poste un ante par siège, mais son montant vit dans `bombAnte` : lui appliquer en
  // plus la mécanique d'ante classique compterait la bombe deux fois.
  let anteType: AnteType = 'none';
  let ante = 0;
  if (!bombPot && antes.length > 0) {
    anteType = antes.length === 1 && antes[0].seatId === bbSeatId ? 'bb' : 'per-player';
    ante = anteType === 'per-player' ? (antes[0].amount ?? 0) : 0;
  }

  // Les straddles successifs valent 2x, 4x… le premier : c'est donc le PLUS PETIT montant posté
  // qui est le « montant du straddle » au sens de l'étape 1.
  const straddleAmount = straddles.length > 0
    ? Math.min(...straddles.map((a) => a.amount ?? 0))
    : DEFAULT_CONTEXT.straddleAmount;
  const straddleCount = Math.min(straddles.length, 3) as 0 | 1 | 2 | 3;

  const opponentNames: Partial<Record<Position, string>> = {};
  const seatStacks: Partial<Record<Position, number>> = {};
  for (const seat of hand.seats) {
    if (!seat.isHero && seat.playerName) opponentNames[seat.position] = seat.playerName;
    // Seulement les stacks qui s'écartent du stack effectif : les poser tous ferait passer une
    // table homogène pour une table personnalisée à l'étape 1.
    if (seat.startingStack !== hand.effectiveStack) seatStacks[seat.position] = seat.startingStack;
  }

  const context: ContextData = {
    gameType: hand.gameType,
    variant: hand.variant,
    bombPot,
    bombAnte: bombPot ? hand.blinds.bb : DEFAULT_CONTEXT.bombAnte,
    doubleBoard: bombPot && !!hand.board2,
    sb: bombPot ? DEFAULT_CONTEXT.sb : hand.blinds.sb,
    bb: bombPot ? DEFAULT_CONTEXT.bb : hand.blinds.bb,
    effectiveStack: hand.effectiveStack,
    numPlayers: hand.seats.length,
    heroPosition: hero?.position ?? DEFAULT_CONTEXT.heroPosition,
    location: post.location,
    buyIn: post.buyIn,
    level: post.level,
    heroName: hero?.playerName,
    ...(Object.keys(opponentNames).length > 0 ? { opponentNames } : {}),
    ...(Object.keys(seatStacks).length > 0 ? { seatStacks } : {}),
    anteType,
    ante,
    straddleCount,
    straddleAmount,
  };

  // Cartes des adversaires montrées à l'abattage : celles du hero passent par `heroCards`, pas par
  // cette table, sans quoi l'étape d'abattage les proposerait comme « cartes à révéler ».
  const revealedCards: Record<string, (Card | undefined)[]> = {};
  for (const seat of hand.seats) {
    if (!seat.isHero && seat.holeCards && seat.holeCards.length > 0) {
      revealedCards[seat.id] = [...seat.holeCards];
    }
  }

  const foldedSeatIds = new Set(hand.actions.filter((a) => a.type === 'fold').map((a) => a.seatId));

  return {
    context,
    seats: hand.seats,
    heroCards: hero?.holeCards ? [...hero.holeCards] : [],
    actions: hand.actions,
    activeSeatIds: hand.seats.filter((s) => !foldedSeatIds.has(s.id)).map((s) => s.id),
    board: hand.board,
    board2: hand.board2 ?? {},
    revealedCards,
    revealShowdown: !!hand.revealShowdown,
    review: {
      title: post.title,
      description: post.description,
      voteQuestion: post.voteQuestion,
      voteOptions: post.voteOptions,
      visibility: post.visibility,
      groupId: post.groupId,
    },
  };
}

/**
 * Reconstitue la pile de retour arrière d'une main reprise, pour que le bouton « ‹ » du créateur
 * ramène étape par étape au lieu de sortir tout de suite.
 *
 * LA RÈGLE À NE PAS INVERSER : un instantané porte l'état tel qu'il était PENDANT son étape, donc
 * sans ce que cette étape produit. Celui de `street-flop` n'a pas le flop, celui de `street-turn`
 * a le flop mais pas le turn. Poser le board « en avance » afficherait un tapis faux au retour, et
 * pire, laisserait ressaisir une carte déjà distribuée.
 *
 * Les étapes qui n'ont pas eu lieu n'ont pas d'instantané : une main où tout le monde se couche
 * preflop n'a ni flop ni turn, et son « ‹ » doit ramener au preflop, pas à un flop imaginaire.
 */
export function seedHistory(seed: CreatorSeed): Snapshot[] {
  const { context, seats, heroCards, actions, board, board2, revealedCards } = seed;
  const estPost = (a: Action) => a.type.startsWith('post-');
  const posts = actions.filter(estPost);
  const allIds = seats.map((s) => s.id);

  // Les blindes/antes/straddles sont posés en quittant l'étape 1 : ils accompagnent donc TOUTES les
  // streets, y compris celles d'avant leur propre street nominale.
  const jusqua = (streets: Street[]) => actions.filter((a) => estPost(a) || streets.includes(a.street));
  const encoreEnJeu = (list: Action[]) => {
    const couches = new Set(list.filter((a) => a.type === 'fold').map((a) => a.seatId));
    return allIds.filter((id) => !couches.has(id));
  };

  const table = { context, seats, heroCards, board2: {} as Board, revealedCards: {} };
  const snaps: Snapshot[] = [
    // L'étape 1 précède la construction des sièges : elle n'en a aucun, et re-la quitter les
    // reconstruit à l'identique (les identifiants sont déterministes, cf. `buildSeats`).
    { phase: 'context', context, seats: [], heroCards: [], actions: [], activeSeatIds: [],
      board: {}, board2: {}, revealedCards: {} },
    { ...table, phase: 'holeCards', actions: posts, activeSeatIds: allIds, board: {} },
  ];

  if (!context.bombPot) {
    snaps.push({ ...table, phase: 'street-preflop', actions: posts, activeSeatIds: allIds, board: {} });
  }

  const avantFlop = context.bombPot ? posts : jusqua(['preflop']);
  if (board.flop) {
    snaps.push({ ...table, phase: 'street-flop', actions: avantFlop,
                 activeSeatIds: encoreEnJeu(avantFlop), board: {} });
  }

  const avantTurn = jusqua(context.bombPot ? ['flop'] : ['preflop', 'flop']);
  if (board.turn) {
    snaps.push({ ...table, phase: 'street-turn', actions: avantTurn,
                 activeSeatIds: encoreEnJeu(avantTurn),
                 board: { flop: board.flop },
                 board2: board2.flop ? { flop: board2.flop } : {} });
  }

  const avantRiver = jusqua(context.bombPot ? ['flop', 'turn'] : ['preflop', 'flop', 'turn']);
  if (board.river) {
    snaps.push({ ...table, phase: 'street-river', actions: avantRiver,
                 activeSeatIds: encoreEnJeu(avantRiver),
                 board: { flop: board.flop, turn: board.turn },
                 board2: board2.flop ? { flop: board2.flop, turn: board2.turn } : {} });
  }

  // L'abattage n'a eu lieu que s'il restait un adversaire à la fin — même condition que `finishHand`.
  const restants = encoreEnJeu(actions);
  if (seats.some((s) => !s.isHero && restants.includes(s.id))) {
    snaps.push({ context, seats, heroCards, phase: 'showdown', actions, activeSeatIds: restants,
                 board, board2, revealedCards });
  }

  return snaps;
}
