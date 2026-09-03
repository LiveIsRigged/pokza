import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import type { Action, ActionType, Card, GameType, Seat, Street, Variant } from '../../types/poker';
import { borders, colors, tints } from '../../theme/theme';
import { getActingOrder, getActingOrderAfter } from '../positions';
import { WizardScreen } from '../WizardScreen';
import { MultiCardPicker, memeCarte } from '../MultiCardPicker';
import { formatChipAmount, roundMoney } from '../../utils/chipFormat';
import { nextBetAbove, roundBet, type BetRoundingContext } from '../../utils/betRounding';
import { PaveNumerique } from '../PaveNumerique';
import { ajouterAuMontant, effacerDernier } from '../saisieMontant';
import { straddleSeatLabel } from '../../engine/handEngine';
import { TableVue, type SiegeAffiche } from '../../components/table/TableVue';
import { GABARIT_ATELIER, GABARIT_ATELIER_DOUBLE, hauteurTableAtelier } from '../../engine/layout';
import { holeCardCount } from '../../types/poker';
import type { CodeDevise } from '../../utils/currency';

/**
 * LE TITRE NOMME SON ÉTAPE, SUR LES QUATRE — décision de Victor du 02/09/2026.
 * ──────────────────────────────────────────────────────────────────────────
 * Le préflop, le flop, le turn, la river et l'abattage ne sont plus cinq étapes mais cinq écrans
 * de l'étape 3 (cf. `TOTAL_ETAPES` dans `LiveHandCreator`). Le compteur reste donc sur « 3/4 »
 * pendant tout ce temps, et c'est le titre qui porte les deux informations : de quelle étape il
 * s'agit, et où on en est dedans.
 *
 * On a d'abord essayé de loger « La main » à côté du compteur, en haut à droite. Écarté par
 * Victor, et à raison : sur les trois autres étapes le nom se lit dans le TITRE (« La table »,
 * « Tes cartes », « Publier »), et le mettre ailleurs ici aurait posé la même information à deux
 * endroits selon l'écran.
 *
 * Le tiret plutôt qu'une parenthèse : une parenthèse rétrograde ce qu'elle enferme, or la street
 * est le fait principal de l'écran — la seule chose qui ait changé depuis le précédent. Le tiret
 * joint deux pairs.
 */
const ETAPE = 'La main';
const STREET_TITLES: Record<Street, string> = {
  preflop: `${ETAPE} — Préflop`,
  flop: `${ETAPE} — Flop`,
  turn: `${ETAPE} — Turn`,
  river: `${ETAPE} — River`,
};

/**
 * Combien de cartes de board sont DÉJÀ TOMBÉES quand cette street s'ouvre.
 *
 * Garde-fou nécessaire, pas décoratif : le créateur transporte le board complet qu'il connaît, et
 * sur le chemin de CORRECTION d'une main publiée, il connaît déjà le flop en arrivant sur l'étape
 * du flop — qu'on s'apprête pourtant à ressaisir. Sans cette coupe, l'étape affichait trois cartes
 * « passées » PLUS ses trois emplacements : six pour une rangée qui n'en dessine que cinq, la
 * sixième disparaissant en silence.
 */
const CARTES_DEJA_TOMBEES: Record<Street, number> = { preflop: 0, flop: 0, turn: 3, river: 4 };

/** À quelle street appartient un index du board à plat : 0-2 le flop, 3 le turn, 4 la river. */
const rueDeLIndex = (i: number) => (i < 3 ? 'flop' : i === 3 ? 'turn' : 'river');

/**
 * LA MÉCANIQUE D'UN BOARD — ses emplacements, le geste qui en vide un, celui qui y loge une carte.
 * ───────────────────────────────────────────────────────────────────────────────────────────────
 * Écrite une fois et appliquée aux DEUX boards d'un bomb pot : ils suivent exactement les mêmes
 * règles. Ils partagent en revanche UN SEUL sélecteur (décision de Victor, 31/08/2026) — deux
 * grilles obligeaient à défiler pour saisir le second board une fois le premier fini, alors que les
 * deux rangées sont là, sous les yeux. La question « quelle carte remplit quoi ? » se répond donc
 * comme pour une seule rangée : la carte choisie va dans le PREMIER trou, board 1 d'abord, board 2
 * ensuite — et c'est le trou en pointillés sur le feutre qui le montre avant même de choisir.
 */
function mecaniqueBoard(
  avantBrut: Card[],
  trous: number[],
  setTrous: React.Dispatch<React.SetStateAction<number[]>>,
  cartes: (Card | undefined)[],
  setCartes: React.Dispatch<React.SetStateAction<(Card | undefined)[]>>,
  corriger?: (index: number, carte: Card) => void
) {
  /** Tout le board visible à cette street : les cartes déjà tombées (trous compris), puis les siennes. */
  const emplacements: (Card | undefined)[] = [
    ...avantBrut.map((c, i) => (trous.includes(i) ? undefined : c)),
    ...cartes,
  ];

  /**
   * Taper une carte la retire — la prochaine choisie prendra sa place. Retaper l'emplacement qu'on
   * vient de vider annule le retrait (possible seulement pour les streets passées, où la carte
   * d'origine est encore connue).
   */
  const taper = (i: number) => {
    if (i < avantBrut.length) {
      setTrous((prev) => {
        if (prev.includes(i)) return prev.filter((j) => j !== i);
        const memeRue = prev.length === 0 || rueDeLIndex(prev[0]) === rueDeLIndex(i);
        return memeRue ? [...prev, i] : [i];
      });
      return;
    }
    // Retoucher la street EN COURS referme ce qu'on avait ouvert sur une street passée : une seule
    // street se ressaisit à la fois, et celle qu'on a sous les doigts l'emporte.
    setTrous([]);
    const j = i - avantBrut.length;
    setCartes((prev) => prev.map((c, k) => (k === j ? undefined : c)));
  };

  /** Loger une carte dans le PREMIER emplacement libre — celui qu'on vient de vider, en pratique. */
  const poser = (carte: Card) => {
    const trou = emplacements.findIndex((c) => !c);
    if (trou === -1) return;
    if (trou < avantBrut.length) {
      // Une carte d'une street passée : c'est le créateur qui la détient, pas cette étape.
      corriger?.(trou, carte);
      setTrous((prev) => prev.filter((j) => j !== trou));
      return;
    }
    const j = trou - avantBrut.length;
    setCartes((prev) => prev.map((c, k) => (k === j ? carte : c)));
  };

  /** Les cartes momentanément retirées : à laisser choisissables, pour pouvoir les remettre. */
  const enAttente = trous.map((i) => avantBrut[i]).filter(Boolean) as Card[];

  return { emplacements, taper, poser, enAttente };
}

const POT_SHORTCUTS: { label: string; fraction: number }[] = [
  { label: '1/3 pot', fraction: 1 / 3 },
  { label: '1/2 pot', fraction: 1 / 2 },
  { label: '2/3 pot', fraction: 2 / 3 },
  { label: 'Pot', fraction: 1 },
];

// Préflop sans relance : le %pot n'est pas le repère, on raisonne en multiples de BB. Mêmes valeurs
// en cash et en tournoi. (10BB a été retiré : c'est un montant qu'on n'ouvre jamais, le bouton ne
// servait à rien ; 2,5BB le remplace.)
const PREFLOP_OPEN_BB_MULTIPLES = [2.5, 3, 4, 5];

// DÈS QU'IL Y A QUELQUE CHOSE À SURRELANCER, le repère n'est plus la BB ni le pot mais LA MISE À
// SUIVRE. Laisser les multiples de BB à ce moment-là donnait des boutons morts : en 2-5 face à une
// ouverture à 15, « 3BB » valait 15, soit exactement la mise à suivre, et « 4BB » 20 — un 3bet que
// personne ne fait. Les deux fusionnaient après remontée forcée, laissant trois boutons injouables.
//
// Trois jeux, parce qu'une surrelance ne se dimensionne pas pareil selon l'étage : on 3bet gros
// (×3 à ×6 de l'ouverture) mais on 4bet petit (×2 à ×4 du 3bet, qui est déjà large).
const PREFLOP_3BET_MULTIPLES = [3, 4, 5, 6];
const PREFLOP_4BET_PLUS_MULTIPLES = [2, 2.5, 3, 4];
const POSTFLOP_RAISE_MULTIPLES = [2, 3, 4, 5];
// En pot-limit, ×4 et ×5 peuvent dépasser le maximum légal (4× la mise > pot + 3× la mise dès que
// la mise excède le pot), alors que ×2 et ×3 lui sont TOUJOURS inférieurs. D'où deux multiples
// seulement, complétés par le pot lui-même — qui est justement ce maximum.
const POSTFLOP_RAISE_MULTIPLES_POT_LIMIT = [2, 3];

/** « ×2,5 » — virgule décimale, comme partout ailleurs dans l'app (cf. `abbreviateChips`). */
function formatMultiple(n: number): string {
  return `×${String(n).replace('.', ',')}`;
}

// Avec un straddle, le repère "BB" ne veut plus rien dire pour ces raccourcis (le niveau à suivre
// est déjà le straddle, pas la BB) : suffixe générique "x" plutôt qu'une unité fausse.
function formatBbMultiple(n: number, hasStraddle: boolean): string {
  const value = Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  return hasStraddle ? `${value}x` : `${value}BB`;
}

interface Snapshot {
  queue: string[];
  active: string[];
  betAmount: number;
  contributions: Record<string, number>;
  recorded: Action[];
  orderCounter: number;
}

/**
 * TOUT CE QU'IL FAUT POUR ROUVRIR CETTE STREET EXACTEMENT COMME ON L'A QUITTÉE.
 * ────────────────────────────────────────────────────────────────────────────
 * Un `Snapshot` (l'état du tour d'enchères), ses cartes de board, et **sa pile d'annulation**.
 * Cette dernière est la moitié qui compte : sans elle on rouvrirait une street figée, qu'on ne
 * pourrait que traverser. Avec elle, « ↩ Annuler » reprend là où il en était, action par action.
 *
 * Ce que ça règle, mesuré le 01/09/2026 : un « ‹ Retour » depuis le turn effaçait les 3 cartes du
 * flop ET ses 4 actions, sans un mot. La cause n'était pas l'instantané du créateur — lui est
 * juste, il ramène bien `actions` à l'avant-street — mais le fait que `StreetStep` repartait vide.
 *
 * Les trous (`trousAvant`, `trousHero`…) n'en font PAS partie, et c'est voulu : une street ne peut
 * pas se terminer avec un emplacement ouvert (`boardComplete` l'exige), donc ils sont toujours
 * vides au moment où l'on quitte l'écran.
 */
export interface EtatStreet extends Snapshot {
  boardCards: (Card | undefined)[];
  boardCards2: (Card | undefined)[];
  history: Snapshot[];
}

interface StreetStepProps {
  street: Street;
  boardCount: number;
  /** Nombre de cartes du SECOND board à saisir sur cette street (double board bomb pot) — 0 = un
   * seul board. Quand > 0, deux sélecteurs sont affichés et les deux boards doivent être remplis. */
  boardCount2?: number;
  usedCardsElsewhere: Card[];
  seats: Seat[];
  activeSeatIds: string[];
  startOrder: number;
  initialBetAmount?: number;
  initialContributions?: Record<string, number>;
  /** Total déjà misé par chaque siège lors des streets précédentes */
  priorCommitted?: Record<string, number>;
  /** Ante déjà posté par chaque siège sur CETTE street (dead money, indépendant du niveau de mise à suivre) */
  anteCommitted?: Record<string, number>;
  /** Si un siège a posté un straddle (ou autre mise forcée), l'action reprend juste après lui plutôt qu'à l'ordre naturel */
  firstToActAfterSeatId?: string;
  /** Actions déjà enregistrées plus tôt dans la main (streets précédentes, dont un éventuel
   * straddle préflop) — sert uniquement à l'affichage du nom des sièges (cf. `seatDisplay`). */
  priorActions?: Action[];
  /** BB de la main, utilisée pour les raccourcis de taille en multiples de BB au préflop */
  bb?: number;
  /** SB de la main : avec la BB, elle détermine le pas d'arrondi des raccourcis postflop (cf.
   * `tableStep`). 0 en bomb pot, où il n'y a pas de blindes. */
  sb?: number;
  /** Variante : en PLO/PLO5 le pot est le maximum légal, donc le raccourci « Pot » vaut le pot
   * exact au lieu d'être arrondi. */
  variant?: Variant;
  /** Les cartes de Hero, pour qu'il les revoie sur la table pendant qu'il saisit. */
  heroCards?: Card[];
  /** Le board DÉJÀ tombé aux streets précédentes — celui de cette street s'y ajoute à mesure. */
  boardAvant?: Card[];
  /**
   * Corriger une carte d'une street DÉJÀ passée (index dans `boardAvant`). Ces cartes appartiennent
   * au créateur, pas à cette étape : c'est lui qui les range dans le bon board et qui répercute la
   * correction sur l'historique de retour. Absent, les cartes passées restent inertes.
   */
  onCorrigerBoard?: (index: number, carte: Card) => void;
  /** Le SECOND board déjà tombé (bomb pot double board), et sa correction. Mêmes règles que le
   *  premier, cloisonnées : chaque board a ses emplacements et son sélecteur. */
  board2Avant?: Card[];
  onCorrigerBoard2?: (index: number, carte: Card) => void;
  /** Corriger une carte de Hero depuis ici (index dans sa main). Absent, ses cartes sont inertes. */
  onCorrigerHero?: (index: number, carte: Card) => void;
  gameType?: GameType;
  /** Devise de la main (cf. `DEVISES`) ; absente = euro. Sans effet en tournoi. */
  currency?: CodeDevise;
  /** Main jouée en bomb pot : les raccourcis « check/fold rapide jusqu'à » restent proposés à chaque
   * street (checker/folder en cascade est courant au flop d'un bomb pot). Hors bomb pot, ils ne sont
   * gardés qu'au préflop (fold général jusqu'à une position) et retirés en postflop. */
  bombPot?: boolean;
  /**
   * L'état de cette street quand on l'a déjà jouée puis quittée par « ‹ Retour ». Absent, la street
   * démarre vierge — le cas normal. Présent, elle se rouvre telle quelle : ses cartes, son tour
   * d'enchères, et sa pile d'annulation (cf. `EtatStreet`).
   */
  reprise?: EtatStreet;
  /**
   * Appelé JUSTE AVANT chaque sortie de l'écran, avec de quoi le rouvrir intact. Le créateur le
   * range sous la phase courante ; « ‹ Retour » le rend. Séparé des trois sorties exprès : elles
   * disent où l'on va, celle-ci dit ce qu'on laisse derrière, et le parent n'a qu'un fil à brancher.
   */
  onEtat?: (etat: EtatStreet) => void;
  onBack: () => void;
  onComplete: (boardCards: Card[], board2Cards: Card[], actions: Action[], remainingActiveSeatIds: string[]) => void;
  onHandEndsEarly: (
    boardCards: Card[],
    board2Cards: Card[],
    actions: Action[],
    remainingActiveSeatIds: string[]
  ) => void;
  /**
   * L'auteur arrête la main ici, sur la décision de `stoppedSeatId` — celui qui était en train de
   * parler. Mêmes arguments qu'`onHandEndsEarly` (la street est remontée telle qu'elle a été
   * saisie), plus ce siège : la différence n'est pas dans les données mais dans ce qu'elles
   * veulent dire, une main sans fin plutôt qu'une main finie.
   */
  onStop: (
    boardCards: Card[],
    board2Cards: Card[],
    actions: Action[],
    remainingActiveSeatIds: string[],
    stoppedSeatId: string
  ) => void;
  step?: number;
  totalSteps?: number;
}

function seatDisplay(seat: Seat, seats: Seat[], priorActions: Action[]): string {
  const positional = straddleSeatLabel(seats, priorActions, seat.id) ?? seat.position;
  // Le héros garde sa position entre parenthèses : c'est elle qui compte pour lire la main. Son nom
  // ne remplace donc que le mot « Hero », il ne prend jamais la place du repère de position.
  if (seat.isHero) return `${seat.playerName ?? 'Hero'} (${positional})`;
  return seat.playerName ?? positional;
}

export function StreetStep({
  street,
  boardCount,
  boardCount2 = 0,
  usedCardsElsewhere,
  seats,
  activeSeatIds,
  startOrder,
  initialBetAmount = 0,
  initialContributions = {},
  priorCommitted = {},
  anteCommitted = {},
  firstToActAfterSeatId,
  priorActions = [],
  bb = 0,
  sb = 0,
  variant = 'nlhe',
  heroCards = [],
  boardAvant = [],
  onCorrigerBoard,
  board2Avant = [],
  onCorrigerBoard2,
  onCorrigerHero,
  gameType = 'cash',
  currency,
  bombPot = false,
  reprise,
  onEtat,
  onBack,
  onComplete,
  onHandEndsEarly,
  onStop,
  step,
  totalSteps,
}: StreetStepProps) {
  const [boardCards, setBoardCards] = useState<(Card | undefined)[]>(
    reprise ? reprise.boardCards : Array(boardCount).fill(undefined)
  );
  const [boardCards2, setBoardCards2] = useState<(Card | undefined)[]>(
    reprise ? reprise.boardCards2 : Array(boardCount2).fill(undefined)
  );

  // Chips qu'un siège peut engager sur CETTE street (son stack restant en début de street).
  // L'ante posté sur cette street est de l'argent mort indépendant du niveau de mise à suivre :
  // il réduit bien le stack jouable, mais ne doit pas être compté dans `contributions` (qui sert
  // au calcul du montant dû, lui-même basé uniquement sur les blindes/mises/relances).
  const availableAtStart = (id: string) => {
    const seat = seats.find((s) => s.id === id);
    return (seat?.startingStack ?? 0) - (priorCommitted[id] ?? 0) - (anteCommitted[id] ?? 0);
  };

  // Seuls les sièges encore en jeu ET qui ont des jetons agissent (les joueurs déjà à tapis passent).
  // Si un straddle (ou autre mise forcée) a été posté, l'action reprend juste après ce siège au lieu
  // de l'ordre naturel (le siège qui a straddlé agit en dernier, comme le ferait la BB normalement).
  const baseOrder = firstToActAfterSeatId
    ? getActingOrderAfter(seats, street, firstToActAfterSeatId)
    : getActingOrder(seats, street);
  const order = baseOrder.filter((s) => activeSeatIds.includes(s.id) && availableAtStart(s.id) > 0);
  const [queue, setQueue] = useState<string[]>(reprise ? reprise.queue : order.map((s) => s.id));
  const [active, setActive] = useState<string[]>(reprise ? reprise.active : activeSeatIds);
  const [betAmount, setBetAmount] = useState(reprise ? reprise.betAmount : initialBetAmount);
  const [contributions, setContributions] = useState<Record<string, number>>(
    reprise ? reprise.contributions : initialContributions
  );
  const [recorded, setRecorded] = useState<Action[]>(reprise ? reprise.recorded : []);
  const [orderCounter, setOrderCounter] = useState(reprise ? reprise.orderCounter : startOrder);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [enteringAmount, setEnteringAmount] = useState<'bet' | 'raise' | null>(null);
  const [history, setHistory] = useState<Snapshot[]>(reprise ? reprise.history : []);
  /**
   * LE BOARD SE MODIFIE SUR LE FEUTRE, PAS DANS UN FORMULAIRE (décision de Victor, 31/08/2026).
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * Taper une carte du board la retire ; elle laisse un trou en pointillés à sa place, et la
   * prochaine carte choisie vient s'y loger. Ça vaut aussi pour les cartes d'une street DÉJÀ
   * passée : on corrige un flop depuis la river, sans revenir en arrière.
   *
   * On peut ouvrir PLUSIEURS trous d'un coup, mais dans UNE SEULE street à la fois (décision de
   * Victor, 31/08/2026). Deux trous dans le même flop ne posent aucune question : ces trois cartes
   * tombent ensemble, l'ordre dans lequel on les remplit n'a pas de sens. Deux trous dans deux
   * streets différentes, si — laquelle se remplit d'abord ? Ouvrir un trou sur une autre street
   * referme donc les précédents, qui retrouvent leur carte. Retaper un trou l'annule aussi.
   *
   * Le sélecteur, lui, n'a plus d'état à retenir : il est là tant qu'un emplacement attend une
   * carte, et il se range tout seul dès qu'il n'en reste plus. Il mesure 338 px — c'est lui qui
   * poussait les boutons d'action sous le pli (5 px de marge sur un iPhone 14, 172 px manquants
   * sur un SE).
   */
  /** Bomb pot à deux boards : le seul cas où la seconde rangée existe. */
  const doubleBoard = boardCount2 > 0 || board2Avant.length > 0;
  const [trousAvant, setTrousAvant] = useState<number[]>([]);
  const [trousAvant2, setTrousAvant2] = useState<number[]>([]);
  const dejaTombees = CARTES_DEJA_TOMBEES[street];
  const avant1 = boardAvant.slice(0, dejaTombees);
  const avant2 = board2Avant.slice(0, dejaTombees);
  const [trousHero, setTrousHero] = useState<number[]>([]);
  const b1 = mecaniqueBoard(avant1, trousAvant, setTrousAvant, boardCards, setBoardCards, onCorrigerBoard);
  const b2 = mecaniqueBoard(avant2, trousAvant2, setTrousAvant2, boardCards2, setBoardCards2, onCorrigerBoard2);
  /**
   * LA MAIN DE HERO SE CHANGE ELLE AUSSI SUR LE FEUTRE, sans remonter à l'étape 2 (demande de
   * Victor au premier tour, 30/08). C'est exactement la même mécanique que le board — ses cartes
   * sont « déjà tombées », il n'y en a aucune à choisir pour cette street — d'où la liste vide et
   * le `setCartes` qui ne sert jamais.
   */
  const hero = mecaniqueBoard(heroCards, trousHero, setTrousHero, [], () => {}, onCorrigerHero);

  const emplacements = b1.emplacements;
  const emplacements2 = b2.emplacements;
  /** Le board de cette street est-il posé ? (les deux rangées en double board) */
  const boardPret = emplacements.every(Boolean) && emplacements2.every(Boolean);
  /** Hero a-t-il toujours sa main complète, ou en a-t-on retiré une carte pour la changer ? */
  const heroPret = hero.emplacements.every(Boolean);
  const boardComplete = boardPret && heroPret;
  /**
   * Ce que le sélecteur unique remplit, dans cet ordre : board 1, board 2, puis la main de Hero.
   *
   * Hero n'entre dans la liste QUE si le board de la street est posé — sinon retirer une de ses
   * cartes ouvrirait un trou pendant que le board en a déjà, et la carte suivante irait au board
   * sans qu'on comprenne pourquoi. C'est la même règle qu'entre deux streets : une chose à la fois.
   */
  const emplacementsBoard = doubleBoard ? [...emplacements, ...emplacements2] : emplacements;
  const tousLesEmplacements = boardPret
    ? [...emplacementsBoard, ...hero.emplacements]
    : emplacementsBoard;

  /** Toucher le board referme ce qu'on avait ouvert dans la main de Hero, et réciproquement. */
  const taperBoard1 = (i: number) => {
    setTrousHero([]);
    b1.taper(i);
  };
  const taperBoard2 = (i: number) => {
    setTrousHero([]);
    b2.taper(i);
  };

  /** Ce que la grille grise : ce qui est pris ailleurs, jamais ce qui est sur l'un des deux boards. */
  const disponiblesExclues = usedCardsElsewhere.filter(
    (c) =>
      !tousLesEmplacements.some((e) => e && memeCarte(e, c)) &&
      ![...b1.enAttente, ...b2.enAttente, ...hero.enAttente].some((a) => memeCarte(a, c))
  );

  /**
   * Le sélecteur renvoie une liste TASSÉE (il ne connaît pas les trous) : on replace par différence.
   * Une carte ajoutée va dans le premier trou — board 1 puis board 2 ; une carte retirée depuis la
   * grille refait le geste qu'on aurait fait sur le feutre.
   */
  const surChoixDuSelecteur = (next: (Card | undefined)[]) => {
    const posees = tousLesEmplacements.filter(Boolean) as Card[];
    const ajoutee = next.find((c) => c && !posees.some((p) => memeCarte(p, c))) as Card | undefined;
    if (ajoutee) {
      if (emplacements.some((c) => !c)) b1.poser(ajoutee);
      else if (doubleBoard && emplacements2.some((c) => !c)) b2.poser(ajoutee);
      else hero.poser(ajoutee);
      return;
    }
    const retire = tousLesEmplacements.findIndex((c) => c && !next.some((n) => n && memeCarte(n, c)));
    if (retire < 0) return;
    if (retire < emplacements.length) taperBoard1(retire);
    else if (retire < emplacementsBoard.length) taperBoard2(retire - emplacements.length);
    else hero.taper(retire - emplacementsBoard.length);
  };

  const fmt = (n: number) => formatChipAmount(n, gameType, undefined, currency);

  // Pot total en direct : ce qui a été misé sur les streets précédentes (déjà réglé) + l'ante de
  // cette street si elle vient d'être postée (préflop uniquement, cf. anteCommitted) + ce qui a été
  // misé sur la street courante jusqu'ici. Sert de repère pour la taille de mise (ex: "environ 1/3 pot").
  const sumValues = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const potNow = sumValues(priorCommitted) + sumValues(anteCommitted) + sumValues(contributions);

  // Raccourcis de taille : en multiples de BB au préflop (le %pot n'est pas le repère habituel
  // avant le flop), en %pot sur les streets suivantes. Si un straddle a été posté (simple, double
  // ou triple), le niveau à suivre au préflop n'est plus la BB mais ce straddle
  // (`initialBetAmount`, déjà égal au montant du DERNIER straddle côté créateur) : les multiples
  // doivent se baser dessus, sinon "3BB" afficherait un montant sans rapport avec 3x la BB.
  const hasStraddle = Boolean(firstToActAfterSeatId);
  const preflopRaiseUnit = street === 'preflop' && hasStraddle ? initialBetAmount : bb;
  const currentSeatId = queue[0];
  const currentSeat = seats.find((s) => s.id === currentSeatId);
  const owed = betAmount - (contributions[currentSeatId] ?? 0);
  const canCheck = owed <= 0;

  // Stack restant d'un siège en tenant compte de ce qu'il a déjà mis sur cette street.
  const remainingFor = (id: string) => availableAtStart(id) - (contributions[id] ?? 0);
  const currentRemaining = currentSeatId ? availableAtStart(currentSeatId) : 0;
  const callTo = Math.min(betAmount, currentRemaining); // suivre est plafonné au tapis
  const isCallAllIn = callTo >= currentRemaining && callTo < betAmount;
  /**
   * CE QU'IL RESTE À POSER POUR SUIVRE — décision de Victor, 02/09/2026.
   * ───────────────────────────────────────────────────────────────────
   * Le bouton affichait `callTo`, le TOTAL de la street. À 5-10, la BB voyait « Suivre (30) » face
   * à une ouverture à 30 alors qu'elle n'avait que 20 à poser ; au flop, après avoir misé 65 et
   * s'être fait relancer à 265, elle lisait « Suivre (265) » pour 200 à sortir.
   *
   * LA RÈGLE, ET ELLE N'EST PAS UN MÉLANGE D'UNITÉS : ce qu'on DÉCLARE se nomme par son niveau,
   * ce qu'on se contente de SUIVRE se paie par la différence. Une mise, une relance, un tapis, on
   * en choisit la taille — c'est donc une taille, et « Tapis » continue d'afficher le total (faire
   * tapis avec 65 déjà devant soi et 500 en début de street, c'est miser 500, pas 435). Suivre, on
   * ne choisit rien : on comble un écart. C'est mot pour mot le format des hand histories, que la
   * narration imite déjà avec son `raises to` — « raises 200 to 265 » puis « calls 200 ».
   *
   * ⚠️ `callTo - contributions`, PAS `owed`. `owed` (= betAmount - contributions) n'est pas plafonné
   * au tapis : un joueur qui doit 200 mais n'a que 85 devant lui afficherait « Suivre (200) · tapis »,
   * une somme qu'il ne peut pas poser. Le plafond est déjà dans `callTo`.
   *
   * Rien d'autre ne bouge : l'action ENREGISTRÉE reste le total, comme les jetons dessinés devant
   * chaque joueur et comme la ligne narrée. Seul le libellé du bouton change.
   */
  const resteAPoser = callTo - (contributions[currentSeatId] ?? 0);
  /**
   * SUIVRE ME MET-IL À TAPIS ? — distinct de `isCallAllIn`, et c'est voulu.
   * ─────────────────────────────────────────────────────────────────────
   * `isCallAllIn` répond à « je ne peux même pas ÉGALER la mise » (`callTo < betAmount`) : c'est ce
   * qui justifie le suffixe « · tapis », parce que les autres restent alors redevables du solde.
   * Celui-ci répond à « ce suivi consomme tout mon tapis », ce qui est vrai dès l'égalité exacte —
   * le cas que le suffixe rate, et qui n'avait plus AUCUN signal depuis que le bouton « Tapis » se
   * retire quand il fait doublon.
   *
   * Il ne pilote que l'habillage. Le socle traitait Fold, Suivre et Relancer à l'identique parce
   * qu'aucune de ces actions n'est « la bonne » ; seul Tapis se distinguait, PARCE QU'IL EST
   * IRRÉVERSIBLE. Un suivi à tapis l'est tout autant : il porte donc le même costume, et pas
   * l'orange de marque, qui pousserait à l'action (cf. le commentaire du bouton Relancer).
   */
  const suivreMetATapis = callTo >= currentRemaining;

  const rounding: BetRoundingContext = { gameType, sb, bb };
  const isPotLimit = variant === 'plo' || variant === 'plo5';
  // Étage de surrelance au préflop : 0 relance = personne n'a encore ouvert (la mise à suivre est
  // la BB ou le straddle), 1 = on répond à une ouverture (3bet), 2+ = 4bet et au-delà.
  const preflopRaises = street === 'preflop' ? recorded.filter((a) => a.type === 'raise').length : 0;

  const rawShortcuts: { label: string; amount: number; exact: number }[] = (() => {
    if (street === 'preflop') {
      // Si un straddle a été posté, le niveau à suivre n'est plus la BB mais ce straddle
      // (`initialBetAmount`, déjà égal au montant du DERNIER straddle côté créateur) : les multiples
      // doivent se baser dessus, sinon « 3BB » afficherait un montant sans rapport avec 3x la BB.
      if (preflopRaises === 0) {
        // Arrondis comme partout ailleurs : sans ça « 2,5BB » affiche 13 € en 2-5, une ouverture qui
        // n'existe pas. L'arrondi en fait doublonner certains (2,5BB et 3BB tombent tous deux sur
        // 15 € en 2-5) — c'est voulu, le dédoublonnage plus bas resserre alors la rangée à trois
        // boutons, tous jouables, plutôt que d'en afficher quatre dont un mort.
        return PREFLOP_OPEN_BB_MULTIPLES.map((m) => ({
          label: formatBbMultiple(m, hasStraddle),
          amount: roundBet(preflopRaiseUnit * m, rounding),
          exact: preflopRaiseUnit * m,
        }));
      }
      // Ces montants-ci sont arrondis, contrairement aux multiples de BB ci-dessus : une ouverture
      // straddlée ou irrégulière (35 €) donnerait sinon des surrelances à 105, 140, 175…
      const multiples = preflopRaises === 1 ? PREFLOP_3BET_MULTIPLES : PREFLOP_4BET_PLUS_MULTIPLES;
      return multiples.map((m) => ({
        label: formatMultiple(m),
        amount: roundBet(betAmount * m, rounding),
        exact: betAmount * m,
      }));
    }

    if (betAmount > 0) {
      // Relance postflop : même repère qu'au préflop, la mise à suivre. Le %pot n'y survit pas —
      // sur un pot de 100 où le vilain mise 50, « 1/3 pot » calcule 50 (la mise elle-même, bouton
      // mort) et « 1/2 pot » 75, soit une relance SOUS le minimum légal de 100. ×2 est au contraire
      // toujours légal : c'est exactement la relance minimale quand la mise ouvre les enchères.
      const multiples = isPotLimit ? POSTFLOP_RAISE_MULTIPLES_POT_LIMIT : POSTFLOP_RAISE_MULTIPLES;
      const shortcuts = multiples.map((m) => ({
        label: formatMultiple(m),
        amount: roundBet(betAmount * m, rounding),
        exact: betAmount * m,
      }));
      if (isPotLimit) {
        // Le « pot » d'une RELANCE ne vaut pas le pot courant : on relance de la taille du pot une
        // fois qu'on a suivi, soit `mise à suivre + pot courant + ce qu'il reste à payer`. Sur
        // l'exemple ci-dessus : 50 + 150 + 50 = 250, et non 150. C'est le maximum légal en PLO,
        // donc un montant exact, jamais arrondi.
        const potLimit = roundMoney(betAmount + potNow + owed);
        shortcuts.push({ label: 'Pot', amount: potLimit, exact: potLimit });
      }
      return shortcuts;
    }

    return POT_SHORTCUTS.map(({ label, fraction }) => ({
      label,
      exact: potNow * fraction,
      // Le raccourci « Pot » ne monte jamais au-dessus du pot : en PLO c'est le maximum légal, donc
      // on l'affiche au centime près sans arrondir du tout ; ailleurs on descend au pas plutôt que
      // d'annoncer « Pot » sur un montant qui le dépasse.
      amount:
        fraction === 1
          ? isPotLimit
            ? roundMoney(potNow)
            : roundBet(potNow, rounding, 'down')
          : roundBet(potNow * fraction, rounding),
    }));
  })();

  // Raccourcis effectivement affichés, une fois ramenés dans les bornes du coup :
  // - un montant sous la mise à suivre serait refusé à la validation (cf. `confirmAmount`), donc
  //   un bouton mort — l'arrondi vers le bas peut y tomber dans les petits pots ;
  // - un montant au-dessus du tapis est impossible, on le plafonne ;
  // - deux boutons affichant le MÊME montant n'apportent rien (dans un petit pot, 1/2 et 2/3 se
  //   rejoignent souvent après arrondi) : on ne garde que le premier, donc la plus petite fraction.
  const parMontant = new Map<number, { label: string; amount: number; exact: number }>();
  for (const { label, amount, exact } of rawShortcuts) {
    const lifted = amount <= betAmount && amount < currentRemaining ? nextBetAbove(betAmount, rounding) : amount;
    const borne = Math.min(lifted, currentRemaining);
    // Un raccourci retombé sur le tapis n'est plus une taille de mise, c'est un tapis — que le
    // bouton dédié affiche déjà avec son traitement distinct, justement parce qu'il est
    // irréversible. Le garder ici le ferait poser en un tap sans cette friction voulue.
    if (borne <= 0 || borne >= currentRemaining) continue;
    // Entre deux raccourcis retombés sur le MÊME montant, on garde celui dont la valeur exacte en
    // est la plus proche — donc le libellé qui ne ment pas. Sans cet arbitrage, « 2,5BB » resterait
    // affiché sur 15 € en 2-5, alors que 15 €, c'est très exactement 3BB.
    const enPlace = parMontant.get(borne);
    if (!enPlace || Math.abs(exact - borne) < Math.abs(enPlace.exact - borne)) {
      parMontant.set(borne, { label, amount: borne, exact });
    }
  }
  const sizeShortcuts = [...parMontant.values()];

  // ⚠️ Le filtre sur les jetons restants est INDISPENSABLE ici, et il manquait. `order` (en début de
  // street) écarte bien les joueurs sans jetons, mais cette file-ci est reconstruite après chaque
  // mise ou relance : sans le filtre, un joueur parti à tapis PLUS TÔT dans la même street était
  // rappelé à jouer. L'écran lui affichait « reste 0 » à côté d'un bouton « Tapis » proposant un
  // montant qu'il n'avait plus, et un clic sur Fold l'enregistrait couché alors qu'il avait déjà
  // tout mis au pot — il perdait un pot qu'il avait le droit de disputer.
  //
  // Le filtre porte sur `remainingFor` et non `availableAtStart` : ce dernier est le stack du DÉBUT
  // de street, encore positif pour quelqu'un qui vient justement d'y engager tous ses jetons.
  const reorderAfter = (ids: string[], afterSeatId: string) =>
    getActingOrderAfter(seats, street, afterSeatId)
      .filter((s) => ids.includes(s.id) && remainingFor(s.id) > 0)
      .map((s) => s.id);

  const finalBoard = () => boardCards.filter(Boolean) as Card[];
  const finalBoard2 = () => boardCards2.filter(Boolean) as Card[];

  /**
   * « Arrêter la main ici » — la sortie de l'auteur qui ne veut pas dire ce qu'il a fait.
   *
   * SES DEUX CONDITIONS SONT EXACTEMENT CELLES DE LA BARRE D'ACTION, et ce n'est pas une
   * coïncidence : on n'arrête une main que là où quelqu'un a une décision à prendre.
   *   • `boardComplete` — sans les cartes de la street, « arrêter sur le flop » produirait une main
   *     arrêtée à la fin du préflop, ce que l'auteur ne demande pas.
   *   • `currentSeat` — quand tous les joueurs restants sont à tapis, l'écran affiche à la place
   *     « Les joueurs restants sont à tapis » et son propre bouton « Continuer » : plus personne
   *     n'a de décision à taire. Les deux boutons ne peuvent donc jamais coexister à l'écran.
   *
   * Le préflop AVANT toute action reste ouvert (décision de Victor, 30/08/2026) : la main publiée
   * ne contient alors que ses blindes, et c'est une vraie question — « je suis au bouton avec AK,
   * je fais quoi ? ».
   *
   * Pas de confirmation : un tap malheureux coûte de ressaisir les actions de cette street, très
   * exactement ce que coûte un « ‹ Retour » mal visé, en haut du même écran, qui n'en demande pas.
   */
  const arretPossible = boardComplete && Boolean(currentSeat);

  /**
   * On est revenu sur une street DÉJÀ JOUÉE (« ‹ Retour » depuis la suivante), et non sur une street
   * où plus personne ne peut parler. Les deux se ressemblent — la file est vide dans les deux cas —
   * mais la phrase à afficher est l'exact opposé : ici il reste des joueurs, et tout est encore là.
   *
   * Figé au montage : la file peut se remplir de nouveau si l'auteur défait une action, et se
   * revider ensuite — mais ce second vidage passe par `finishIfDone`, qui quitte l'écran. Tant
   * qu'on est dans cet état, il vient bien d'une reprise.
   */
  const [revenuSurStreetFinie] = useState(() => reprise !== undefined && reprise.queue.length === 0);

  /**
   * Empile l'état d'AVANT le coup qu'on s'apprête à jouer, et RENVOIE la pile à jour.
   *
   * Le retour n'est pas décoratif : `finishIfDone` doit ranger cette pile-là dans l'`EtatStreet`, et
   * l'état React `history` ne l'a pas encore encaissée à cet instant. Sans ça, rouvrir la street et
   * appuyer sur « ↩ Annuler » défaisait DEUX actions au lieu d'une (mesuré le 01/09/2026).
   */
  const pushHistory = (): Snapshot[] => {
    const suivant = [...history, { queue, active, betAmount, contributions, recorded, orderCounter }];
    setHistory(suivant);
    return suivant;
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setQueue(last.queue);
    setActive(last.active);
    setBetAmount(last.betAmount);
    setContributions(last.contributions);
    setRecorded(last.recorded);
    setOrderCounter(last.orderCounter);
    setEnteringAmount(null);
    setAmountInput('');
  };

  const pushAction = (type: ActionType, amount: number | undefined) => {
    const action: Action = {
      id: `${street}-${orderCounter}`,
      street,
      seatId: currentSeatId,
      type,
      amount,
      order: orderCounter,
    };
    const nextRecorded = [...recorded, action];
    setRecorded(nextRecorded);
    setOrderCounter((o) => o + 1);
    return nextRecorded;
  };

  /**
   * L'état à ranger en quittant l'écran, pour pouvoir le rouvrir intact (cf. `EtatStreet`).
   *
   * ⚠️ Il se construit à partir des valeurs QU'ON PASSE, jamais des états React : au moment où l'on
   * sort, les `setQueue`/`setRecorded` de l'action en cours n'ont pas encore été appliqués. Lire
   * `queue` ou `recorded` ici rangerait l'avant-dernier coup, et le retour ferait réapparaître une
   * action déjà jouée.
   */
  const etatCourant = (
    nextQueue: string[],
    nextActive: string[],
    nextRecorded: Action[],
    nextOrderCounter: number,
    suite: { betAmount?: number; contributions?: Record<string, number>; history?: Snapshot[] } = {}
  ): EtatStreet => ({
    queue: nextQueue,
    active: nextActive,
    betAmount: suite.betAmount ?? betAmount,
    contributions: suite.contributions ?? contributions,
    recorded: nextRecorded,
    orderCounter: nextOrderCounter,
    boardCards,
    boardCards2,
    history: suite.history ?? history,
  });

  // Le compteur d'ordre du PREMIER coup de cette street. `orderCounter` vaut toujours cette base
  // plus le nombre d'actions déjà enregistrées — c'est l'invariant de `pushAction`, et il tient
  // aussi bien sur une reprise, où l'on remonte à la base au lieu de supposer que `startOrder`
  // n'a pas bougé entre les deux passages.
  const baseOrdre = reprise ? reprise.orderCounter - reprise.recorded.length : startOrder;

  /**
   * ⚠️ `suite` porte les mises que l'action en cours vient de poser. Sans elle, l'état rangé lirait
   * `contributions` et `betAmount` dans l'état React — pas encore appliqués à cet instant — et la
   * street rouverte afficherait le pot d'AVANT le dernier coup (mesuré : 47 € au lieu de 62).
   */
  const finishIfDone = (
    nextQueue: string[],
    nextActive: string[],
    nextRecorded: Action[],
    suite: { betAmount?: number; contributions?: Record<string, number>; history?: Snapshot[] } = {}
  ) => {
    // `orderCounter` n'a pas encore encaissé le `+1` de `pushAction` : on le recalcule sur la
    // longueur remontée, seule source qui soit à jour ici.
    onEtat?.(etatCourant(nextQueue, nextActive, nextRecorded, baseOrdre + nextRecorded.length, suite));
    if (nextActive.length <= 1) {
      onHandEndsEarly(finalBoard(), finalBoard2(), nextRecorded, nextActive);
      return true;
    }
    if (nextQueue.length === 0) {
      onComplete(finalBoard(), finalBoard2(), nextRecorded, nextActive);
      return true;
    }
    return false;
  };

  const handleFold = () => {
    const pile = pushHistory();
    const nextRecorded = pushAction('fold', undefined);
    const nextActive = active.filter((id) => id !== currentSeatId);
    const nextQueue = queue.slice(1);
    setActive(nextActive);
    setQueue(nextQueue);
    finishIfDone(nextQueue, nextActive, nextRecorded, { history: pile });
  };

  // Raccourci "fold jusqu'à" : coucher d'un coup tous les sièges de la file AVANT le siège visé,
  // au lieu de cliquer Fold un par un — le cas le plus courant en préflop (personne d'intéressant
  // devant une position donnée). Un seul appel à `pushHistory` pour tout le lot : "Annuler" défait
  // le raccourci en un clic plutôt que de devoir remonter fold par fold. `pushAction` n'est
  // volontairement pas réutilisé en boucle : il lit `recorded`/`orderCounter` depuis la closure du
  // render en cours, donc plusieurs appels d'affilée dans la même passe se marcheraient dessus
  // (chacun ignorant les folds déjà accumulés par les précédents) — l'accumulation se fait ici dans
  // des variables locales, avec un seul set d'état à la fin.
  const handleFoldUntil = (targetSeatId: string) => {
    const targetIndex = queue.indexOf(targetSeatId);
    if (targetIndex <= 0) return;
    const pile = pushHistory();
    let nextRecorded = recorded;
    let nextActive = active;
    let remainingQueue = queue;
    let counter = orderCounter;
    for (let i = 0; i < targetIndex; i++) {
      const foldingSeatId = remainingQueue[0];
      nextRecorded = [
        ...nextRecorded,
        { id: `${street}-${counter}`, street, seatId: foldingSeatId, type: 'fold', amount: undefined, order: counter },
      ];
      nextActive = nextActive.filter((id) => id !== foldingSeatId);
      remainingQueue = remainingQueue.slice(1);
      counter += 1;
    }
    setRecorded(nextRecorded);
    setOrderCounter(counter);
    setActive(nextActive);
    setQueue(remainingQueue);
    finishIfDone(remainingQueue, nextActive, nextRecorded, { history: pile });
  };

  // Pendant de "fold jusqu'à" quand personne n'a misé (betAmount === 0) : passer d'un coup tous les
  // sièges AVANT le siège visé en "check". Utile typiquement au flop d'un bomb pot, où checker est
  // l'action naturelle (rien à suivre) — sans retirer "fold jusqu'à", qui reste pertinent (certaines
  // salles jouent le bomb pot en "fold or pot"). Même accumulation locale que `handleFoldUntil` pour
  // ne pas se marcher dessus sur les lectures de closure ; les checks ne changent NI le niveau de mise
  // NI la liste des joueurs actifs, donc `active` est inchangé.
  const handleCheckUntil = (targetSeatId: string) => {
    const targetIndex = queue.indexOf(targetSeatId);
    if (targetIndex <= 0) return;
    const pile = pushHistory();
    let nextRecorded = recorded;
    let remainingQueue = queue;
    let counter = orderCounter;
    for (let i = 0; i < targetIndex; i++) {
      const checkingSeatId = remainingQueue[0];
      nextRecorded = [
        ...nextRecorded,
        { id: `${street}-${counter}`, street, seatId: checkingSeatId, type: 'check', amount: undefined, order: counter },
      ];
      remainingQueue = remainingQueue.slice(1);
      counter += 1;
    }
    setRecorded(nextRecorded);
    setOrderCounter(counter);
    setQueue(remainingQueue);
    finishIfDone(remainingQueue, active, nextRecorded, { history: pile });
  };

  const handleCheck = () => {
    const pile = pushHistory();
    const nextRecorded = pushAction('check', undefined);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded, { history: pile });
  };

  const handleCall = () => {
    const pile = pushHistory();
    // Suivre est plafonné au stack : si le joueur ne peut pas couvrir, il suit à tapis.
    const nextRecorded = pushAction('call', callTo);
    const nextContributions = { ...contributions, [currentSeatId]: callTo };
    setContributions(nextContributions);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded, { contributions: nextContributions, history: pile });
  };

  // Mise/relance à un montant cumulé sur la street (déjà plafonné au stack en amont).
  const commitBetTo = (amount: number, type: ActionType) => {
    const pile = pushHistory();
    const nextRecorded = pushAction(type, amount);
    const nextQueue = reorderAfter(active.filter((id) => id !== currentSeatId), currentSeatId);
    const nextContributions = { ...contributions, [currentSeatId]: amount };
    setBetAmount(amount);
    setContributions(nextContributions);
    setQueue(nextQueue);
    setAmountInput('');
    setEnteringAmount(null);
    finishIfDone(nextQueue, active, nextRecorded, { betAmount: amount, contributions: nextContributions, history: pile });
  };

  const confirmAmount = () => {
    // ⚠️ La VIRGULE est le séparateur décimal en français, et le clavier d'iOS en propose une.
    // `Number("2,5")` vaut `NaN` : l'ancien code sortait alors sur un `if (!amount) return` muet —
    // bouton « Valider » sans effet, aucun message, rien à corriger pour la personne. `ContextStep`
    // normalisait déjà la virgule, seul cet écran-ci avait été oublié.
    const amountSaisi = parseFloat(amountInput.replace(',', '.'));
    if (!Number.isFinite(amountSaisi) || amountSaisi <= 0) {
      setAmountError('Entre un montant valide, par exemple 2,5.');
      return;
    }
    // On ne peut jamais miser plus que son stack.
    const amount = Math.min(amountSaisi, currentRemaining);
    if (amount <= betAmount && amount < currentRemaining) {
      // Deuxième sortie autrefois silencieuse : relance insuffisante, sauf si c'est un tapis.
      setAmountError(`Il faut dépasser ${fmt(betAmount)} pour relancer, ou faire tapis.`);
      return;
    }
    setAmountError(null);
    commitBetTo(amount, enteringAmount === 'raise' ? 'raise' : 'bet');
  };

  const handleAllIn = () => {
    if (currentRemaining <= 0) return;
    if (currentRemaining <= betAmount) {
      // Pas de quoi relancer : tapis = suivre à tapis (les autres restent redevables du betAmount).
      // ⚠️ Plus atteignable depuis le bouton, qui se retire dans ce cas précis (cf. le socle) —
      // gardée parce qu'elle EST la définition de ce que fait un tapis qui ne couvre pas la mise,
      // et parce que `handleAllIn` redeviendrait faux si un futur appelant s'y branchait.
      const pile = pushHistory();
      const nextRecorded = pushAction('call', currentRemaining);
      const nextContributions = { ...contributions, [currentSeatId]: currentRemaining };
      setContributions(nextContributions);
      const nextQueue = queue.slice(1);
      setQueue(nextQueue);
      finishIfDone(nextQueue, active, nextRecorded, { contributions: nextContributions, history: pile });
    } else {
      commitBetTo(currentRemaining, betAmount > 0 ? 'raise' : 'bet');
    }
  };

  /**
   * LA TABLE, ALIMENTÉE PAR CE QUE CET ÉCRAN A DÉJÀ SOUS LA MAIN.
   * ────────────────────────────────────────────────────────────
   * C'est la deuxième source de `TableVue` : là où le replayer branche `computeHandState` sur une
   * main publiée, on branche ici l'état vivant de la saisie. Rien n'est recalculé — `active`,
   * `contributions`, `remainingFor` et `currentSeatId` existaient déjà, ils servaient seulement à
   * afficher du texte.
   *
   * Ce que la table sait, l'auteur le sait : ses propres cartes, et rien de celles des adversaires
   * (dos de carte, comme le verra le lecteur). `holeCards` n'est donc greffé que sur Hero.
   */
  const dernierEnregistre = recorded[recorded.length - 1];
  /**
   * LE FANTÔME DE LA MISE EN COURS DE SAISIE.
   * ─────────────────────────────────────────
   * Saisir un montant est le seul moment du créateur où l'on tape un chiffre sans voir ce qu'il
   * fait. La table le montre : le jeton se pose devant le miseur (creux, montant estompé et en
   * italique) et son tapis est remplacé par ce qu'il RESTERAIT. Le pot du centre, lui, ne bouge
   * pas — voir plus bas.
   *
   * Deux garde-fous, et ils comptent autant que l'effet :
   *
   *   1. ON NE MONTRE JAMAIS UN MONTANT ILLÉGAL. Le filtre ci-dessous rejoue exactement les règles
   *      de `confirmAmount` — montant lisible, plafonné au tapis, relance qui dépasse la mise à
   *      suivre sauf tapis. Ce qui serait refusé à la validation ne doit pas s'afficher comme si
   *      c'était joué : le fantôme s'abstient, et le message d'erreur reste le seul retour.
   *   2. ON NE REJOUE PAS L'ANIMATION À CHAQUE FRAPPE — traité côté `SeatView` (clé stable et
   *      apparition désactivée en fantôme), sans quoi taper « 1 2 5 » ferait clignoter le jeton
   *      trois fois.
   */

  const fantome = (() => {
    if (!enteringAmount || !currentSeatId) return null;
    const saisi = parseFloat(amountInput.replace(',', '.'));
    if (!Number.isFinite(saisi) || saisi <= 0) return null;
    const montant = Math.min(saisi, currentRemaining);
    if (montant <= betAmount && montant < currentRemaining) return null;
    return { seatId: currentSeatId, montant, ajout: montant - (contributions[currentSeatId] ?? 0) };
  })();

  const siegesTable: SiegeAffiche[] = seats.map((s) => {
    const couche = !active.includes(s.id);
    const miseur = fantome?.seatId === s.id;
    return {
      seat:
        s.isHero && heroCards.length > 0
          ? { ...s, holeCards: hero.emplacements as Card[] }
          : s,
      folded: couche,
      stackRemaining: Math.max(remainingFor(s.id) - (miseur ? fantome!.ajout : 0), 0),
      currentBet: miseur ? fantome!.montant : contributions[s.id],
      miseFantome: miseur,
      // Le halo doré remplace la phrase « À X de jouer », retirée le 30/08 : c'est le seul signal
      // de qui doit parler. Il ne s'allume que si la street est saisissable — pendant le choix du
      // board, personne n'a encore la parole.
      isActive: boardComplete && s.id === currentSeatId,
      justFolded: dernierEnregistre?.seatId === s.id && dernierEnregistre.type === 'fold',
      justChecked: dernierEnregistre?.seatId === s.id && dernierEnregistre.type === 'check',
      straddleLabel: straddleSeatLabel(seats, priorActions, s.id),
      // Ses cartes se changent d'un tap, comme celles du board — mais seulement une fois le board de
      // la street posé (cf. `tousLesEmplacements`), pour qu'il n'y ait jamais deux trous en concurrence.
      onCartePress: s.isHero && boardPret && onCorrigerHero ? hero.taper : undefined,
      // Une carte retirée pour être changée laisse son emplacement en pointillés, comme sur le board.
      cartesAttendues: s.isHero && !heroPret,
    };
  });

  /**
   * LE NOM DE CELUI QUI PARLE — constat 3 de l'audit du 01/09/2026.
   * ────────────────────────────────────────────────────────────────
   * Deux écrans consécutifs au flop portaient des boutons RIGOUREUSEMENT identiques (« Check ·
   * Miser · Tapis (985 €) ») : le seul signal de qui avait la parole était le halo doré, un
   * contraste de 2:1 posé jusqu'à 560 px au-dessus des boutons qu'il gouverne. Et l'erreur est
   * silencieuse — miser à la place de son adversaire produit une main fausse que rien ne signale.
   *
   * La phrase « À X de jouer » avait été retirée le 30/08 pour de bonnes raisons, chiffrées : elle
   * rendait 42 px et faisait passer le 10 joueurs sur SE. L'objection portait sur une ligne EN PLUS.
   * Ici elle va dans la rangée fixe de 28 px qui existe déjà sous la table et qui est vide tant
   * qu'il n'y a rien à annuler : coût vertical réel, ZÉRO.
   *
   * Le mot est calqué sur `SeatView` (le héros porte son nom s'il s'en est donné un, sinon
   * « Hero » — jamais sa position) : la rangée doit dire EXACTEMENT ce que dit le badge qui
   * s'allume, sinon elle ajoute une question au lieu d'en fermer une.
   */
  const nomQuiParle = currentSeat
    ? currentSeat.isHero
      ? currentSeat.playerName ?? 'Hero'
      : currentSeat.playerName ??
        straddleSeatLabel(seats, priorActions, currentSeat.id) ??
        currentSeat.position
    : null;

  const table = (
    <TableVue
      sieges={siegesTable}
      board={emplacements}
      // Le second board n'existe qu'en bomb pot double board — absent partout ailleurs.
      board2={doubleBoard ? emplacements2 : undefined}
      // LE POT NE BOUGE PAS pendant une saisie (décision de Victor, 31/08, après l'avoir vu bouger).
      // Le pot est un fait : ce qui est au centre y est. Le jeton fantôme devant le miseur et son
      // tapis projeté disent déjà ce qui se prépare, et ils le disent comme un conditionnel — un
      // total qui se réécrit à chaque frappe, lui, se lit comme un acquis.
      pot={potNow}
      gameType={gameType}
      currency={currency}
      bb={bb}
      holeCardCount={holeCardCount(variant)}
      // Deux rangées de board coûtent 41 px au centre, là même où les jetons viennent buter : le
      // format a donc sa propre hauteur ET son propre gabarit, tout dessiné plus petit (cf. layout).
      hauteur={hauteurTableAtelier(seats.length, doubleBoard)}
      gabarit={doubleBoard ? GABARIT_ATELIER_DOUBLE : GABARIT_ATELIER}
      // Au préflop il n'y a pas de board : aucune cible, la table reste inerte comme au feed.
      onCarteBoardPress={emplacements.length > 0 ? taperBoard1 : undefined}
      onCarteBoard2Press={doubleBoard && emplacements2.length > 0 ? taperBoard2 : undefined}
    />
  );

  /**
   * LE SOCLE : ce qu'on tape, toujours au même endroit.
   * ──────────────────────────────────────────────────
   * Les boutons d'action ne défilent plus. C'est le geste le plus répété du créateur — trente à
   * quarante fois par main — et jusqu'ici le sélecteur de cartes les poussait sous le pli au flop
   * (mesuré : 5 px de marge sur un iPhone 14, 172 px manquants sur un SE). Trois états, jamais
   * deux à la fois : on valide un montant, on agit, ou il ne reste plus qu'à passer la street.
   */
  const socleContenu = !boardComplete ? null : !currentSeat ? (
    // `recorded`, et non une liste vide : ce bouton ne servait qu'au cas « plus personne ne peut
    // agir », où rien n'a été saisi ici. Il sert désormais AUSSI à ressortir d'une street rouverte
    // par « ‹ Retour », qui elle a ses actions — les jeter à la sortie annulerait tout le bénéfice.
    <Pressable
      style={styles.primaryButton}
      onPress={() => {
        onEtat?.(etatCourant(queue, active, recorded, orderCounter));
        onComplete(finalBoard(), finalBoard2(), recorded, active);
      }}
    >
      <Text style={styles.primaryText}>Continuer</Text>
    </Pressable>
  ) : enteringAmount ? (
    <View style={styles.row}>
      <Pressable
        style={styles.secondaryButton}
        onPress={() => {
          setAmountError(null);
          setEnteringAmount(null);
        }}
      >
        <Text style={styles.secondaryText}>Annuler</Text>
      </Pressable>
      <Pressable style={styles.primaryButton} onPress={confirmAmount}>
        <Text style={styles.primaryText}>Valider</Text>
      </Pressable>
    </View>
  ) : (
    <View style={styles.row}>
    {canCheck ? (
      <Pressable style={styles.actionButton} onPress={handleCheck}>
        <Text style={styles.actionText}>Check</Text>
      </Pressable>
    ) : (
      <>
        <Pressable style={styles.actionButton} onPress={handleFold}>
          <Text style={styles.actionText}>Fold</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, suivreMetATapis && styles.actionButtonTapis]}
          onPress={handleCall}
        >
          <Text style={styles.actionText}>
            Suivre ({fmt(resteAPoser)}){isCallAllIn ? ' · tapis' : ''}
          </Text>
        </Pressable>
      </>
    )}
    {/* Même traitement que Fold et Suivre : au poker aucune de ces actions n'est
        « la bonne », et Relancer était le seul en orange plein — la couleur d'appel
        de la marque, qui poussait vers la relance sans que ce soit voulu. Seul
        Tapis reste distinct, parce qu'il est irréversible. */}
    {currentRemaining > betAmount && (
      <Pressable
        style={styles.actionButton}
        onPress={() => {
          setAmountError(null);
          setEnteringAmount(betAmount > 0 ? 'raise' : 'bet');
        }}
      >
        <Text style={styles.actionText}>{betAmount > 0 ? 'Relancer' : 'Miser'}</Text>
      </Pressable>
    )}
    {/* « TAPIS » DISPARAÎT QUAND IL NE FAIT QUE DOUBLER « SUIVRE » (Victor, 02/09/2026).
        Tant que le tapis ne dépasse pas la mise en cours, faire tapis N'EST PAS une relance :
        `handleAllIn` le note lui-même comme un suivi (`pushAction('call', currentRemaining)`, avec
        `currentRemaining === callTo` dans ce cas). Les deux boutons produisaient donc exactement
        la même action et le même montant enregistré — et depuis que « Suivre » affiche ce qu'il
        reste à poser, ils l'annonçaient avec deux nombres différents (« Suivre (910€) » à côté de
        « Tapis (1000€) »), ce qui laissait croire à deux gestes distincts.
        Aucune capacité n'est perdue : quand le tapis ne couvre pas la mise, le seul tapis possible
        est un suivi à tapis, et c'est « Suivre » qui le fait. La rangée tombe alors à deux boutons,
        Fold et Suivre — l'absence de « Relancer » ET de « Tapis » dit à elle seule qu'il n'y a plus
        de quoi relancer. */}
    {currentRemaining > betAmount && (
      <Pressable style={styles.allInButton} onPress={handleAllIn}>
        <Text style={styles.allInText}>Tapis ({fmt(currentRemaining)})</Text>
      </Pressable>
    )}
    </View>
  );

  return (
    <WizardScreen
      title={STREET_TITLES[street]}
      /* Pas de sous-titre : la table dit ce que la phrase disait. */
      onBack={onBack}
      zoneFixe={table}
      socle={socleContenu}
      rangeeFixe={
        <>
          {/* Plus de titre « Le turn » : la carte attendue se dessine en pointillés SUR LE BOARD,
              à sa place exacte. Rien à annoncer que la table ne montre déjà. La place ainsi libérée
              porte désormais le nom de celui qui a la parole (cf. `nomQuiParle`) — et rien pendant
              le choix du board, où personne ne l'a encore. */}
          {boardComplete && nomQuiParle ? (
            <Text style={styles.aQuiDeJouer} numberOfLines={1}>
              À <Text style={styles.aQuiNom}>{nomQuiParle}</Text> de jouer
            </Text>
          ) : (
            <View />
          )}
          {history.length > 0 ? (
            <Pressable onPress={handleUndo} style={styles.undoButton}>
              <Text style={styles.undoText}>↩ Annuler</Text>
            </Pressable>
          ) : null}
        </>
      }
      step={step}
      totalSteps={totalSteps}
      footerLink={
        arretPossible
          ? {
              label: 'Arrêter la main ici',
              onPress: () => {
                onEtat?.(etatCourant(queue, active, recorded, orderCounter));
                onStop(finalBoard(), finalBoard2(), recorded, active, currentSeatId);
              },
            }
          : undefined
      }
    >
      {/*
        La condition porte sur les EMPLACEMENTS, pas sur le board : au préflop il n'y a aucune carte
        de board à choisir (`boardCount` vaut 0), mais retirer une carte de Hero y ouvre quand même
        un trou — et sans sélecteur, ce trou ne se remplissait jamais. Signalé par Victor le 31/08.
      */}
      {tousLesEmplacements.length > 0 && !boardComplete && (
        <View style={styles.boardSection}>
          {/*
            UN SEUL SÉLECTEUR, même en double board. Ni aperçu, ni libellés « Board 1 / Board 2 » :
            les emplacements sont SUR LE FEUTRE, à leur place, et c'est le trou en pointillés qui dit
            où ira la prochaine carte. Deux grilles obligeaient à défiler pour attaquer le second
            board une fois le premier fini — pour choisir dans une liste identique à celle du dessus.
          */}
          <MultiCardPicker
            sansApercu
            count={tousLesEmplacements.length}
            selected={tousLesEmplacements}
            disabledCards={disponiblesExclues}
            onChange={surChoixDuSelecteur}
          />
        </View>
      )}

      {boardComplete && (
        <View style={styles.actionSection}>
          {/*
            LE RAPPEL TEXTUEL A DISPARU ICI — pot, liste des actions, rangée des stacks.
            La table au-dessus dit les trois, et mieux : elle montre le pot au centre, les mises
            posées devant chaque joueur, les stacks sur les badges, et surtout ce que le texte ne
            disait pas — les streets précédentes, les positions, et les cartes de Hero.
            La liste des actions, en plus, se coupait en silence à la septième (`maxHeight: 100`
            sans défilement). Décision de Victor du 30/08/2026 : elle disparaît, une version texte
            copiable apparaîtra en fin de création et dans le menu « ⋯ » d'une main publiée.
          */}
          {currentSeat ? (
            <>
              {enteringAmount ? (
                <View>
                  {/* Raccourcis de taille (BB au préflop, %pot ensuite), pour miser/relancer sans calcul
                      de tête. Un tap POSE la mise et passe au joueur suivant : le montant vient d'être
                      désigné, redemander « Valider » ne confirmerait rien de neuf.
                      C'est la mécanique des chips « Fold/Check rapide jusqu'à » de cet écran, qu'elles
                      partageaient déjà en apparence sans la partager en comportement — d'où le mot
                      « rapide » repris ici, qui y signifie déjà « un tap et c'est joué ».
                      Un mauvais tap se répare par « ↩ Annuler » juste au-dessus (`commitBetTo` empile
                      un snapshot). Le champ en dessous reste le chemin du montant libre.

                      ⚠️ LES REMONTER AU-DESSUS DU CHAMP NE SERT À RIEN — essayé le 02/09/2026, et
                      mesuré. Le clavier iOS ne rétrécit PAS la fenêtre de mise en page : l'app reste
                      haute de tout l'écran dans une bande visible réduite, et Safari fait glisser la
                      page ENTIÈRE jusqu'en bas. La position du champ n'est pas le déclencheur ; le
                      correctif a été fait ailleurs, en calant la racine sur la bande réellement
                      visible (`src/web/hauteurVisible.ts`). */}
                  {sizeShortcuts.length > 0 && (
                    <>
                      <Text style={styles.sectionLabel}>
                        {enteringAmount === 'raise' ? 'Relance rapide' : 'Mise rapide'}
                      </Text>
                      <View style={styles.potShortcutsRow}>
                        {sizeShortcuts.map(({ label, amount }) => (
                          <Pressable
                            key={label}
                            style={styles.potShortcutChip}
                            onPress={() => commitBetTo(amount, enteringAmount === 'raise' ? 'raise' : 'bet')}
                          >
                            <Text style={styles.potShortcutLabel}>{label}</Text>
                            <Text style={styles.potShortcutValue}>{fmt(amount)}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </>
                  )}
                  {/* PLUS DE `TextInput` ICI — et c'est le but, pas un effet de bord.
                      Le clavier d'iOS prend 386 px, 44 % de l'écran, pour quatre chiffres au plus.
                      Ce qui restait (une trentaine de pixels) ne suffisait pas à montrer ce champ,
                      qui en fait 44 : on tapait sans voir ce qu'on tapait (Victor, 03/09/2026).
                      Une simple zone de texte ne peut pas prendre le focus, donc iOS n'ouvre rien,
                      et les 873 px de l'écran restent à nous. Le détail est dans
                      `PaveNumerique.tsx`. */}
                  <View style={styles.amountInput}>
                    <Text
                      style={[styles.amountTexte, !amountInput && styles.amountPlaceholder]}
                      numberOfLines={1}
                    >
                      {amountInput || `Montant (max ${fmt(currentRemaining)})`}
                    </Text>
                  </View>
                  <PaveNumerique
                    onTouche={(c) => {
                      setAmountInput((v) => ajouterAuMontant(v, c));
                      setAmountError(null);
                    }}
                    onEffacer={() => {
                      setAmountInput(effacerDernier);
                      setAmountError(null);
                    }}
                    onToutEffacer={() => {
                      setAmountInput('');
                      setAmountError(null);
                    }}
                  />

                  {amountError && <Text style={styles.amountError}>{amountError}</Text>}
                </View>
              ) : (
                <>
                  {(street === 'preflop' || bombPot) && betAmount === 0 && queue.length > 1 && (
                    // Personne n'a misé : proposer aussi le batch "check" (cf. handleCheckUntil).
                    <View style={styles.foldUntilSection}>
                      <Text style={styles.sectionLabel}>Check rapide jusqu'à</Text>
                      <View style={styles.potShortcutsRow}>
                        {queue.slice(1).map((seatId) => {
                          const seat = seats.find((s) => s.id === seatId)!;
                          return (
                            <Pressable
                              key={seatId}
                              style={styles.checkUntilChip}
                              onPress={() => handleCheckUntil(seatId)}
                            >
                              <Text style={styles.foldUntilChipText}>{seatDisplay(seat, seats, priorActions)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {(street === 'preflop' || bombPot) && queue.length > 1 && (
                    <View style={styles.foldUntilSection}>
                      <Text style={styles.sectionLabel}>Fold rapide jusqu'à</Text>
                      <View style={styles.potShortcutsRow}>
                        {queue.slice(1).map((seatId) => {
                          const seat = seats.find((s) => s.id === seatId)!;
                          return (
                            <Pressable
                              key={seatId}
                              style={styles.foldUntilChip}
                              onPress={() => handleFoldUntil(seatId)}
                            >
                              <Text style={styles.foldUntilChipText}>{seatDisplay(seat, seats, priorActions)}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </>
              )}
            </>
          ) : (
            // Plus personne ne peut agir : le bouton « Continuer » est descendu dans le socle.
            <Text style={styles.allInNote}>
              {revenuSurStreetFinie
                ? 'Cette street est déjà jouée. « ↩ Annuler » revient dessus action par action.'
                : 'Les joueurs restants sont à tapis.'}
            </Text>
          )}
        </View>
      )}
    </WizardScreen>
  );
}

/**
 * LE COSTUME « TAPIS » : liseré or, fond crème. Défini UNE fois et porté par les deux boutons qui
 * disent la même chose — « Tapis », et « Suivre » quand suivre consomme tout le tapis. Deux copies
 * auraient dérivé au premier ajustement de teinte, et le lecteur aurait alors deux signaux là où
 * il n'y a qu'un fait.
 *
 * Ce n'est PAS l'orange de marque (`colors.action`) : c'est la paire or + crème qui, dans cette
 * app, veut dire « celui-là est à part » (même couple que `cardSelected` dans le sélecteur de
 * cartes), et non « fais celui-là ».
 *
 * Le liseré passe aussi de 1 à 1,5 px : la distinction ne repose donc pas sur la seule teinte, et
 * reste perceptible pour qui ne la voit pas.
 */
const COSTUME_TAPIS = {
  borderWidth: 1.5,
  borderColor: colors.gold,
  backgroundColor: '#FBF3DC',
} as const;

const styles = StyleSheet.create({
  boardSection: {
    marginBottom: 8,
  },
  boardLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  boardLabel2: {
    marginTop: 8,
  },
  // Le filet qui séparait le sélecteur de cartes des actions est remonté dans la rangée fixe, sous
  // la table (cf. `WizardScreen`) : la vraie frontière n'est plus entre deux blocs de contenu, elle
  // est entre ce qui ne bouge pas et ce qui défile.
  actionSection: {
    marginTop: 4,
  },
  potShortcutsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  potShortcutChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.5)',
    backgroundColor: '#FBF3DC',
    alignItems: 'center',
  },
  potShortcutLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  potShortcutValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  foldUntilSection: {
    marginBottom: 14,
  },
  // Coiffe les trois rangées de chips à tap direct (fold jusqu'à, check jusqu'à, mise rapide).
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  foldUntilChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: borders.default,
    backgroundColor: tints.faint,
  },
  // Même forme que les chips "fold jusqu'à" mais teinte felt distincte : les deux rangées listent les
  // mêmes sièges pour des actions opposées, la couleur évite le mauvais tap.
  checkUntilChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: borders.strong,
    backgroundColor: tints.light,
  },
  foldUntilChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  // `flexShrink` : un nom long se coupe plutôt que de pousser « ↩ Annuler » hors de l'écran — les
  // deux occupants de la rangée sont posés en `space-between`, sans quoi le plus bavard gagne.
  aQuiDeJouer: {
    fontSize: 13,
    color: colors.textSecondary,
    flexShrink: 1,
    paddingRight: 8,
  },
  aQuiNom: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: tints.light,
  },
  undoText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: borders.default,
  },
  actionButtonTapis: COSTUME_TAPIS,
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  allInButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    ...COSTUME_TAPIS,
  },
  allInText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  allInNote: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  // Ce n'est plus un `TextInput` mais une zone de texte (cf. le commentaire au point d'usage) :
  // le dessin ne change pas d'un pixel, `justifyContent` remplace juste le centrage vertical que
  // le champ faisait tout seul.
  amountInput: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    justifyContent: 'center',
    minHeight: 44,
  },
  amountTexte: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  amountPlaceholder: {
    color: colors.textSecondary,
  },
  amountError: {
    color: colors.cardTextRed,
    fontSize: 13,
    marginTop: -4,
    marginBottom: 10,
  },
  secondaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: borders.default,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: colors.action,
  },
  primaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
