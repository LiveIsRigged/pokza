import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import type { Action, ActionType, Card, GameType, Seat, Street, Variant } from '../../types/poker';
import { borders, colors, tints, typography } from '../../theme/theme';
import { getActingOrder, getActingOrderAfter } from '../positions';
import { WizardScreen } from '../WizardScreen';
import { MultiCardPicker } from '../MultiCardPicker';
import { formatChipAmount, roundMoney } from '../../utils/chipFormat';
import { nextBetAbove, roundBet, type BetRoundingContext } from '../../utils/betRounding';
import { straddleSeatLabel } from '../../engine/handEngine';
import type { CodeDevise } from '../../utils/currency';

const STREET_TITLES: Record<Street, string> = {
  preflop: 'Préflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

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
  gameType?: GameType;
  /** Devise de la main (cf. `DEVISES`) ; absente = euro. Sans effet en tournoi. */
  currency?: CodeDevise;
  /** Main jouée en bomb pot : les raccourcis « check/fold rapide jusqu'à » restent proposés à chaque
   * street (checker/folder en cascade est courant au flop d'un bomb pot). Hors bomb pot, ils ne sont
   * gardés qu'au préflop (fold général jusqu'à une position) et retirés en postflop. */
  bombPot?: boolean;
  onBack: () => void;
  onComplete: (boardCards: Card[], board2Cards: Card[], actions: Action[], remainingActiveSeatIds: string[]) => void;
  onHandEndsEarly: (
    boardCards: Card[],
    board2Cards: Card[],
    actions: Action[],
    remainingActiveSeatIds: string[]
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
  gameType = 'cash',
  currency,
  bombPot = false,
  onBack,
  onComplete,
  onHandEndsEarly,
  step,
  totalSteps,
}: StreetStepProps) {
  const [boardCards, setBoardCards] = useState<(Card | undefined)[]>(Array(boardCount).fill(undefined));
  const [boardCards2, setBoardCards2] = useState<(Card | undefined)[]>(Array(boardCount2).fill(undefined));

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
  const [queue, setQueue] = useState<string[]>(order.map((s) => s.id));
  const [active, setActive] = useState<string[]>(activeSeatIds);
  const [betAmount, setBetAmount] = useState(initialBetAmount);
  const [contributions, setContributions] = useState<Record<string, number>>(initialContributions);
  const [recorded, setRecorded] = useState<Action[]>([]);
  const [orderCounter, setOrderCounter] = useState(startOrder);
  const [amountInput, setAmountInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [enteringAmount, setEnteringAmount] = useState<'bet' | 'raise' | null>(null);
  const [history, setHistory] = useState<Snapshot[]>([]);

  const boardComplete = boardCards.every(Boolean) && boardCards2.every(Boolean);
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

  const pushHistory = () => {
    setHistory((h) => [...h, { queue, active, betAmount, contributions, recorded, orderCounter }]);
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

  const finishIfDone = (nextQueue: string[], nextActive: string[], nextRecorded: Action[]) => {
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
    pushHistory();
    const nextRecorded = pushAction('fold', undefined);
    const nextActive = active.filter((id) => id !== currentSeatId);
    const nextQueue = queue.slice(1);
    setActive(nextActive);
    setQueue(nextQueue);
    finishIfDone(nextQueue, nextActive, nextRecorded);
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
    pushHistory();
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
    finishIfDone(remainingQueue, nextActive, nextRecorded);
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
    pushHistory();
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
    finishIfDone(remainingQueue, active, nextRecorded);
  };

  const handleCheck = () => {
    pushHistory();
    const nextRecorded = pushAction('check', undefined);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  const handleCall = () => {
    pushHistory();
    // Suivre est plafonné au stack : si le joueur ne peut pas couvrir, il suit à tapis.
    const nextRecorded = pushAction('call', callTo);
    setContributions((c) => ({ ...c, [currentSeatId]: callTo }));
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    finishIfDone(nextQueue, active, nextRecorded);
  };

  // Mise/relance à un montant cumulé sur la street (déjà plafonné au stack en amont).
  const commitBetTo = (amount: number, type: ActionType) => {
    pushHistory();
    const nextRecorded = pushAction(type, amount);
    const nextQueue = reorderAfter(active.filter((id) => id !== currentSeatId), currentSeatId);
    setBetAmount(amount);
    setContributions((c) => ({ ...c, [currentSeatId]: amount }));
    setQueue(nextQueue);
    setAmountInput('');
    setEnteringAmount(null);
    finishIfDone(nextQueue, active, nextRecorded);
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
      pushHistory();
      const nextRecorded = pushAction('call', currentRemaining);
      setContributions((c) => ({ ...c, [currentSeatId]: currentRemaining }));
      const nextQueue = queue.slice(1);
      setQueue(nextQueue);
      finishIfDone(nextQueue, active, nextRecorded);
    } else {
      commitBetTo(currentRemaining, betAmount > 0 ? 'raise' : 'bet');
    }
  };

  return (
    <WizardScreen
      title={STREET_TITLES[street]}
      subtitle={boardCount > 0 ? 'Cartes puis actions' : 'Actions des joueurs'}
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
    >
      {boardCount > 0 && (
        <View style={styles.boardSection}>
          {boardCount2 > 0 && <Text style={styles.boardLabel}>Board 1</Text>}
          <MultiCardPicker
            count={boardCount}
            selected={boardCards}
            // En double board, une carte prise sur le board 2 ne doit pas être re-sélectionnable ici.
            disabledCards={[...usedCardsElsewhere, ...(boardCards2.filter(Boolean) as Card[])]}
            onChange={(next) => {
              const filled = [...next];
              while (filled.length < boardCount) filled.push(undefined);
              setBoardCards(filled);
            }}
          />
          {boardCount2 > 0 && (
            <>
              <Text style={[styles.boardLabel, styles.boardLabel2]}>Board 2</Text>
              <MultiCardPicker
                count={boardCount2}
                selected={boardCards2}
                disabledCards={[...usedCardsElsewhere, ...(boardCards.filter(Boolean) as Card[])]}
                onChange={(next) => {
                  const filled = [...next];
                  while (filled.length < boardCount2) filled.push(undefined);
                  setBoardCards2(filled);
                }}
              />
            </>
          )}
        </View>
      )}

      {boardComplete && (
        <View style={styles.actionSection}>
          {/* Rappel du pot : repère pour estimer une taille de mise (ex: "environ 1/3 pot") */}
          <View style={styles.potRow}>
            <Text style={styles.potLabel}>Pot</Text>
            <Text style={styles.potValue}>{fmt(potNow)}</Text>
          </View>

          <View style={styles.summary}>
            {recorded.map((a) => (
              <Text key={a.id} style={styles.summaryLine}>
                {seatDisplay(seats.find((s) => s.id === a.seatId)!, seats, priorActions)} · {a.type}
                {a.amount ? ` ${fmt(a.amount)}` : ''}
              </Text>
            ))}
          </View>

          {/* Rappel des stacks restants pour chaque joueur encore en jeu */}
          <View style={styles.stacksRow}>
            {getActingOrder(seats, street)
              .filter((s) => active.includes(s.id))
              .map((s) => (
                <View key={s.id} style={styles.stackChip}>
                  <Text style={styles.stackChipName}>{seatDisplay(s, seats, priorActions)}</Text>
                  <Text style={styles.stackChipValue}>{fmt(Math.max(remainingFor(s.id), 0))}</Text>
                </View>
              ))}
          </View>

          {currentSeat ? (
            <>
              <View style={styles.actorRow}>
                <Text style={[typography.postTitle, styles.actor]}>
                  {/* "Hero agit", jamais "Hero (CO) agit" : sur cette ligne, Hero c'est déjà "toi"
                      sans ambiguïté possible — la position entre parenthèses n'ajoute rien qu'un
                      autre joueur ne pourrait tirer du contexte, contrairement au résumé des
                      actions et à la liste des stacks juste au-dessus, où elle aide à s'y retrouver
                      entre plusieurs sièges. */}
                  {currentSeat.isHero ? currentSeat.playerName ?? 'Hero' : seatDisplay(currentSeat, seats, priorActions)} agit · reste{' '}
                  {fmt(Math.max(remainingFor(currentSeatId), 0))}
                </Text>
                {history.length > 0 && (
                  <Pressable onPress={handleUndo} style={styles.undoButton}>
                    <Text style={styles.undoText}>↩ Annuler</Text>
                  </Pressable>
                )}
              </View>

              {enteringAmount ? (
                <View>
                  {/* Raccourcis de taille (BB au préflop, %pot ensuite), pour miser/relancer sans calcul
                      de tête. Un tap POSE la mise et passe au joueur suivant : le montant vient d'être
                      désigné, redemander « Valider » ne confirmerait rien de neuf, et le clavier
                      numérique (le champ est en `autoFocus`) est justement en travers du chemin.
                      C'est la mécanique des chips « Fold/Check rapide jusqu'à » de cet écran, qu'elles
                      partageaient déjà en apparence sans la partager en comportement — d'où le mot
                      « rapide » repris ici, qui y signifie déjà « un tap et c'est joué ».
                      Un mauvais tap se répare par « ↩ Annuler » juste au-dessus (`commitBetTo` empile
                      un snapshot). Le champ en dessous reste le chemin du montant libre. */}
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
                  <TextInput
                    style={styles.amountInput}
                    keyboardType="numeric"
                    autoFocus
                    placeholder={`Montant (max ${fmt(currentRemaining)})`}
                    value={amountInput}
                    onChangeText={(t) => {
                      setAmountInput(t);
                      setAmountError(null);
                    }}
                  />
                  {amountError && <Text style={styles.amountError}>{amountError}</Text>}
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
                      <Pressable style={styles.actionButton} onPress={handleCall}>
                        <Text style={styles.actionText}>
                          Suivre ({fmt(callTo)}){isCallAllIn ? ' · tapis' : ''}
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
                  <Pressable style={styles.allInButton} onPress={handleAllIn}>
                    <Text style={styles.allInText}>Tapis ({fmt(currentRemaining)})</Text>
                  </Pressable>
                  </View>
                </>
              )}
            </>
          ) : (
            // Plus personne ne peut agir (tous les joueurs restants sont à tapis) : on passe la street.
            <View>
              <Text style={styles.allInNote}>Les joueurs restants sont à tapis.</Text>
              <Pressable style={styles.primaryButton} onPress={() => onComplete(finalBoard(), finalBoard2(), [], active)}>
                <Text style={styles.primaryText}>Continuer</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </WizardScreen>
  );
}

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
  actionSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
    paddingTop: 16,
    marginTop: 4,
  },
  potRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 12,
  },
  potLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  potValue: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.tableFelt,
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
  summary: {
    marginBottom: 12,
    maxHeight: 100,
  },
  summaryLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  stacksRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  stackChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: tints.faint,
  },
  stackChipName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  stackChipValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  actorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actor: {
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
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  allInButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.gold,
    backgroundColor: '#FBF3DC',
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
  amountInput: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 10,
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
