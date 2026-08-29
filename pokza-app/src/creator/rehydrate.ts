import type { Action, Board, Card, Position, Post, Seat, Street } from '../types/poker';
import type { AnteType, ContextData, Phase, ReviewData, Snapshot } from './types';
import { DEFAULT_CONTEXT } from './types';
import { chainStraddleCount } from '../engine/handEngine';
import { devise } from '../utils/currency';

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
 *     nombre et son montant se relèvent donc là, et nulle part ailleurs. Et depuis le BTN straddle,
 *     il faut en plus dire lequel des straddles est celui du bouton — ce que la POSITION du siège
 *     dans l'ordre d'action suffit à trancher.
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

  // Séparer la CHAÎNE du straddle du bouton, sans quoi une main « UTG 8 + BTN 16 » se relirait
  // comme un double straddle à 8 posté par l'UTG et son voisin : mauvais sièges, mauvais montants.
  // La chaîne est le préfixe de l'ordre d'action préflop qui a straddlé (cf. `chainStraddleCount`),
  // et le straddle du bouton est le seul à en sortir — le formulaire garantit qu'un siège au moins
  // les sépare (cf. `boutonPossible`), c'est ce qui rend cette lecture possible.
  const chaine = chainStraddleCount(hand.seats, hand.actions);
  const rangDe = (a: Action) => hand.seats.findIndex((s) => s.id === a.seatId);
  const straddlesChaine = straddles.filter((a) => rangDe(a) < chaine);
  const straddleDuBouton = straddles.find((a) => rangDe(a) >= chaine);

  // Chaque straddle de la chaîne porte son propre montant depuis qu'ils sont modifiables un par un :
  // on les relit tels quels, dans l'ordre de postage, plutôt que d'en redéduire un montant de base.
  const straddleAmounts = [...straddlesChaine]
    .sort((a, b) => a.order - b.order)
    .map((a) => a.amount ?? 0);
  // `straddleCount` compte TOUS les straddles de la main, celui du bouton compris : c'est le sens
  // de la chip « Simple / Double / Triple », et il est inchangé pour les mains d'avant le BTN
  // straddle, qui n'ont jamais que leur chaîne.
  const straddleCount = Math.min(straddles.length, 3) as 0 | 1 | 2 | 3;
  const straddleBouton = Boolean(straddleDuBouton);
  const straddleBoutonMontant = straddleDuBouton?.amount ?? DEFAULT_CONTEXT.straddleBoutonMontant;

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
    // Une main d'avant le sélecteur n'a pas de devise : elle se relit en euro, comme elle
    // s'affiche (cf. `devise`). C'est le troisième et dernier endroit qui garantit qu'aucune main
    // ne peut se retrouver sans devise.
    currency: devise(hand.currency).code,
    straddleCount,
    straddleAmounts,
    straddleBouton,
    straddleBoutonMontant,
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

/**
 * Libellé de chaque étape reprenable, tel qu'il s'affiche dans la feuille « Corriger la main ».
 *
 * Ces libellés nomment CE QU'ON VIENT CHANGER, pas le numéro de l'étape du créateur : un testeur
 * qui cherchait à cacher la main de son adversaire jusqu'à l'abattage n'a pas trouvé où le faire,
 * parce qu'il aurait fallu deviner que ce réglage vit dans l'étape « abattage ». D'où « Les cartes
 * de vilain » plutôt que « Abattage », et « La table » plutôt que « Contexte ».
 *
 * Les quatre streets reprennent mot pour mot les titres du créateur (`STREET_TITLES` dans
 * `StreetStep`) — « River » et non « Rivière », qui était le seul écart entre les deux écrans.
 */
const LIBELLE_ETAPE: Partial<Record<Phase, string>> = {
  context: 'La table',
  holeCards: 'Tes cartes',
  'street-preflop': 'Préflop',
  'street-flop': 'Flop',
  'street-turn': 'Turn',
  'street-river': 'River',
  showdown: 'Les cartes de vilain',
};

/**
 * Les étapes qu'on peut proposer de reprendre pour CETTE main — celles qu'elle a réellement
 * jouées. Une main pliée preflop n'a pas de flop à corriger, et le proposer quand même mènerait
 * à un écran vide ; une main sans adversaire à la fin n'a pas d'abattage.
 *
 * On propose TOUTE la pile de `seedHistory`, et plus seulement les streets. Les trois étapes
 * qu'on écartait — la table, les cartes du héros, l'abattage — avaient pourtant déjà leur
 * instantané, et le « ‹ » y descendait déjà depuis une street reprise : elles étaient donc
 * atteignables à la main, mais introuvables. Ce filtre était la seule chose qui les cachait.
 *
 * ⚠️ `review` N'EST PLUS PROPOSÉE. Elle l'était comme « je ne touche qu'au texte », pour éviter de
 * ressortir du menu — sauf qu'elle y arrivait par REPUBLICATION, donc en perdant les j'aime, les
 * commentaires et les votes, là où « Modifier le post » fait exactement la même modification par un
 * `update` en place qui ne perd rien. C'était donc l'entrée la plus chère de la feuille pour le
 * service le plus faible : un piège, pas un raccourci. Elle reste évidemment la phase de
 * PUBLICATION à la fin de toute correction — c'est l'entrée qui disparaît, pas l'étape.
 */
export function etapesCorrigibles(post: Post): { phase: Phase; label: string }[] {
  const jouees = seedHistory(postToSeed(post)).map((s) => s.phase);
  return jouees.map((phase) => ({ phase, label: LIBELLE_ETAPE[phase] ?? phase }));
}

/** L'état exact à poser dans le créateur pour reprendre une main à une étape donnée. */
export interface SeedStart {
  phase: Phase;
  /**
   * L'état COMPLET de la main — plus l'instantané de l'étape.
   *
   * ⚠️ C'EST LE CŒUR DU MODÈLE : entrer dans une étape n'efface plus rien. Le prix se décide à la
   * SORTIE, d'après ce que l'auteur a réellement changé (cf. `invalidation.ts`) : une carte ou un
   * nom ne coûtent rien, une blinde ou une mise font ressaisir la suite. Avant, l'entrée seule
   * effaçait — ce qui obligeait à annoncer un prix dans la feuille avant de savoir ce que l'auteur
   * viendrait faire, et donc à menacer celui qui venait juste corriger un nom.
   */
  etat: Snapshot;
  /** Ce qui précède l'étape reprise : le « ‹ » continue de redescendre normalement. */
  history: Snapshot[];
  /**
   * L'état AU DÉBUT de l'étape reprise, c'est-à-dire sans ce que cette étape produit. C'est là
   * qu'on retombe quand l'auteur choisit explicitement de refaire — jamais automatiquement.
   * `null` sur une étape qui n'en a pas (publication).
   */
  instantane: Snapshot | null;
}

/**
 * Ouvre la main à l'étape demandée plutôt qu'à la publication.
 *
 * POURQUOI CE N'EST PAS « ouvrir à l'étape 1 et dérouler » : quitter l'étape 1 RECONSTRUIT les
 * blindes et remplace la liste d'actions par elles seules (cf. `LiveHandCreator`). Avancer efface,
 * seul le retour arrière restaure. Reprendre à une étape, c'est donc se poser SUR son instantané —
 * ce que `seedHistory` a déjà calculé — et garder le reste comme historique.
 *
 * `depuis` absent ou `review` → la main s'ouvre complète, sur l'étape de publication.
 *
 * ⚠️ CE QUI A CHANGÉ : on se pose désormais sur l'état COMPLET, et non plus sur l'instantané de
 * l'étape. Celui-ci est renvoyé à part (`instantane`) et n'est appliqué que si l'auteur demande
 * explicitement à refaire. Entrer pour regarder, ou pour corriger une carte, ne coûte plus rien.
 */
export function seedStart(seed: CreatorSeed, depuis?: Phase): SeedStart {
  const history = seedHistory(seed);
  const complet: Snapshot = {
    phase: 'review',
    context: seed.context,
    seats: seed.seats,
    heroCards: seed.heroCards,
    actions: seed.actions,
    activeSeatIds: seed.activeSeatIds,
    board: seed.board,
    board2: seed.board2,
    revealedCards: seed.revealedCards,
  };

  const idx = depuis ? history.findIndex((s) => s.phase === depuis) : -1;
  // Étape inconnue de cette main (elle ne l'a pas jouée) : on retombe sur la publication plutôt
  // que d'ouvrir un écran qui n'a pas lieu d'être.
  if (idx < 0) return { phase: 'review', etat: complet, history, instantane: null };

  return {
    phase: history[idx].phase,
    etat: { ...complet, phase: history[idx].phase },
    history: history.slice(0, idx),
    instantane: history[idx],
  };
}
