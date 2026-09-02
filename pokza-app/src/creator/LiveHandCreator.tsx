import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Action, Board, Card, Hand, Post, Seat, Street } from '../types/poker';
import { holeCardCount } from '../types/poker';
import type { Group } from '../data/groups';
import { ContextStep } from './steps/ContextStep';
import { HoleCardsStep } from './steps/HoleCardsStep';
import { StreetStep, type EtatStreet } from './steps/StreetStep';
import { ShowdownStep } from './steps/ShowdownStep';
import { StreetCorrectionStep } from './steps/StreetCorrectionStep';
import { ReviewStep } from './steps/ReviewStep';
import { ApercuMainScreen } from './ApercuMainScreen';
import { MainEnTexteScreen } from '../components/post/MainEnTexteScreen';
import type { PartieDecrite } from '../utils/denomination';
import { appliquerContexteAuxSieges, buildSeats } from './positions';
import { straddlesAPoster } from './straddle';
import { committedBySeat } from '../engine/handEngine';
import { champsInvalidants } from './invalidation';
import type { ContextData, Phase, ReviewData, Snapshot } from './types';
import { defaultContextForPlayer, loadContextPrefs, saveContextPrefs } from './contextPrefs';
import { memoriserTable } from './derniereTableStockage';
import { seedStart, type CreatorSeed } from './rehydrate';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { GroupPickerScreen } from '../groups/GroupPickerScreen';
import {
  defaultGroupId,
  loadLastUsedGroupIds,
  orderGroupsByLastUsed,
  rememberUsedGroup,
} from '../groups/lastUsedGroups';
import { TrashIcon } from '../components/ui/icons';

/**
 * QUATRE ÉTAPES, TOUJOURS — constat 7 de l'audit, tranché par Victor le 02/09/2026.
 * ──────────────────────────────────────────────────────────────────────────────
 * Avant : sept écrans numérotés, six en bomb pot (pas de préflop), et l'abattage qui n'était compté
 * NULLE PART — un écran plein, avec deux décisions dessus, qui n'existait pas pour le compteur. Le
 * maximum réel était de huit écrans, annoncés sept.
 *
 * On aurait pu numéroter l'abattage : le total serait alors passé de 7 à 8 EN COURS DE ROUTE, un
 * défaut de plus par-dessus celui du bomb pot. Victor a proposé mieux — réunir le préflop, le flop,
 * le turn, la river et l'abattage en UNE étape. Ce sont les seuls écrans sans bouton « Continuer » :
 * ils s'enchaînent d'eux-mêmes parce que ce n'est pas une suite d'étapes à valider, c'est un seul
 * geste, raconter ce qui s'est passé.
 *
 * Le total devient donc INVARIANT : 4, bomb pot ou non, abattage ou non. Le compteur ne ment plus
 * jamais, et il n'y a plus de cas particulier à tenir.
 *
 * Le prix, assumé : le compteur reste sur « 3/4 » pendant jusqu'à cinq écrans d'affilée. C'est le
 * TITRE qui dit où on en est dans la main — « La main — Flop » (cf. `StreetStep`/`ShowdownStep`) —
 * et le titre nomme son étape sur les quatre, sans exception. Un compteur figé sans rien pour
 * l'expliquer se lirait comme une panne ; ici la réponse est dans le titre, en gros, à gauche.
 *
 * ⚠️ Ces nombres ne servent QU'À L'AFFICHAGE (`step`/`totalSteps` → `WizardScreen`). Rien d'autre
 * ne les lit — ni la navigation, ni « Corriger une main ».
 */
const TOTAL_ETAPES = 4;
const totalStepsFor = (_bombPot: boolean): number => TOTAL_ETAPES;
/** L'ordre des écrans, pour savoir lesquels sont EN AVAL d'une street qu'on vient de modifier. */
const ORDRE_PHASES: Phase[] = [
  'context',
  'holeCards',
  'street-preflop',
  'street-flop',
  'street-turn',
  'street-river',
  'showdown',
  'review',
];

/** Le bomb pot n'a plus de numérotation à lui : ses écrans sont les mêmes, moins le préflop, et
 *  tous logés dans l'étape 3 (cf. `TOTAL_ETAPES`). Le paramètre reste pour ne pas toucher aux
 *  appelants — et pour que la signature dise qu'on a REGARDÉ le cas plutôt que de l'oublier. */
const phaseStepMap = (_bombPot: boolean): Partial<Record<Phase, number>> => ({
  context: 1,
  holeCards: 2,
  'street-preflop': 3,
  'street-flop': 3,
  'street-turn': 3,
  'street-river': 3,
  showdown: 3,
  review: 4,
});

interface LiveHandCreatorProps {
  authorId: string;
  authorName: string;
  /** Format favori et variante préférée du profil : présélectionnent le type de partie et la
   * variante de l'étape 1, tant qu'aucune main n'a encore été créée sur cet appareil (cf.
   * `defaultContextForPlayer`). */
  formatFavori?: string;
  varianteFavorite?: string;
  /** Peut être asynchrone : le créateur attend sa résolution pour relâcher le verrou anti-doublon. */
  onCreated: (post: Post) => void | Promise<void>;
  onCancel: () => void;
  groups: Group[];
  /** Crée un groupe sans quitter le créateur, et renvoie son id (cf. ReviewStep). */
  onCreateGroup: (name: string) => Promise<string>;
  /**
   * Groupe d'où l'on vient (bouton « + Créer une main » d'une page de groupe privé) : la main
   * s'ouvre alors avec « Groupe privé » et ce groupe déjà choisis, au lieu de « Public ». Rien
   * n'est figé pour autant — l'étape de publication montre la puce sélectionnée et l'auteur peut
   * en changer, ce qui compte d'autant plus que l'audience d'une main publiée ne bouge plus
   * ensuite (elle ne se corrige qu'en la republiant, les membres ayant déjà été notifiés).
   */
  destinationGroupId?: string;
  /**
   * Reprise d'une main déjà publiée (« Corriger la main »). Fourni, le créateur s'ouvre DIRECTEMENT
   * sur l'étape de publication, tout étant déjà saisi, et le « ‹ » redescend étape par étape
   * jusqu'à celle qu'on veut refaire. Absent = création normale, à partir d'une table vide.
   */
  initial?: CreatorSeed;
  /**
   * Étape sur laquelle s'ouvrir quand `initial` est fourni. Absente → l'étape de publication, main
   * complète. L'auteur désigne son étape AVANT d'entrer (cf. la feuille « Corriger la main »),
   * plutôt que d'enchaîner les « ‹ » une fois dedans.
   */
  initialPhase?: Phase;
}

export function LiveHandCreator({
  authorId,
  authorName,
  formatFavori,
  varianteFavorite,
  onCreated,
  onCancel,
  groups,
  onCreateGroup,
  destinationGroupId,
  initial,
  initialPhase,
}: LiveHandCreatorProps) {
  // Table de départ d'après le profil, calculée une fois : sert d'état initial ET de base au
  // chargement des réglages mémorisés, qui la recouvrent (cf. l'effet plus bas).
  const playerDefaults = useRef<ContextData>(defaultContextForPlayer({ formatFavori, varianteFavorite }));
  // Calculé une seule fois : `seedStart` est pur, mais le recalculer à chaque rendu ne servirait
  // qu'à jeter le résultat — les états ci-dessous ne lisent leur valeur initiale qu'au montage.
  const [depart] = useState(() => (initial ? seedStart(initial, initialPhase) : null));
  const [phase, setPhase] = useState<Phase>(depart ? depart.phase : 'context');
  /**
   * CORRECTION D'UNE MAIN PUBLIÉE : le prix se paie à la SORTIE d'une étape, pas à son entrée.
   *
   * `depart.etat` porte désormais la main COMPLÈTE (cf. `seedStart`), donc rien n'est perdu tant
   * que l'auteur n'a rien changé d'invalidant. L'étape par laquelle il est entré est la seule à
   * pouvoir publier directement — partout ailleurs, il est reparti dans l'assistant normal et a
   * donc forcément touché à la structure.
   */
  const enCorrection = Boolean(initial);
  const phaseDEntree = depart?.phase ?? null;
  /**
   * L'auteur a demandé à refaire les mises de la street où il était entré : on lui rend
   * l'enregistreur normal sur l'état tronqué. Il n'est donc plus « à l'entrée », alors même que la
   * phase n'a pas bougé — c'est le seul cas où les deux se dissocient.
   */
  const [refaitLesMises, setRefaitLesMises] = useState(false);
  const [context, setContext] = useState<ContextData>(depart?.etat.context ?? playerDefaults.current);
  const [seats, setSeats] = useState<Seat[]>(depart?.etat.seats ?? []);
  // Longueur variable selon la variante (2/4/5) : remplie à l'étape "Tes cartes", et retaillée à la
  // sortie du contexte si la variante a changé (cf. onNext de ContextStep).
  const [heroCards, setHeroCards] = useState<(Card | undefined)[]>(depart?.etat.heroCards ?? []);
  const [actions, setActions] = useState<Action[]>(depart?.etat.actions ?? []);
  const [activeSeatIds, setActiveSeatIds] = useState<string[]>(depart?.etat.activeSeatIds ?? []);
  const [board, setBoard] = useState<Board>(depart?.etat.board ?? {});
  // Second board d'un double board bomb pot ; reste vide en un seul board.
  const [board2, setBoard2] = useState<Board>(depart?.etat.board2 ?? {});
  /**
   * Siège sur la décision duquel l'auteur a arrêté la main, ou `null` si elle va jusqu'à sa fin
   * naturelle (cf. `Hand.stoppedAtSeatId`). Posé par `arreterLaMain`, et par lui SEUL : toute autre
   * avancée dans l'assistant le remet à `null` (cf. `pushSnapshotAndGo`).
   */
  const [stoppedAtSeatId, setStoppedAtSeatId] = useState<string | null>(
    depart?.etat.stoppedAtSeatId ?? null
  );
  // Une reprise (`initial`) garde sa propre destination ; sinon on part du groupe d'où l'on vient,
  // et à défaut de « Public ».
  const [review, setReview] = useState<ReviewData>(
    initial?.review ??
      (destinationGroupId
        ? { title: '', description: '', voteQuestion: '', visibility: 'group', groupId: destinationGroupId }
        : { title: '', description: '', voteQuestion: '', visibility: 'public' })
  );
  // Cartes montrées par les adversaires à l'abattage (seatId -> deux cartes, éventuellement partielles).
  const [revealedCards, setRevealedCards] = useState<Record<string, (Card | undefined)[]>>(depart?.etat.revealedCards ?? {});
  // Réglage global à la main (pas par adversaire, cf. ShowdownStep) : une fois activé, les mains
  // adverses saisies ci-dessus restent visibles dans le replayer même perdantes. Comme
  // `review.visibility`, ce n'est pas dans `Snapshot` — persiste tel quel à travers la navigation
  // arrière/avant plutôt que d'être restauré à une valeur antérieure.
  // Caché jusqu'à l'abattage PAR DÉFAUT sur une main neuve : c'est le mode de lecture que
  // préfèrent les joueurs. Le `??` compte : une main REPRISE garde son propre réglage — `rehydrate`
  // rend toujours un booléen (`!!hand.revealShowdown`), donc jamais `undefined`, et une main
  // publiée avant ce jour ne se met pas à cacher ce qu'elle montrait.
  const [revealShowdown, setRevealShowdown] = useState(initial?.revealShowdown ?? true);
  const [history, setHistory] = useState<Snapshot[]>(depart?.history ?? []);
  /**
   * CE QUE CHAQUE STREET A LAISSÉ DERRIÈRE ELLE, pour pouvoir la rouvrir intacte.
   * ───────────────────────────────────────────────────────────────────────────
   * `history` ramène bien l'état du CRÉATEUR à l'avant-street, et il a toujours eu raison. Ce qui
   * manquait, c'est l'état interne de `StreetStep` : il repartait vide, donc un « ‹ Retour » depuis
   * le turn effaçait le flop entier — 3 cartes et 4 actions, sans un mot (mesuré le 01/09/2026).
   * Chaque street range ici son `EtatStreet` en sortant, et le retrouve en revenant.
   */
  const [etatsDeStreet, setEtatsDeStreet] = useState<Partial<Record<Phase, EtatStreet>>>({});
  // Change à chaque changement de phase, pour forcer un remount propre des écrans de street
  // (sinon revenir en arrière puis ré-avancer réutilise un composant à l'état "terminé").
  const [phaseKey, setPhaseKey] = useState(0);
  // Confirmation avant de quitter l'étape 1 en ayant déjà saisi quelque chose.
  const [confirmingAbandon, setConfirmingAbandon] = useState(false);
  // Derniers groupes publiés, lus une fois sur l'appareil : ils ordonnent la rangée de chips et
  // désignent la présélection. Tant que la lecture n'est pas revenue, la liste garde l'ordre reçu
  // et rien n'est présélectionné — jamais un mauvais groupe le temps d'un aller-retour disque.
  const [lastUsedGroupIds, setLastUsedGroupIds] = useState<string[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // État du contexte tel qu'il était au chargement des préférences : sert de point de comparaison
  // pour savoir si le joueur a réellement saisi quelque chose. On ne compare PAS à
  // `DEFAULT_CONTEXT` — les préférences mémorisées (cf. `contextPrefs`) pré-remplissent l'étape,
  // et prendre les valeurs par défaut ferait passer un formulaire intact pour un formulaire rempli.
  const pristineContext = useRef<ContextData>(playerDefaults.current);

  // Pré-remplissage du contexte avec les derniers réglages mémorisés (cf. contextPrefs), pour ne pas
  // retaper à chaque fois sa partie habituelle. Chargé une fois au montage (AsyncStorage répond en
  // quelques ms, bien avant toute interaction) ; garde-fou d'unmount pour ne pas setState après coup.
  useEffect(() => {
    // Main reprise : son propre contexte fait foi. Sans ce garde-fou, les réglages mémorisés
    // écraseraient les blindes et la table de la main qu'on vient d'ouvrir pour la corriger.
    if (initial) return;
    let cancelled = false;
    loadContextPrefs(playerDefaults.current).then((prefs) => {
      if (cancelled) return;
      setContext(prefs);
      pristineContext.current = prefs;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLastUsedGroupIds().then((ids) => {
      if (!cancelled) setLastUsedGroupIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedGroups = useMemo(() => orderGroupsByLastUsed(groups, lastUsedGroupIds), [groups, lastUsedGroupIds]);
  // Sert de repli quand l'auteur repasse sur la puce « Groupe privé » après l'avoir quittée : le
  // groupe d'où l'on vient l'emporte alors sur le dernier groupe utilisé, sinon un aller-retour
  // Public → Groupe privé changerait silencieusement de destination.
  const preselectedGroupId = destinationGroupId ?? defaultGroupId(orderedGroups, lastUsedGroupIds);

  // Cartes prises par le hero et le board (sert de base d'exclusion aux sélecteurs).
  const baseUsedCards: Card[] = [
    ...(heroCards.filter(Boolean) as Card[]),
    ...(board.flop ?? []),
    ...(board.turn ? [board.turn] : []),
    ...(board.river ? [board.river] : []),
    ...(board2.flop ?? []),
    ...(board2.turn ? [board2.turn] : []),
    ...(board2.river ? [board2.river] : []),
  ];
  const revealedUsedCards: Card[] = Object.values(revealedCards)
    .flat()
    .filter(Boolean) as Card[];
  const usedCards: Card[] = [...baseUsedCards, ...revealedUsedCards];

  // Sièges adverses encore en jeu (non couchés) à qui on peut attribuer des cartes à l'abattage.
  const villainSeats = seats.filter((s) => !s.isHero && activeSeatIds.includes(s.id));

  // Total misé par chaque siège lors des streets précédant `street` (exclut donc les blindes de la street courante).
  const priorCommittedFor = (street: 'preflop' | 'flop' | 'turn' | 'river') =>
    committedBySeat(actions.filter((a) => a.street !== street));

  /**
   * Range l'état interne de la street qu'on quitte, et INVALIDE celles d'après si son contenu a
   * changé.
   *
   * L'invalidation n'est pas une précaution de principe : l'état d'une street est calculé à partir
   * des streets précédentes (contributions, tapis restants, qui est encore en jeu). Revenir sur le
   * flop, y défaire une relance, puis ré-avancer, rendrait un turn dont les montants parlent d'un
   * flop qui n'existe plus. À l'inverse, revenir puis ré-avancer SANS rien toucher doit tout
   * retrouver — c'est toute la promesse — d'où la comparaison plutôt qu'un effacement systématique.
   */
  const rangerEtat = (phaseQuittee: Phase, etat: EtatStreet) => {
    setEtatsDeStreet((prev) => {
      const avant = prev[phaseQuittee];
      const memeContenu =
        avant !== undefined &&
        JSON.stringify([avant.recorded, avant.boardCards, avant.boardCards2]) ===
          JSON.stringify([etat.recorded, etat.boardCards, etat.boardCards2]);
      if (memeContenu) return { ...prev, [phaseQuittee]: etat };
      const apres = ORDRE_PHASES.indexOf(phaseQuittee);
      const garde: Partial<Record<Phase, EtatStreet>> = {};
      for (const [cle, valeur] of Object.entries(prev) as [Phase, EtatStreet][]) {
        if (ORDRE_PHASES.indexOf(cle) <= apres) garde[cle] = valeur;
      }
      return { ...garde, [phaseQuittee]: etat };
    });
  };

  // Enregistre l'état courant avant de passer à la phase suivante, pour pouvoir revenir en arrière sans perdre ni dupliquer les données.
  const pushSnapshotAndGo = (nextPhase: Phase, patch: Partial<Omit<Snapshot, 'phase'>> = {}) => {
    setHistory((h) => [
      ...h,
      { phase, context, seats, heroCards, actions, activeSeatIds, board, board2, revealedCards,
        stoppedAtSeatId },
    ]);
    if (patch.context !== undefined) setContext(patch.context);
    if (patch.seats !== undefined) setSeats(patch.seats);
    if (patch.heroCards !== undefined) setHeroCards(patch.heroCards);
    if (patch.actions !== undefined) setActions(patch.actions);
    if (patch.activeSeatIds !== undefined) setActiveSeatIds(patch.activeSeatIds);
    if (patch.board !== undefined) setBoard(patch.board);
    if (patch.board2 !== undefined) setBoard2(patch.board2);
    if (patch.revealedCards !== undefined) setRevealedCards(patch.revealedCards);
    // ⚠️ SEUL CHAMP QUI NE SE CONSERVE PAS QUAND LE PATCH EST MUET : absent du patch veut dire
    // `null`, pas « inchangé ». Avancer dans l'assistant, c'est toujours reprendre le cours normal
    // de la main — la seule façon de l'arrêter est de le demander (cf. `arreterLaMain`). Sans cette
    // asymétrie, un auteur qui s'arrête, revient sur ses pas et rejoue la street jusqu'au bout
    // publierait une main marquée comme arrêtée alors qu'elle a désormais une fin.
    setStoppedAtSeatId(patch.stoppedAtSeatId ?? null);
    setPhase(nextPhase);
    setPhaseKey((k) => k + 1);
  };

  // Après la dernière street (ou un fold général), propose l'abattage s'il reste un adversaire en jeu, sinon publie.
  const finishHand = (patch: Partial<Omit<Snapshot, 'phase'>>) => {
    const remaining = patch.activeSeatIds ?? activeSeatIds;
    const currentSeats = patch.seats ?? seats;
    const hasVillain = currentSeats.some((s) => !s.isHero && remaining.includes(s.id));
    pushSnapshotAndGo(hasVillain ? 'showdown' : 'review', patch);
  };

  /**
   * L'auteur arrête la main sur la décision de `seatId`, au lieu de la raconter jusqu'au bout.
   *
   * DEUX DIFFÉRENCES AVEC `finishHand`, ET ELLES SE TIENNENT :
   *   • on va DROIT à la publication, jamais par l'abattage — une main arrêtée n'en a pas, par
   *     construction : personne n'a montré ses cartes puisque le coup n'est pas allé au bout ;
   *   • on pose la marque, qui est ce qui empêchera le moteur de désigner un vainqueur
   *     (cf. `determinePotAwards`, où elle est lue avant tout le reste).
   *
   * Le compteur d'étapes saute alors, « 3/7 » puis « 7/7 ». C'est déjà ce que fait une main où tout
   * le monde se couche préflop : la carte des étapes est fixe et ne prétend pas décrire ce qui a
   * réellement été joué.
   */
  const arreterLaMain = (patch: Partial<Omit<Snapshot, 'phase'>>, seatId: string) => {
    pushSnapshotAndGo('review', { ...patch, stoppedAtSeatId: seatId });
  };

  // Le joueur a-t-il investi quelque chose ? L'étape 1 peut à elle seule contenir le type de partie,
  // la variante, les blindes, le straddle, l'ante et les noms/stacks de jusqu'à 9 adversaires ; les
  // cartes du hero comptent aussi, puisqu'on peut revenir à l'étape 1 après les avoir saisies.
  const hasEnteredSomething = () =>
    heroCards.some(Boolean) || JSON.stringify(context) !== JSON.stringify(pristineContext.current);

  const goBack = () => {
    if (history.length === 0) {
      // Sortie définitive : un tap accidentel (ou un glissement de bord) effaçait tout sans un mot.
      if (hasEnteredSomething()) {
        setConfirmingAbandon(true);
        return;
      }
      onCancel();
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setContext(prev.context);
    setSeats(prev.seats);
    setHeroCards(prev.heroCards);
    setActions(prev.actions);
    setActiveSeatIds(prev.activeSeatIds);
    setBoard(prev.board);
    setBoard2(prev.board2);
    setRevealedCards(prev.revealedCards);
    setStoppedAtSeatId(prev.stoppedAtSeatId);
    setPhase(prev.phase);
    setPhaseKey((k) => k + 1);
  };

  // Publication en cours. Le verrou est ici plutôt que dans `ReviewStep` parce que c'est ici qu'on
  // attend `onCreated` : entre l'appui et le retour au feed il y a un aller-retour réseau, et un
  // second appui pendant cette fenêtre publiait la main une deuxième fois. Rien côté base ne s'y
  // oppose — mesuré en production : deux insertions identiques simultanées sont toutes deux
  // acceptées. Le garde-fou ne peut donc être que côté client.
  const [submitting, setSubmitting] = useState(false);

  /** Aperçu plein écran ouvert depuis l'étape « Publier » (cf. `ApercuMainScreen`). */
  const [apercu, setApercu] = useState<Hand | null>(null);
  /** La même main, mais en phrases (cf. `MainEnTexteScreen`). Figée à l'ouverture, comme l'aperçu. */
  const [texte, setTexte] = useState<PartieDecrite | null>(null);

  /**
   * LA MAIN TELLE QU'ELLE SERA PUBLIÉE.
   * ───────────────────────────────────
   * Extraite de `finalize` pour qu'un SECOND appelant s'en serve : l'aperçu de l'étape
   * « Publier », qui rejoue la main dans le replayer du feed avant la mise en ligne. Il faut que
   * ce soit le même objet, bâti par le même code — un aperçu monté à côté montrerait une main
   * voisine de celle qui part, et le seul défaut qu'il ne saurait pas montrer serait justement
   * celui du montage.
   *
   * Les surcharges servent à la correction sans ressaisie : les valeurs modifiées ne sont pas
   * encore dans l'état React au moment de l'appel — d'où le passage explicite plutôt qu'une
   * lecture d'état.
   */
  const construitMain = (
    finalActions: Action[],
    finalBoard: Board,
    surcharge: Partial<Pick<Snapshot, 'context' | 'seats' | 'heroCards' | 'board2' | 'revealedCards'>> = {}
  ): Hand => {
    const ctx = surcharge.context ?? context;
    const sts = surcharge.seats ?? seats;
    const hc = surcharge.heroCards ?? heroCards;
    const b2 = surcharge.board2 ?? board2;
    const rc = surcharge.revealedCards ?? revealedCards;
    // Un adversaire n'est "connu" (et donc départageable/inclus dans l'équité) que si TOUTES ses
    // cartes ont été saisies — une main Omaha partielle (< count cartes) n'est pas évaluable, on la
    // traite alors comme mucked, exactement comme au Hold'em où il fallait les 2 cartes.
    const cardCount = holeCardCount(ctx.variant);
    const seatsWithCards = sts.map((s) => {
      if (s.isHero) return { ...s, holeCards: hc.filter(Boolean) as Card[] };
      const cartesMontrees = (rc[s.id] ?? []).filter(Boolean) as Card[];
      if (cartesMontrees.length === cardCount) return { ...s, holeCards: cartesMontrees };
      return s;
    });
    return {
      id: `hand-${Date.now()}`,
      variant: ctx.variant,
      gameType: ctx.gameType,
      // Bomb pot : pas de blindes. On garde `bb` = montant de l'ante comme unité d'affichage (le
      // bomb pot se raisonne en nombre d'antes), et `sb` à 0.
      blinds: ctx.bombPot
        ? { sb: 0, bb: ctx.bombAnte }
        : {
            sb: ctx.sb,
            bb: ctx.bb,
            ante: ctx.anteType === 'bb' ? ctx.bb : ctx.anteType === 'per-player' ? ctx.ante : undefined,
          },
      effectiveStack: ctx.effectiveStack,
      visibility: review.visibility,
      seats: seatsWithCards,
      board: finalBoard,
      // Double board (bomb pot uniquement) : le second board n'est posé que si l'option est active.
      board2: ctx.bombPot && ctx.doubleBoard ? b2 : undefined,
      actions: finalActions,
      bombPot: ctx.bombPot || undefined,
      // Cash game seulement : en tournoi les jetons ne sont pas de l'argent réel, et rien ne les
      // habille. La main reste alors sans devise, et se relit comme telle.
      currency: ctx.gameType === 'cash' ? ctx.currency : undefined,
      // Main arrêtée par son auteur : la marque part avec elle, et c'est elle seule qui dira au
      // moteur de ne désigner aucun vainqueur. `undefined` sur une main finie normalement, pour
      // qu'elle s'écrive exactement comme avant (rien de nouveau dans le jsonb publié).
      stoppedAtSeatId: stoppedAtSeatId ?? undefined,
      revealShowdown,
    };
  };

  /**
   * Publie. Les surcharges servent à la correction sans ressaisie : quand l'auteur ne touche qu'à
   * des champs non invalidants, l'étape publie DIRECTEMENT au lieu de le faire défiler à travers
   * des écrans qu'il n'a aucune raison de revoir.
   */
  const finalize = async (
    finalActions: Action[],
    finalBoard: Board,
    surcharge: Partial<Pick<Snapshot, 'context' | 'seats' | 'heroCards' | 'board2' | 'revealedCards'>> = {}
  ) => {
    if (submitting) return;
    const ctx = surcharge.context ?? context;
    const hand = construitMain(finalActions, finalBoard, surcharge);
    const post: Post = {
      id: `post-${Date.now()}`,
      authorId,
      authorName,
      createdAt: new Date().toISOString(),
      location: ctx.location,
      buyIn: ctx.buyIn,
      level: ctx.level,
      title: review.title,
      description: review.description?.trim() || undefined,
      voteQuestion: review.voteQuestion || undefined,
      voteOptions: review.voteQuestion
        ? (review.voteOptions ?? []).map((o) => o.trim()).filter(Boolean)
        : undefined,
      likeCount: 0,
      commentCount: 0,
      visibility: review.visibility,
      groupId: review.groupId,
      hand,
    };
    // `onCreated` remonte l'erreur à l'écran appelant et laisse le créateur ouvert : on relâche le
    // verrou dans tous les cas, sinon un échec réseau condamnerait le bouton pour de bon.
    setSubmitting(true);
    try {
      await onCreated(post);
      // Ce groupe devient le premier proposé à la prochaine main (et le présélectionné).
      if (post.visibility === 'group' && post.groupId) {
        const groupId = post.groupId;
        void rememberUsedGroup(groupId);
        setLastUsedGroupIds((ids) => [groupId, ...ids.filter((id) => id !== groupId)]);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Réglages de table communs aux quatre écrans de street : ils pilotent le format des montants
  // (devise en cash, jetons abrégés en tournoi) et l'arrondi des raccourcis de taille. Ils étaient
  // jusqu'ici passés au SEUL écran préflop — flop/turn/river retombaient donc sur le défaut 'cash',
  // et un tournoi y affichait « 16777€ » au lieu de « 16,8k ». En bomb pot, la « BB » est le
  // montant de la bombe et il n'y a pas de petite blinde : même convention que `finalize`.
  /**
   * CORRIGER UNE CARTE D'UNE STREET DÉJÀ TOMBÉE, depuis l'étape où l'on se trouve.
   * ─────────────────────────────────────────────────────────────────────────────
   * L'index est celui du board À PLAT tel que la table le montre : 0-2 le flop, 3 le turn, 4 la
   * river. Corriger une carte du flop depuis la river ne rend aucune mise illégale — ce sont les
   * montants qui contraignent le déroulé, pas les cartes — donc rien n'est à ressaisir.
   *
   * La correction est appliquée AUSSI à tous les instantanés d'historique : sans ça, un « Retour »
   * ferait ressusciter la carte qu'on vient de remplacer, en silence. Les instantanés pris avant
   * que la carte n'existe sont laissés tels quels (le garde-fou sur la longueur du flop).
   */
  const appliqueCorrection = (index: number, carte: Card) => {
    return (b: Board): Board => {
      if (index < 3) {
        const flop = [...(b.flop ?? [])];
        if (flop.length < 3) return b;
        flop[index] = carte;
        return { ...b, flop: flop as [Card, Card, Card] };
      }
      if (index === 3) return b.turn ? { ...b, turn: carte } : b;
      return b.river ? { ...b, river: carte } : b;
    };
  };

  const corrigerBoard = (index: number, carte: Card) => {
    const applique = appliqueCorrection(index, carte);
    setBoard(applique);
    setHistory((h) => h.map((snap) => ({ ...snap, board: applique(snap.board) })));
  };

  /** La même chose sur le SECOND board d'un bomb pot double board. */
  const corrigerBoard2 = (index: number, carte: Card) => {
    const applique = appliqueCorrection(index, carte);
    setBoard2(applique);
    setHistory((h) => h.map((snap) => ({ ...snap, board2: applique(snap.board2) })));
  };

  const tableProps = {
    gameType: context.gameType,
    currency: context.currency,
    variant: context.variant,
    sb: context.bombPot ? 0 : context.sb,
    bb: context.bombPot ? context.bombAnte : context.bb,
    // La table du créateur montre ce que l'auteur SAIT : ses propres cartes, et le board déjà
    // tombé. Sans ça, il saisit les actions du flop sans pouvoir revoir la main qu'il a choisie
    // deux écrans plus tôt — c'était le cas jusqu'ici.
    heroCards: heroCards.filter(Boolean) as Card[],
    boardAvant: [
      ...(board.flop ?? []),
      ...(board.turn ? [board.turn] : []),
      ...(board.river ? [board.river] : []),
    ],
    onCorrigerBoard: corrigerBoard,
    board2Avant: [
      ...(board2.flop ?? []),
      ...(board2.turn ? [board2.turn] : []),
      ...(board2.river ? [board2.river] : []),
    ],
    onCorrigerBoard2: corrigerBoard2,
    /**
     * Corriger UNE carte de Hero sans remonter à l'étape 2. Symétrique du board : ses cartes sont
     * sur le feutre pendant toute la main, c'est donc là qu'on les change. Une carte de Hero ne
     * contraint aucune mise — rien à ressaisir — mais elle vit dans les instantanés d'historique
     * comme le board, d'où la même répercussion : sans elle, un « Retour » ramènerait l'ancienne.
     */
    onCorrigerHero: (index: number, carte: Card) => {
      const applique = (cartes: (Card | undefined)[]) => cartes.map((c, i) => (i === index ? carte : c));
      setHeroCards(applique);
      setHistory((h) => h.map((snap) => ({ ...snap, heroCards: applique(snap.heroCards) })));
    },
  };

  const totalSteps = totalStepsFor(context.bombPot);
  const step = phaseStepMap(context.bombPot)[phase];

  // ── Correction : ce que l'auteur a changé, et ce que ça coûte ────────────────────────────────
  const aLEntree = enCorrection && phase === phaseDEntree && !refaitLesMises;
  // Les champs de contexte qui, modifiés, rendent le déroulé incohérent. Vide = publication directe.
  const invalidants = initial ? champsInvalidants(initial.context, context, seats, actions) : [];
  const contexteModifie = initial ? JSON.stringify(initial.context) !== JSON.stringify(context) : false;
  const cartesHeroModifiees = initial
    ? JSON.stringify(initial.heroCards.filter(Boolean)) !== JSON.stringify(heroCards.filter(Boolean))
    : false;
  const abattageModifie = initial
    ? JSON.stringify(initial.revealedCards) !== JSON.stringify(revealedCards) ||
      initial.revealShowdown !== revealShowdown
    : false;

  /**
   * Publier sans repasser par les étapes suivantes. N'existe QUE sur l'étape d'entrée d'une
   * correction et seulement si rien d'invalidant n'a bougé : il n'y a alors littéralement rien à
   * ressaisir, et faire défiler des écrans préremplis serait de la friction sans contrepartie.
   */
  const publierDirectement = (surcharge: Parameters<typeof finalize>[2] = {}) =>
    void finalize(actions, board, surcharge);

  /** « les blindes, l'ante et le straddle » — le « et » final, sinon la phrase sonne comme une liste. */
  const enumerer = (l: string[]) =>
    l.length <= 1 ? l[0] ?? '' : `${l.slice(0, -1).join(', ')} et ${l[l.length - 1]}`;

  /** Le libellé du bouton sur l'étape d'entrée d'une correction. Ailleurs, l'assistant normal. */
  const libelleBouton = (invalide: boolean) => (aLEntree ? (invalide ? 'Continuer' : 'Valider') : undefined);
  const RIEN_A_RESSAISIR = "Rien d'autre ne sera à ressaisir.";

  const renderStep = () => {
  // Une street REPRISE ne s'ouvre pas sur l'enregistreur : entrer ne doit rien effacer. On y
  // corrige les cartes, et refaire les mises est un geste explicite (cf. `StreetCorrectionStep`).
  if (aLEntree && phase.startsWith('street-') && depart?.instantane) {
    const street = phase.replace('street-', '') as Street;
    return (
      <StreetCorrectionStep
        street={street}
        seats={seats}
        actions={actions}
        gameType={context.gameType}
        currency={context.currency}
        bb={context.bombPot ? context.bombAnte : context.bb}
        board={board}
        board2={board2}
        onBack={goBack}
        onValider={(b, b2) => void finalize(actions, b, { board2: b2 })}
        onRefaireLesMises={() => {
          const inst = depart.instantane!;
          setContext(inst.context);
          setSeats(inst.seats);
          setHeroCards(inst.heroCards);
          setActions(inst.actions);
          setActiveSeatIds(inst.activeSeatIds);
          setBoard(inst.board);
          setBoard2(inst.board2);
          setRevealedCards(inst.revealedCards);
          // L'instantané d'une street est toujours « main en cours » : refaire ses mises rend donc
          // la main à son déroulé normal, libre de se terminer autrement (ou de s'arrêter ailleurs).
          setStoppedAtSeatId(inst.stoppedAtSeatId);
          setRefaitLesMises(true);
          setPhaseKey((k) => k + 1);
        }}
      />
    );
  }

  switch (phase) {
    case 'showdown':
      return (
        <ShowdownStep
          count={holeCardCount(context.variant)}
          villains={villainSeats}
          seats={seats}
          revealed={revealedCards}
          baseUsedCards={baseUsedCards}
          actions={actions}
          onChange={(seatId, cards) => setRevealedCards((r) => ({ ...r, [seatId]: cards }))}
          revealShowdown={revealShowdown}
          onChangeRevealShowdown={setRevealShowdown}
          // De quoi dessiner la table de fin de main (cf. `ShowdownStep`) : le board complet, la
          // main de Hero, et qui est encore debout.
          board={[
            ...(board.flop ?? []),
            ...(board.turn ? [board.turn] : []),
            ...(board.river ? [board.river] : []),
          ]}
          board2={[
            ...(board2.flop ?? []),
            ...(board2.turn ? [board2.turn] : []),
            ...(board2.river ? [board2.river] : []),
          ]}
          heroCards={heroCards.filter(Boolean) as Card[]}
          activeSeatIds={activeSeatIds}
          gameType={context.gameType}
          currency={context.currency}
          bb={context.bombPot ? context.bombAnte : context.bb}
          holeCardCount={holeCardCount(context.variant)}
          onBack={goBack}
          nextLabel={libelleBouton(false)}
          nextBloque={aLEntree && !abattageModifie}
          footerNote={aLEntree ? RIEN_A_RESSAISIR : null}
          step={step}
          totalSteps={totalSteps}
          onNext={() => (aLEntree ? publierDirectement({ revealedCards }) : pushSnapshotAndGo('review'))}
        />
      );

    case 'context':
      return (
        <ContextStep
          value={context}
          onChange={setContext}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          nextLabel={libelleBouton(invalidants.length > 0)}
          nextBloque={aLEntree && !contexteModifie}
          enCorrection={enCorrection}
          footerNote={
            !aLEntree
              ? null
              : invalidants.length > 0
                ? `Changer ${enumerer(invalidants)} fait ressaisir tout le déroulé.`
                : RIEN_A_RESSAISIR
          }
          onNext={() => {
            // Correction sans rien d'invalidant : on publie tel quel. Les noms et les tapis sont
            // reportés sur les sièges EXISTANTS — leurs identifiants ne bougent pas, donc aucune
            // action ne perd sa référence, contrairement à `buildSeats` qui les refabrique.
            if (aLEntree && invalidants.length === 0) {
              void saveContextPrefs(context);
              void memoriserTable(context);
              publierDirectement({ context, seats: appliquerContexteAuxSieges(seats, context) });
              return;
            }
            // Mémorise les réglages de table pour accélérer la prochaine création (fire-and-forget :
            // un échec d'écriture ne doit pas bloquer la création en cours).
            void saveContextPrefs(context);
            // Les joueurs de la table sont mémorisés À PART, et ne reviendront QUE sur un geste
            // (cf. `derniereTable`) : les blindes se retapent à l'identique d'une main à l'autre,
            // les noms non — et un nom faux est plausible, donc jamais corrigé.
            void memoriserTable(context);
            const builtSeats = buildSeats(
              context.numPlayers,
              context.heroPosition,
              context.effectiveStack,
              context.opponentNames,
              context.seatStacks,
              context.heroName
            );
            let order = 1;
            const blindActions: Action[] = [];

            // Une mise forcée ne peut pas dépasser le tapis de celui qui la poste. Sans ce
            // plafonnement, un siège dont le stack est inférieur à sa blinde partait en négatif et
            // le pot se retrouvait gonflé de jetons qui n'existaient pas — invisible à l'écran, car
            // `SeatView` affiche `Math.max(stack, 0)`, mais bien présent dans le pot et donc dans
            // tous les montants gagnés. Le cas réaliste n'est pas le tapis de 5 : c'est la personne
            // qui saisit son tapis EN NOMBRE DE BLINDES (« 12 ») avec des blindes à 500/1000.
            // Le compteur est cumulatif par siège : un même joueur peut poster un ante PUIS une
            // blinde PUIS un BB ante, et c'est le total qui doit tenir dans son tapis.
            const restant: Record<string, number> = {};
            for (const seat of builtSeats) restant[seat.id] = seat.startingStack;
            const poster = (id: string, seatId: string, type: Action['type'], nominal: number) => {
              const dispo = restant[seatId] ?? 0;
              const montant = Math.min(nominal, dispo);
              // Rien à poster : le siège est déjà à tapis. On n'enregistre pas d'action à 0, qui
              // n'apparaîtrait dans le replayer que comme un « poste 0 » sans signification.
              if (montant <= 0) return;
              restant[seatId] = dispo - montant;
              blindActions.push({ id, street: 'preflop', seatId, type, amount: montant, order: order++ });
            };

            if (context.bombPot) {
              // Bomb pot : chaque siège poste l'ante (la "bombe") en preflop, aucune blinde ni
              // straddle. Tous les joueurs restent en jeu et l'on saute directement au flop (cf.
              // onNext de holeCards).
              for (const seat of builtSeats) {
                poster(`bomb-${seat.id}`, seat.id, 'post-ante', context.bombAnte);
              }
            } else {
            const sbSeat = builtSeats.find((s) => s.position === 'SB') ?? builtSeats.find((s) => s.position === 'BTN')!;
            const bbSeat = builtSeats.find((s) => s.position === 'BB')!;

            // Ante par joueur : chaque siège poste son ante avant les blindes.
            if (context.anteType === 'per-player' && context.ante > 0) {
              for (const seat of builtSeats) {
                poster(`ante-${seat.id}`, seat.id, 'post-ante', context.ante);
              }
            }

            poster('blind-sb', sbSeat.id, 'post-sb', context.sb);
            poster('blind-bb', bbSeat.id, 'post-bb', context.bb);

            // BB ante : seule la BB poste l'ante (montant = BB), après les blindes.
            if (context.anteType === 'bb' && context.bb > 0) {
              poster('ante-bb', bbSeat.id, 'post-ante', context.bb);
            }

            // Straddle(s) (cash game) : les joueurs successifs après la BB postent chacun un
            // montant volontaire qui double à chaque fois (simple, double, triple), devenant le
            // niveau à suivre. Le dernier straddleur agira en dernier (comme la BB en temps
            // normal), l'action reprenant après lui — c'est ce qui fait qu'un BTN straddle, posté
            // en dernier, ouvre la parole à la SB sans qu'aucun code d'ordre ne le sache.
            // Qui poste quoi est décidé par `straddlesAPoster` (cf. `straddle.ts`), pour que le
            // formulaire, la relecture d'une main publiée et ce postage-ci ne puissent pas diverger.
            for (const straddle of straddlesAPoster(context)) {
              const straddlerSeat = builtSeats.find((s) => s.position === straddle.position);
              if (!straddlerSeat) continue;
              poster(`straddle-${straddle.position.toLowerCase()}`, straddlerSeat.id, 'post-straddle', straddle.montant);
            }
            }

            // Si la variante a changé depuis la dernière visite de cette étape, on retaille les
            // cartes déjà choisies au nouveau nombre (ex : PLO5→PLO ne garde que 4 cartes) — sans ça,
            // un surplus de cartes rendrait l'étape "Tes cartes" impossible à valider.
            const trimmedHero = (heroCards.filter(Boolean) as Card[]).slice(0, holeCardCount(context.variant));
            pushSnapshotAndGo('holeCards', {
              seats: builtSeats,
              actions: blindActions,
              activeSeatIds: builtSeats.map((s) => s.id),
              heroCards: trimmedHero,
            });
          }}
        />
      );

    case 'holeCards':
      return (
        <HoleCardsStep
          count={holeCardCount(context.variant)}
          context={context}
          cards={heroCards}
          onChange={setHeroCards}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          // Tes cartes ne peuvent jamais invalider quoi que ce soit : aucune action ne les
          // référence. En correction, cette étape publie donc toujours directement.
          nextLabel={libelleBouton(false)}
          nextBloque={aLEntree && !cartesHeroModifiees}
          footerNote={aLEntree ? RIEN_A_RESSAISIR : null}
          // Bomb pot : pas de preflop, on enchaîne direct sur le flop (les antes sont déjà postés).
          onNext={() =>
            aLEntree
              ? publierDirectement({ heroCards })
              : pushSnapshotAndGo(context.bombPot ? 'street-flop' : 'street-preflop')
          }
        />
      );

    case 'street-preflop': {
      const straddleActions = actions.filter((a) => a.type === 'post-straddle').sort((a, b) => a.order - b.order);
      // Le DERNIER posté ouvre la parole après lui : c'est le bouton quand il straddle, sinon le
      // dernier maillon de la chaîne. Le montant à suivre, lui, est le PLUS HAUT et non le dernier :
      // rien n'oblige un BTN straddle saisi à la main à dépasser celui de l'UTG, et un niveau de
      // mise ne redescend jamais.
      const lastStraddle = straddleActions[straddleActions.length - 1];
      const straddleLePlusHaut = straddleActions.length > 0
        ? Math.max(...straddleActions.map((a) => a.amount ?? 0))
        : undefined;
      // Les contributions de départ se lisent sur les mises RÉELLEMENT postées, et non sur les
      // montants nominaux du contexte : une blinde est plafonnée au tapis (cf. `poster` plus haut),
      // et repartir de `context.bb` créditerait la grosse blinde d'une mise qu'elle n'a pas pu
      // payer. Les antes sont volontairement exclus — ce sont des jetons morts, comptés à part via
      // `anteCommitted`, et ils n'entrent pas dans le montant à suivre.
      const initialContributions: Record<string, number> = {};
      for (const a of actions) {
        if (a.type === 'post-sb' || a.type === 'post-bb' || a.type === 'post-straddle') {
          initialContributions[a.seatId] = a.amount ?? 0;
        }
      }
      return (
        <StreetStep
          key={`preflop-${phaseKey}`}
          reprise={etatsDeStreet['street-preflop']}
          onEtat={(etat) => rangerEtat('street-preflop', etat)}
          street="preflop"
          boardCount={0}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          // Le montant à suivre reste la blinde NOMINALE, même si la grosse blinde n'a pas pu la
          // payer entièrement : au poker, un joueur à tapis pour moins que la blinde n'abaisse pas
          // le niveau de mise pour les autres. C'est pour ça que ce montant peut légitimement être
          // supérieur à la contribution réelle de la BB juste au-dessus.
          initialBetAmount={straddleLePlusHaut ?? context.bb}
          initialContributions={initialContributions}
          priorCommitted={priorCommittedFor('preflop')}
          anteCommitted={committedBySeat(actions.filter((a) => a.type === 'post-ante'))}
          firstToActAfterSeatId={lastStraddle?.seatId}
          priorActions={actions}
          {...tableProps}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(_board, _board2, newActions, remaining) => {
            pushSnapshotAndGo('street-flop', { actions: [...actions, ...newActions], activeSeatIds: remaining });
          }}
          onHandEndsEarly={(_board, _board2, newActions, remaining) => {
            finishHand({ actions: [...actions, ...newActions], activeSeatIds: remaining, board: {} });
          }}
          onStop={(_board, _board2, newActions, remaining, siege) => {
            arreterLaMain(
              { actions: [...actions, ...newActions], activeSeatIds: remaining, board: {} },
              siege
            );
          }}
        />
      );
    }

    case 'street-flop':
      return (
        <StreetStep
          key={`flop-${phaseKey}`}
          reprise={etatsDeStreet['street-flop']}
          onEtat={(etat) => rangerEtat('street-flop', etat)}
          street="flop"
          boardCount={3}
          boardCount2={context.bombPot && context.doubleBoard ? 3 : 0}
          bombPot={context.bombPot}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          priorCommitted={priorCommittedFor('flop')}
          priorActions={actions}
          {...tableProps}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(boardCards, board2Cards, newActions, remaining) => {
            pushSnapshotAndGo('street-turn', {
              board: { ...board, flop: boardCards as [Card, Card, Card] },
              board2: { ...board2, flop: board2Cards as [Card, Card, Card] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, flop: boardCards as [Card, Card, Card] },
              board2: { ...board2, flop: board2Cards as [Card, Card, Card] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onStop={(boardCards, board2Cards, newActions, remaining, siege) => {
            arreterLaMain(
              {
                board: { ...board, flop: boardCards as [Card, Card, Card] },
                board2: { ...board2, flop: board2Cards as [Card, Card, Card] },
                actions: [...actions, ...newActions],
                activeSeatIds: remaining,
              },
              siege
            );
          }}
        />
      );

    case 'street-turn':
      return (
        <StreetStep
          key={`turn-${phaseKey}`}
          reprise={etatsDeStreet['street-turn']}
          onEtat={(etat) => rangerEtat('street-turn', etat)}
          street="turn"
          boardCount={1}
          boardCount2={context.bombPot && context.doubleBoard ? 1 : 0}
          bombPot={context.bombPot}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          priorCommitted={priorCommittedFor('turn')}
          priorActions={actions}
          {...tableProps}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(boardCards, board2Cards, newActions, remaining) => {
            pushSnapshotAndGo('street-river', {
              board: { ...board, turn: boardCards[0] },
              board2: { ...board2, turn: board2Cards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, turn: boardCards[0] },
              board2: { ...board2, turn: board2Cards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onStop={(boardCards, board2Cards, newActions, remaining, siege) => {
            arreterLaMain(
              {
                board: { ...board, turn: boardCards[0] },
                board2: { ...board2, turn: board2Cards[0] },
                actions: [...actions, ...newActions],
                activeSeatIds: remaining,
              },
              siege
            );
          }}
        />
      );

    case 'street-river':
      return (
        <StreetStep
          key={`river-${phaseKey}`}
          reprise={etatsDeStreet['street-river']}
          onEtat={(etat) => rangerEtat('street-river', etat)}
          street="river"
          boardCount={1}
          boardCount2={context.bombPot && context.doubleBoard ? 1 : 0}
          bombPot={context.bombPot}
          usedCardsElsewhere={usedCards}
          seats={seats}
          activeSeatIds={activeSeatIds}
          startOrder={actions.length + 1}
          priorCommitted={priorCommittedFor('river')}
          priorActions={actions}
          {...tableProps}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onComplete={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, river: boardCards[0] },
              board2: { ...board2, river: board2Cards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onHandEndsEarly={(boardCards, board2Cards, newActions, remaining) => {
            finishHand({
              board: { ...board, river: boardCards[0] },
              board2: { ...board2, river: board2Cards[0] },
              actions: [...actions, ...newActions],
              activeSeatIds: remaining,
            });
          }}
          onStop={(boardCards, board2Cards, newActions, remaining, siege) => {
            arreterLaMain(
              {
                board: { ...board, river: boardCards[0] },
                board2: { ...board2, river: board2Cards[0] },
                actions: [...actions, ...newActions],
                activeSeatIds: remaining,
              },
              siege
            );
          }}
        />
      );

    case 'review':
      return (
        <ReviewStep
          value={review}
          onChange={setReview}
          step={step}
          totalSteps={totalSteps}
          onBack={goBack}
          onSubmit={() => void finalize(actions, board)}
          submitting={submitting}
          republication={!!initial}
          groups={orderedGroups}
          defaultGroupId={preselectedGroupId}
          onCreateGroup={onCreateGroup}
          onOpenGroupPicker={() => setGroupPickerOpen(true)}
          // La main est bâtie À L'OUVERTURE et rangée telle quelle : le replayer travaille ainsi
          // sur un objet stable, là où un calcul à chaque rendu lui en donnerait un neuf à chaque
          // fois (son identifiant contient `Date.now()`).
          onRevoirLaMain={() => setApercu(construitMain(actions, board))}
          // Le contexte part avec la main : l'en-tête du texte nomme la partie (lieu, cave,
          // niveau), et à cette étape il n'existe encore aucun `Post` d'où le tirer.
          onVoirLeTexte={() =>
            setTexte({
              hand: construitMain(actions, board),
              location: context.location,
              buyIn: context.buyIn,
              level: context.level,
            })
          }
        />
      );

    default:
      return null;
  }
  };

  return (
    <>
      {renderStep()}
      <ConfirmSheet
        visible={confirmingAbandon}
        icon={TrashIcon}
        title="Abandonner cette main ?"
        message="Ce que tu as saisi sera perdu."
        confirmLabel="Abandonner"
        cancelLabel="Continuer la saisie"
        onCancel={() => setConfirmingAbandon(false)}
        onConfirm={() => {
          setConfirmingAbandon(false);
          onCancel();
        }}
      />
      {/* Frère de l'étape et non enfant : le glissement de bord du wizard est attaché à
          `WizardScreen`, qui n'est pas un ancêtre d'ici — le geste ne traverse donc pas le
          sélecteur pour reculer d'une étape dans son dos. */}
      {apercu && <ApercuMainScreen hand={apercu} onFermer={() => setApercu(null)} />}
      {texte && <MainEnTexteScreen visible partie={texte} onFermer={() => setTexte(null)} />}
      {groupPickerOpen && (
        <GroupPickerScreen
          groups={orderedGroups}
          selectedId={review.groupId}
          onSelect={(groupId) => {
            setReview((r) => ({ ...r, visibility: 'group', groupId }));
            setGroupPickerOpen(false);
          }}
          onCreateGroup={onCreateGroup}
          onBack={() => setGroupPickerOpen(false)}
        />
      )}
    </>
  );
}
