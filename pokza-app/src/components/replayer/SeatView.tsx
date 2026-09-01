import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { GameType, Seat } from '../../types/poker';
import { cashChipColors, chipColors, colors, radius, typography } from '../../theme/theme';
import { formatChipAmount } from '../../utils/chipFormat';
import {
  POT_PILL_HEIGHT,
  ancreDepuisLeHaut,
  blocSiegeHauteur,
  boardCardSize,
  boardVerticalOffset,
  GABARIT_FEED,
  type Gabarit,
} from '../../engine/layout';
import { CardView } from './CardView';
import { Pressable } from '../ui/Pressable';
import type { CodeDevise } from '../../utils/currency';

interface SeatViewProps {
  seat: Seat;
  x: number;
  y: number;
  tableCenter: { x: number; y: number };
  /** Affiche le libellé "fold" (et estompe le nom), et anime les cartes vers l'opacité 0 — vrai
   * fold ou muck classique de fin de main. Indépendant de `showCardBacks` : un siège qui n'a PAS
   * foldé peut quand même montrer ses cartes face cachée (cf. `showCardBacks`), sans pour autant
   * afficher "fold" ni disparaître alors qu'il est toujours en jeu. */
  folded: boolean;
  /** Affiche des dos de carte (comme un adversaire dont on ignore la main) au lieu de la vraie
   * valeur de `seat.holeCards`, SANS toucher à l'opacité/position (le siège reste normalement
   * visible, actif) — sert à cacher la main d'un adversaire saisie à l'abattage tant que la main
   * n'est pas résolue, quand le créateur a choisi de ne la révéler qu'au showdown (cf.
   * `revealShowdown`) : la vraie carte apparaît d'un coup dès que ce flag repasse à `false`. */
  showCardBacks?: boolean;
  /** Ce siège vient de se coucher, à CE step précis — à distinguer de `folded`, qui dit qu'il EST
   * couché et le reste jusqu'à la fin de la main. Seul le libellé est ponctuel : l'estompage et la
   * disparition des cartes, eux, persistent. */
  justFolded?: boolean;
  /** Ce siège vient de checker, à CE step précis. Contrairement à `folded` et `isAllIn`, qui sont
   * des états persistants, c'est une action ponctuelle : le libellé disparaît au step suivant et
   * le badge retrouve son stack. Un check ne déplace aucun jeton et ne change aucun stack —
   * sans ce libellé, le seul signe qu'il s'est passé quelque chose est le halo doré qui change de
   * siège, exactement le même signal que pour n'importe quelle autre action. */
  justChecked?: boolean;
  stackRemaining: number;
  currentBet?: number;
  isActive: boolean;
  isWinner?: boolean;
  /** Stack à 0, toujours dans le coup — persiste jusqu'à la fin de la main (cf. handEngine). */
  isAllIn?: boolean;
  /** % d'équité (tapis avant la river) — remplace temporairement stack/ALL-IN tant que la main
   * n'est pas résolue (cf. `computeEquity`). */
  equityPct?: number;
  /** L'équité de ce moment de la main est en train de se calculer, hors du rendu (cf.
   * `useEquityHorsRendu`). Décision produit : on n'affiche RIEN en attendant — ni indicateur, ni
   * "…", et surtout pas "ALL-IN", sur lequel on retomberait sinon le temps du calcul avant de
   * basculer sur un pourcentage. */
  equityPending?: boolean;
  /** Coordonnées ABSOLUES (repère table) du siège gagnant, une fois la main terminée — sert à faire
   * glisser les jetons déjà posés au pot jusqu'au vainqueur, en plus de la pastille "Pot X". */
  winnerSeatPos?: { x: number; y: number } | null;
  gameType?: GameType;
  /** Devise de la main (cf. `DEVISES`) ; absente = euro. Sans effet en tournoi. */
  currency?: CodeDevise;
  /** Grosse blinde de la main — sert à convertir les montants affichés quand `useBB` est activé. */
  bb: number;
  /** Préférence globale au feed (cf. `useDisplayUnit`) : montants en BB plutôt qu'en jetons bruts. */
  useBB?: boolean;
  /** "Straddle" / "Double straddle" / "Triple straddle" si ce siège a posté un straddle — remplace
   * l'acronyme de position (UTG, HJ...) tant qu'aucun nom de joueur personnalisé n'est défini. */
  straddleLabel?: string | null;
  /** Nombre de cartes fermées à afficher selon la variante (2/4/5) — utilisé pour dessiner le bon
   * nombre de dos de carte quand la main de l'adversaire est inconnue ou masquée. */
  holeCardCount: number;
  /** Taille de ce que le siège dessine (cf. `Gabarit`). Absent = le gabarit du feed, inchangé. */
  gabarit?: Gabarit;
  /**
   * Cette table montre un RÉGLAGE, pas une main qui se déroule.
   *
   * Un jeton qui disparaît y disparaît, point : il n'a pas été ramassé par le croupier, il n'a
   * jamais été posé. Sans ce drapeau, décocher « Bomb pot » faisait glisser les six bombes vers le
   * centre — le geste exact de la fin d'une street — et elles y restaient, si bien qu'une main
   * redevenue normale gardait des antes au milieu. Le même défaut valait pour tout réglage qui
   * retire une mise forcée : éteindre un straddle, changer de position, retirer un joueur.
   */
  sansGeste?: boolean;
  /**
   * La mise affichée devant ce siège est une SAISIE EN COURS, pas une mise posée. Le jeton devient
   * creux, le montant italique, et `stackRemaining` est alors le tapis PROJETÉ — affiché « → 220€ »
   * à la place du vrai. Mesuré à la vraie police le 30/08 : écrire « 490€ → 220€ » demande 72,7 px
   * pour 80 disponibles, et « 2 450 CHF → 1 900 CHF » 126,3 — impossible. La flèche seule tient
   * partout (41,8 px, 68,3 au pire mesuré), et l'italique dit que rien n'est joué.
   */
  miseFantome?: boolean;
  /**
   * Les cartes manquantes de ce siège sont ATTENDUES, pas inconnues : on les dessine en pointillés,
   * à leur place, au lieu d'un dos de carte.
   *
   * La nuance n'est pas cosmétique. Un dos de carte veut dire « il a une main, je ne la connais
   * pas » — c'est le cas d'un adversaire. À l'étape « Tes cartes », deux dos devant Hero racontent
   * donc exactement le contraire de ce qui se passe : ils disent qu'il a déjà des cartes, alors
   * qu'on attend qu'il les choisisse. Or c'est la table et le sélecteur qui attirent l'œil, pas le
   * titre de l'écran (remarque de Victor, 31/08) : la table doit se suffire.
   *
   * Réservé à Hero, et jamais activé au feed : un adversaire garde ses dos.
   */
  cartesAttendues?: boolean;
  /** Toucher UNE carte fermée de ce siège (index dans la main affichée). Fourni, les cartes
   * deviennent des cibles : c'est ce qui permet au créateur de retirer une carte en tapant dessus,
   * là où elle est — sur le feutre. Absent (le feed), le siège reste inerte, comme avant : le
   * `pointerEvents` du bloc n'est relâché QUE si quelqu'un écoute. */
  onCartePress?: (index: number) => void;
  /** Toucher le badge (nom + tapis) : c'est la fiche du joueur qui s'ouvre. Absent, le badge
   *  n'est pas une cible et AUCUN nœud tactile n'est ajouté — le feed ne paye pas une fonction
   *  du créateur (même raison que `onCartePress`, mesurée le 31/08). */
  onSiegePress?: () => void;
}

const CASH_DENOMS = [1000, 100, 25, 5, 1] as const;
const TOURNAMENT_DENOMS = [5000, 1000, 100, 25, 10, 5, 1] as const;
/** Jetons empilés au maximum, au gabarit du feed — l'atelier en montre un de moins (cf. `Gabarit`). */
const MAX_VISIBLE_CHIPS = 3;
const BTN_MARKER_SIZE = 20;
const BTN_CLEARANCE = 4;

// Cartes fermées d'un siège. À 2 cartes (Hold'em) : côte à côte, sans rotation, comme avant. À 4-5
// cartes (PLO/PLO5) : éventail légèrement chevauché et incliné.
//
// Taille de l'éventail : Hero (toujours en bas AU CENTRE de la table, donc horizontalement dégagé
// quel que soit le nombre de joueurs, et c'est LA main qu'on veut lire) a de grandes cartes ; les
// adversaires, qui peuvent se retrouver collés au bord de l'écran sur les tables pleines, gardent
// des cartes plus petites pour ne pas être coupés. Les deux hauteurs restent ≤ 46 (l'enveloppe
// réservée par le layout, cf. SEAT_CARDS_HEIGHT dans engine/layout.ts) : rien ne déborde sur le board.
// Cartes fermées d'une variante à DEUX cartes : la seule taille que le gabarit fait varier. Les
// éventails de PLO/PLO5 gardent la leur — celui d'un adversaire (25×34) est déjà à la taille que
// l'atelier vise, il n'y avait rien à y gagner.
const HOLE_CARD_FAN_HERO = { w: 31, h: 42 };
const HOLE_CARD_FAN_VILLAIN = { w: 25, h: 34 };
const FAN_OVERLAP = 0.44; // fraction d'une carte masquée par la suivante
const FAN_ANGLE = 5; // degrés d'inclinaison entre deux cartes voisines
const FAN_ARC = 2; // px : les cartes extérieures descendent légèrement (galbe d'éventail)

// Jetons 20% plus petits qu'à l'origine (14px → 11px) et empilés bien droit plutôt qu'en éventail
// diagonal : la pile occupe une largeur proche d'un seul jeton, ce qui laisse plus de marge contre
// le board (sièges du milieu) et contre le bord ovale de la table (sièges excentrés) — cf. SeatView.
const CHIP_TOKEN_INNER_SIZE = 4;
/** Opacité du bloc de mise quand il n'est qu'un fantôme (cf. `BetChipPopIn`). */
const OPACITE_FANTOME = 0.6;
const CHIP_STACK_OFFSET = 2;
const jetonLargeur = (g: Gabarit) => g.chipTokenSize + 6;
const jetonHauteur = (g: Gabarit) => g.chipTokenSize + (g.chipsVisibles - 1) * CHIP_STACK_OFFSET;
// Encombrement total du bloc mise (pile de jetons + montant en dessous) : sert au placement radial
// (demi-hauteur = distance à laisser devant le siège) et au centrage du conteneur.
// La LARGEUR ne sert qu'à centrer le bloc sur son point de dépose : elle n'entre dans aucun calcul
// de placement (seule la hauteur y sert). Elle décide en revanche d'une chose que sa valeur d'origine
// — 28 px, la largeur du jeton dessiné au-dessus — ne prévoyait pas : c'est la largeur à laquelle le
// MONTANT se coupe. À 10 px gras, 28 px ne tiennent que quatre caractères ; « CHF 1500 », qui offre
// une espace où couper, s'y écrivait « CHF » au-dessus de « 1500 ». Les montants sans espace, eux,
// ne se coupaient pas mais débordaient — « 1500€ » (33 px) le fait déjà, sur du feutre vide, donc
// sans que ça se voie. 56 px tiennent le plus long montant réaliste de toutes les devises, sigle
// compris (« CHF 2500 » ≈ 44 px), et restent sous les 49 px de dégagement d'un siège latéral en
// 9-max — mesuré le 30/08/2026.
const CHIP_BLOCK_W = 56;
/** Hauteur du bloc mise. Au feed elle vaut 29 (pile de 15 + 2 + le montant) ; le gabarit la porte
 *  désormais, pour que l'atelier puisse en rendre 4 sans que ce calcul se désynchronise. */
const blocMiseHauteur = (g: Gabarit) => g.chipBlockHeight;

interface ChipToken {
  denom: number;
  color: string;
}

// Une mise "économise" ses jetons par dénomination (ex: 45 → 1 vert (25) + 4 rouges (5)) au lieu
// d'un seul rond générique — plus lisible, et plus proche de ce qu'on voit sur une vraie table.
function chipStackFor(amount: number, gameType: GameType, maxVisible = MAX_VISIBLE_CHIPS): ChipToken[] {
  const denoms: readonly number[] = gameType === 'cash' ? CASH_DENOMS : TOURNAMENT_DENOMS;
  const palette: Record<number, string> = gameType === 'cash' ? cashChipColors : chipColors;
  const stack: ChipToken[] = [];
  let remaining = amount;
  for (const denom of denoms) {
    while (remaining >= denom && stack.length < maxVisible) {
      stack.push({ denom, color: palette[denom] });
      remaining -= denom;
    }
    if (stack.length >= maxVisible) break;
  }
  if (stack.length === 0) {
    const smallest = denoms[denoms.length - 1];
    stack.push({ denom: smallest, color: palette[smallest] });
  }
  return stack;
}

// Rendu par `key={amount}` côté appelant : React démonte/remonte ce composant à chaque nouveau
// montant de mise, ce qui redémarre l'animation d'apparition de façon fiable (pas de comparaison
// manuelle à une valeur précédente, fragile avec les doubles rendus de React Strict Mode).
// `showAmount` masque le montant une fois la mise "posée" au pot : le total y est déjà affiché
// via la pastille "Pot X", le répéter sous chaque petit tas de jetons ne fait que surcharger.
function BetChipPopIn({
  amount,
  gameType,
  currency,
  showAmount,
  bb,
  useBB,
  compact = false,
  gabarit,
  fantome = false,
}: {
  amount: number;
  gameType: GameType;
  currency?: CodeDevise;
  showAmount: boolean;
  bb: number;
  useBB: boolean;
  gabarit: Gabarit;
  // BB et Hero (sièges "du milieu") poussent leur jeton vers le centre, où le board est recentré
  // pour leur laisser une marge égale — mais cette marge reste, par construction, plus courte que
  // la hauteur de la pile de jetons illustrée utilisée pour les sièges de côté. Plutôt que de la
  // laisser chevaucher le board, on bascule sur un rendu compact (un point + le montant, en
  // ligne) qui tient dans l'espace réellement disponible.
  compact?: boolean;
  /**
   * MISE EN COURS DE SAISIE, pas encore validée.
   *
   * Attention au signe choisi : le jeton porte DÉJÀ un liseré en pointillés, c'est son décor de
   * jeton de casino — en rajouter ne dirait rien. Ce qui distingue le fantôme, c'est que le jeton
   * est CREUX (plus de pastille de couleur, seul le liseré reste), que tout le bloc est estompé, et
   * que le montant passe en italique. Trois signes qui disent la même chose : rien n'est joué.
   *
   * Et surtout : AUCUNE animation. Le montant change à chaque frappe, une apparition rejouée à
   * chaque chiffre serait un clignotement continu.
   */
  fantome?: boolean;
}) {
  const chipAnim = useRef(new Animated.Value(fantome ? 1 : 0)).current;

  useEffect(() => {
    if (fantome) return;
    Animated.timing(chipAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [chipAnim, fantome]);

  const scale = chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  // ⚠️ L'opacité doit sortir d'ICI, pas d'une feuille de style : elle est posée en ligne juste
  // après, et une valeur en ligne l'emporte sur tout ce qu'un tableau de styles a mis avant elle.
  // Le fantôme estompé y avait été perdu en silence (mesuré : opacité 1 alors qu'on attendait 0,5).
  const opacity = fantome
    ? chipAnim.interpolate({ inputRange: [0, 1], outputRange: [OPACITE_FANTOME, OPACITE_FANTOME] })
    : chipAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const chipStack = chipStackFor(amount, gameType, gabarit.chipsVisibles);

  if (compact) {
    return (
      <Animated.View style={[styles.compactChip, { opacity, transform: [{ scale }] }]}>
        <View
          style={[
            styles.compactDot,
            fantome ? styles.pastilleFantome : { backgroundColor: chipStack[0].color },
          ]}
        />
        {showAmount && (
          <Text style={[styles.compactAmount, fantome && styles.montantFantome]}>
            {formatChipAmount(amount, gameType, { bb, useBB }, currency)}
          </Text>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <View style={[styles.chipStack, { width: jetonLargeur(gabarit), height: jetonHauteur(gabarit) }]}>
        {chipStack.map((token, i) => (
          <View
            key={i}
            style={[
              styles.chipToken,
              {
                left: (jetonLargeur(gabarit) - gabarit.chipTokenSize) / 2,
                width: gabarit.chipTokenSize,
                height: gabarit.chipTokenSize,
                borderRadius: gabarit.chipTokenSize / 2,
                // Creux en fantôme : il ne reste que le liseré, donc la place du jeton sans le jeton.
                backgroundColor: fantome ? 'transparent' : token.color,
                zIndex: i,
                // Empilés bien droit (juste un décalage vertical, le "chant" de chaque jeton qui
                // dépasse) plutôt qu'en éventail diagonal : la pile occupe une largeur proche d'un
                // seul jeton au lieu de s'étaler sur 3, ce qui laisse bien plus de marge contre le
                // bord ovale de la table pour les sièges excentrés.
                transform: [{ translateY: i * -CHIP_STACK_OFFSET }],
              },
            ]}
          >
            <View style={styles.chipTokenInner} />
          </View>
        ))}
      </View>
      {showAmount && (
        <Text style={[styles.chipAmount, fantome && styles.montantFantome]}>
          {formatChipAmount(amount, gameType, { bb, useBB }, currency)}
        </Text>
      )}
    </Animated.View>
  );
}

export function SeatView({
  seat,
  x,
  y,
  tableCenter,
  folded,
  justFolded = false,
  justChecked = false,
  showCardBacks = false,
  stackRemaining,
  currentBet,
  isActive,
  isWinner = false,
  isAllIn = false,
  equityPct,
  equityPending,
  winnerSeatPos = null,
  gameType = 'cash',
  currency,
  bb,
  useBB = false,
  straddleLabel = null,
  holeCardCount,
  gabarit = GABARIT_FEED,
  sansGeste = false,
  miseFantome = false,
  cartesAttendues = false,
  onCartePress,
  onSiegePress,
}: SeatViewProps) {
  // Un siège qui MONTE déjà couché n'a jamais montré ses cartes : il n'a rien à faire disparaître.
  // Sans ça, les valeurs partaient de « visible » et l'effet ci-dessous les faisait fondre sur
  // 450 ms — ce qui, dans le créateur, se voyait à CHAQUE street : l'étape entière est remontée
  // (`key` par street dans `LiveHandCreator`), et les cartes de tous les couchés réapparaissaient
  // une demi-seconde avant de s'effacer à nouveau. Le replayer du feed, lui, ne remonte jamais en
  // cours de main : il n'a jamais montré ce défaut, et ce départ ne change rien pour lui.
  const cardOpacity = useRef(new Animated.Value(folded ? 0 : 1)).current;
  const cardOffset = useRef(new Animated.Value(folded ? 10 : 0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const winnerSlideAnim = useRef(new Animated.Value(0)).current;
  const haloAnim = useRef(new Animated.Value(0.35)).current;
  const winnerScale = useRef(new Animated.Value(1)).current;
  const haloLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // La mise reste affichée (et glisse vers le pot) un instant après la fin de la street, plutôt
  // que de disparaître d'un coup dès que `currentBet` retombe à zéro pour ce siège.
  const [displayBet, setDisplayBet] = useState<number | undefined>(currentBet);
  /** La mise actuellement affichée est-elle un fantôme ? Lu quand elle disparaît (cf. l'effet). */
  const etaitFantome = useRef(Boolean(miseFantome));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, {
        toValue: folded ? 0 : 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(cardOffset, {
        toValue: folded ? 10 : 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]).start();
  }, [folded, cardOpacity, cardOffset]);

  // Garde le montant affiché et glisse vers le pot en fin de street (la mise y reste ensuite,
  // elle ne disparaît pas). `displayBet` est volontairement absent des dépendances : cet effet
  // ne doit se redéclencher que lorsque `currentBet` change, pas lorsque son propre
  // `setDisplayBet` fait varier `displayBet`, sinon la boucle casse l'animation ci-dessus.
  useEffect(() => {
    if (currentBet) {
      slideAnim.setValue(0);
      setDisplayBet(currentBet);
      etaitFantome.current = Boolean(miseFantome);
    } else if (displayBet) {
      // Table de réglage : rien à raconter, donc rien à faire glisser (cf. `sansGeste`).
      // Un fantôme annulé non plus : il n'a jamais été misé, le croupier n'a rien à ramasser.
      if (sansGeste || etaitFantome.current) {
        slideAnim.setValue(0);
        setDisplayBet(undefined);
        etaitFantome.current = false;
        return;
      }
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentBet]);

  // En fin de main, les jetons DÉJÀ posés au pot (glissés là au fil des streets, cf. effet
  // ci-dessus) repartent une seconde fois, du pot vers le siège gagnant — pas seulement la
  // pastille "Pot X" (cf. BoardView), pour que le geste "les jetons vont au vainqueur" soit
  // complet visuellement. N'a d'effet que sur les sièges qui ont encore un tas affiché
  // (`displayBet`) : un siège qui n'a jamais misé n'a rien à faire glisser.
  useEffect(() => {
    if (winnerSeatPos && displayBet) {
      // Le second trajet est un décalage calculé DEPUIS le pot (`restLocal`) — mais pour le siège
      // qui a misé sur la toute dernière street jouée, `currentStreet` se fige dès la fin de la
      // main (cf. handEngine, steps de run-out) et son `currentBet` ne retombe donc jamais à zéro :
      // le premier trajet (siège→pot) ne s'est alors jamais déclenché, le jeton est resté devant
      // le siège. Sans ce filet, le second segment partirait de ce point resté faux au lieu du pot,
      // et l'addition des deux trajets enverrait le jeton bien au-delà du vainqueur, hors de la
      // table. On force donc le premier trajet à son état final AVANT de lancer le second (sans
      // effet si le jeton était déjà arrivé au pot, `setValue` sur une valeur déjà égale est un
      // no-op visuel).
      slideAnim.setValue(1);
      Animated.timing(winnerSlideAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    } else {
      // Symétrique du cas ci-dessus : en reculant dans le replayer depuis après la résolution de
      // la main vers un step antérieur, `winnerSeatPos` redevient null mais rien ne remettait
      // jusqu'ici `winnerSlideAnim` à 0 — les jetons restaient à l'opacité réduite du vainqueur
      // (0.3) alors que la main n'est plus donnée pour terminée à ce step. Remise à zéro instantanée
      // (pas d'animation) : ce n'est pas un geste à montrer, juste un état à corriger.
      winnerSlideAnim.setValue(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winnerSeatPos]);

  // Halo doré pulsant : seul signal fort mais discret indiquant "c'est à ce joueur d'agir".
  useEffect(() => {
    if (isActive) {
      haloLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(haloAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(haloAnim, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        ])
      );
      haloLoopRef.current.start();
    } else {
      haloLoopRef.current?.stop();
      haloAnim.setValue(0.35);
    }
    return () => haloLoopRef.current?.stop();
  }, [isActive, haloAnim]);

  useEffect(() => {
    if (isWinner) {
      Animated.sequence([
        Animated.timing(winnerScale, { toValue: 1.12, duration: 260, useNativeDriver: true }),
        Animated.spring(winnerScale, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    }
  }, [isWinner, winnerScale]);

  // Pop ponctuel au moment du tapis (même ressort que le "isWinner" ci-dessus, réutilisé — les
  // deux ne se produisent jamais au même step pour un même siège, pas de conflit possible). Le
  // repère rouge persistant (halo + texte "ALL-IN") reste affiché sans animation après ce pop,
  // pour ne pas distraire pendant le reste de la main.
  useEffect(() => {
    if (isAllIn) {
      Animated.sequence([
        Animated.timing(winnerScale, { toValue: 1.15, duration: 200, useNativeDriver: true }),
        Animated.spring(winnerScale, { toValue: 1, friction: 3, useNativeDriver: true }),
      ]).start();
    }
  }, [isAllIn, winnerScale]);

  // === Placement radial universel du jeton de mise ===
  // Le jeton se pose sur la LIGNE reliant le siège au centre de la table ("devant le joueur"),
  // juste au-delà du bloc cartes+badge du siège. Deux propriétés le rendent robuste pour tout
  // nombre de joueurs ET toute taille d'écran, sans aucune constante calée sur un cas précis :
  //  - chaque jeton part sur la direction radiale PROPRE à son siège ; deux sièges voisins étant à
  //    des angles différents autour de la table, leurs jetons divergent et ne peuvent pas se
  //    chevaucher. (Le bug de toutes les tentatives précédentes venait d'un décalage purement
  //    vertical, qui envoyait le jeton d'un siège de côté droit sur le siège empilé en dessous.)
  //  - la distance dérive de la géométrie réelle (taille du bloc du siège + direction), donc elle
  //    suit la taille de la table au lieu d'être un pixel figé.
  // L'anneau de felt nécessaire entre les sièges et le board vient de la table plus haute que large
  // (cf. HandReplayer, aspectRatio 0.8) : c'est ce qui garantit qu'à cette distance le jeton est
  // toujours dégagé du board et du pot, pour tous les sièges.
  const seatAnchor = { x: 40, y: ancreDepuisLeHaut(gabarit, seat.isHero) };
  const toCenterX = tableCenter.x - x;
  const toCenterY = tableCenter.y - y;
  const distToCenter = Math.hypot(toCenterX, toCenterY) || 1;
  const dirX = toCenterX / distToCenter;
  const dirY = toCenterY / distToCenter;

  // Distance pour sortir du bloc cartes+badge (rectangle ~80×80 centré sur l'ancre) dans la
  // direction du centre, + une marge, + la demi-hauteur du bloc jeton pour le poser juste devant.
  // Demi-encombrement du bloc du siège, PAR AXE. Au gabarit du feed les deux valent 40 (le bloc est
  // un carré de 80) et le calcul est exactement celui d'avant ; à l'atelier, un adversaire dont les
  // cartes ont maigri a un bloc plus court, et son jeton se pose donc plus près de lui — c'est là
  // qu'une partie du dégagement gagné face au board vient.
  const SEAT_BOX_HALF_W = 40;
  const seatBoxHalfH = blocSiegeHauteur(gabarit, seat.isHero) / 2;
  const CHIP_CLEARANCE = 6;
  const boxExit = Math.min(
    SEAT_BOX_HALF_W / (Math.abs(dirX) || 1e-6),
    seatBoxHalfH / (Math.abs(dirY) || 1e-6)
  );
  const chipDistance = boxExit + CHIP_CLEARANCE + blocMiseHauteur(gabarit) / 2;
  const chipCenter = {
    x: seatAnchor.x + dirX * chipDistance,
    y: seatAnchor.y + dirY * chipDistance,
  };

  // Position de la pastille "Pot X" : cartes du board centrées sur la table, pastille du pot
  // collée juste au-dessus (cf. BoardView), puis le même décalage de recentrage lui est appliqué —
  // calculé à partir de la taille RÉELLE de la table, pas d'une position mesurée une seule fois.
  const { height: boardCardHeight } = boardCardSize(tableCenter.x * 2, gabarit);
  const potPillCenterOffset =
    -boardCardHeight / 2 - POT_PILL_HEIGHT / 2 + boardVerticalOffset(POT_PILL_HEIGHT, gabarit);
  const restTarget = { x: tableCenter.x, y: tableCenter.y + potPillCenterOffset };
  const restDx = restTarget.x - x;
  const restDy = restTarget.y - y;
  const restLocal = { x: seatAnchor.x + restDx, y: seatAnchor.y + restDy };

  const slideTranslateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, restLocal.x - chipCenter.x],
  });
  const slideTranslateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, restLocal.y - chipCenter.y],
  });

  // Second segment du trajet, une fois la main terminée : du point de repos (au pot) jusqu'au
  // siège gagnant, dans le même repère local que `restLocal` (donc les deux segments s'additionnent
  // simplement en empilant les translateX/Y ci-dessous — pas besoin de recalculer un chemin unique).
  const winnerLocal = winnerSeatPos
    ? { x: seatAnchor.x + (winnerSeatPos.x - x), y: seatAnchor.y + (winnerSeatPos.y - y) }
    : restLocal;
  const winnerTranslateX = winnerSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, winnerLocal.x - restLocal.x],
  });
  const winnerTranslateY = winnerSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, winnerLocal.y - restLocal.y],
  });
  const winnerOpacity = winnerSlideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.3],
  });

  // === Bouton donneur (BTN) ===
  // Même principe que le jeton de mise : dérivé de la géométrie réelle du siège plutôt qu'un
  // décalage fixe à l'écran, pour rester dégagé des cartes/badge quel que soit l'angle du siège
  // autour de la table. Au lieu de sortir du bloc siège en direction du centre (comme le jeton),
  // on sort perpendiculairement (rotation à 90° de la direction vers le centre) : le bouton se
  // pose donc sur le côté du siège plutôt que devant, sans jamais entrer en conflit avec le jeton
  // de mise ni avec le board. Affiché tout au long de la main, indépendamment des fold/mises —
  // c'est un repère de position à table, pas un élément lié à l'action en cours.
  // Le signe (dirY, -dirX) plutôt que (-dirY, dirX) pointe dans le sens des sièges CROISSANT dans
  // `layoutSeats` (CO→BTN→SB→BB→…) — donc du côté du siège suivant (SB), pas du précédent (CO) :
  // le bouton doit se poser "juste après" le joueur au bouton, pas juste avant.
  const perpX = dirY;
  const perpY = -dirX;
  const btnBoxExit = Math.min(
    SEAT_BOX_HALF_W / (Math.abs(perpX) || 1e-6),
    seatBoxHalfH / (Math.abs(perpY) || 1e-6)
  );
  const btnDistance = btnBoxExit + BTN_CLEARANCE + BTN_MARKER_SIZE / 2;
  // Un pur décalage perpendiculaire laisse le bouton au même "rayon" que le siège lui-même — sur
  // un siège excentré (proche du bord ovale), ça le colle contre le rail. On ajoute donc une
  // petite composante vers le centre (dirX/dirY, déjà calculé pour le jeton) pour le ramener sur
  // le feutre, sans changer le côté (toujours du côté du siège suivant, cf. ci-dessus).
  const BTN_INWARD_NUDGE = 40;
  const btnMarkerCenter = {
    x: seatAnchor.x + perpX * btnDistance + dirX * BTN_INWARD_NUDGE,
    y: seatAnchor.y + perpY * btnDistance + dirY * BTN_INWARD_NUDGE,
  };

  // Le héros porte son nom s'il s'en est donné un, sinon « Hero » — jamais sa position : c'est le
  // narrateur de la main, pas un joueur identifié par son siège.
  const displayName = seat.isHero
    ? seat.playerName ?? 'Hero'
    : seat.playerName ?? straddleLabel ?? seat.position;
  const stackText = formatChipAmount(Math.max(stackRemaining, 0), gameType, { bb, useBB }, currency);

  return (
    <View
      style={[
        styles.wrapper,
        { left: x, top: y, transform: [{ translateX: -40 }, { translateY: -seatAnchor.y }] },
      ]}
      // `box-none` : le bloc lui-même n'est jamais la cible, mais ses enfants peuvent l'être. Sans
      // ça, `none` couperait aussi les cartes, et le Pressable posé dessous ne recevrait rien.
      pointerEvents={onCartePress || onSiegePress ? 'box-none' : 'none'}
    >
      <Animated.View
        style={[
          styles.cardsRow,
          { opacity: cardOpacity, transform: [{ translateY: cardOffset }] },
        ]}
      >
        {(() => {
          // Nombre de cartes à dessiner : la vraie longueur si la main est connue, sinon le nombre
          // imposé par la variante (dos de carte pour un adversaire inconnu ou masqué).
          // Un siège dont on ATTEND les cartes en dessine toujours le compte complet : les places
          // vides sont des emplacements à remplir, pas des cartes absentes.
          const n = cartesAttendues ? holeCardCount : seat.holeCards?.length ?? holeCardCount;
          const fan = n >= 4;
          const carte2 = seat.isHero ? gabarit.carteHero : gabarit.carteVilain;
          const dims = fan
            ? seat.isHero
              ? HOLE_CARD_FAN_HERO
              : HOLE_CARD_FAN_VILLAIN
            : { w: carte2.width, h: carte2.height };
          return Array.from({ length: n }).map((_, i) => {
            const card = showCardBacks || !seat.holeCards ? undefined : seat.holeCards[i];
            const centered = i - (n - 1) / 2;
            const laCarte =
              cartesAttendues && !card ? (
                <View style={[styles.carteAttendue, { width: dims.w, height: dims.h }]} />
              ) : (
                <CardView card={card} width={dims.w} height={dims.h} />
              );
            return (
              <View
                key={i}
                style={{
                  marginLeft: i === 0 ? 0 : fan ? -dims.w * FAN_OVERLAP : 3,
                  zIndex: i,
                  transform: fan
                    ? [{ rotate: `${centered * FAN_ANGLE}deg` }, { translateY: Math.abs(centered) * FAN_ARC }]
                    : undefined,
                }}
              >
                {/* On n'enveloppe QUE si quelqu'un écoute : un `Pressable` inerte reste un nœud de
                    plus dans l'arbre, et il a suffi une fois à décaler tout le rendu du feed.
                    Mais on enveloppe AUSSI les emplacements vides : à l'abattage, taper le siège
                    d'un adversaire est la façon de le choisir, et un adversaire qu'on n'a pas
                    encore saisi n'a QUE des emplacements vides — il devenait donc intouchable dès
                    qu'un premier adversaire avait reçu ses cartes. Ailleurs, taper un vide ne
                    retire rien : les trois appelants sont sans effet sur un emplacement déjà libre. */}
                {onCartePress ? (
                  <Pressable onPress={() => onCartePress(i)}>{laCarte}</Pressable>
                ) : (
                  laCarte
                )}
              </View>
            );
          });
        })()}
      </Animated.View>

      <Animated.View style={[styles.badge, { transform: [{ scale: winnerScale }] }]}>
        {isAllIn ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, styles.haloAllIn, { transform: [{ scale: winnerScale }] }]}
          />
        ) : (
          isActive && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.halo,
                gabarit.haloAppuye && styles.haloAppuye,
                { opacity: haloAnim, transform: [{ scale: winnerScale }] },
              ]}
            />
          )
        )}
        <Text
          style={[
            typography.seatName,
            styles.name,
            folded && styles.textFolded,
            isWinner && styles.textWinner,
          ]}
          numberOfLines={1}
        >
          {displayName}
        </Text>
        {/*
          UNE SEULE RÈGLE, et elle s'énonce en une phrase : cette ligne dit ce que le joueur VIENT
          de faire ; à défaut, elle affiche son stack.

          « fold » et « check » ne durent donc que le step de leur action. « fold » persistait
          auparavant toute la main, ce qui masquait définitivement le stack d'un joueur couché —
          alors que savoir qui est court et qui est profond fait partie de la lecture d'un coup, y
          compris pour les joueurs sortis. Qu'un siège soit couché reste dit par deux signaux
          permanents, eux : ses cartes ont disparu et son nom est estompé. Le mot était un
          troisième signal, redondant, qui coûtait une information.

          L'ordre compte. Les deux libellés ponctuels passent devant tout le reste, y compris
          l'équité : la placer avant reviendrait à ne jamais montrer le check dans les mains où
          toutes les cartes sont connues, c'est-à-dire celles où le replay est le plus détaillé.
          Le % revient au step suivant, il n'est perdu que pour cet instant et sur ce seul siège.
          Vient ensuite `folded`, qui coupe court : un siège couché n'a plus ni équité ni tapis à
          annoncer, il n'est plus dans le coup.
        */}
        {justFolded ? (
          <Text style={styles.foldLabel}>fold</Text>
        ) : justChecked ? (
          <Text style={styles.checkLabel}>check</Text>
        ) : folded ? (
          <Text style={[typography.stackAmount, styles.stack, styles.textFolded]}>{stackText}</Text>
        ) : miseFantome ? (
          // Le tapis PROJETÉ prend la place du vrai — c'est tout l'intérêt du fantôme : voir ce
          // qu'il resterait. La flèche dit qu'on regarde un après, l'italique qu'il n'est pas acquis.
          <Text style={[typography.stackAmount, styles.stack, styles.stackFantome]}>{`→ ${stackText}`}</Text>
        ) : equityPct != null ? (
          <Text style={styles.equityLabel}>{Math.round(equityPct)}%</Text>
        ) : equityPending ? (
          // Espace insécable, PAS un bloc démonté : le pourcentage arrive dans quelques dizaines de
          // millisecondes, et une ligne qui disparaît puis revient ferait sauter tout le badge de
          // quelques pixels. Même remède que la bulle d'action (cf. `ActionCallout`).
          <Text style={styles.equityLabel}>{'\u00A0'}</Text>
        ) : isAllIn ? (
          <Text style={styles.allInLabel}>ALL-IN</Text>
        ) : (
          <Text style={[typography.stackAmount, styles.stack, isWinner && styles.textWinner]}>
            {stackText}
          </Text>
        )}
        {/* Posée EN DERNIER : dans l'ordre de peinture, elle recouvre le nom et le tapis, donc
            c'est elle qui reçoit le toucher. Le halo, lui, reste devant à l'œil — il est dessiné
            avant mais déborde du badge, et cette cible est transparente. */}
        {onSiegePress ? <Pressable onPress={onSiegePress} style={styles.cibleSiege} /> : null}
      </Animated.View>

      {seat.position === 'BTN' && (
        <View
          style={[
            styles.buttonMarker,
            {
              left: btnMarkerCenter.x - BTN_MARKER_SIZE / 2,
              top: btnMarkerCenter.y - BTN_MARKER_SIZE / 2,
            },
          ]}
        >
          <Text style={styles.buttonMarkerText}>D</Text>
        </View>
      )}

      {displayBet ? (
        <Animated.View
          style={[
            styles.betChip,
            {
              left: chipCenter.x - CHIP_BLOCK_W / 2,
              top: chipCenter.y - blocMiseHauteur(gabarit) / 2,
              transform: [
                { translateX: slideTranslateX },
                { translateY: slideTranslateY },
                { translateX: winnerTranslateX },
                { translateY: winnerTranslateY },
              ],
              opacity: winnerOpacity,
            },
          ]}
        >
          <BetChipPopIn
            // Clé STABLE tant qu'on saisit : sans ça, chaque chiffre tapé démonterait et
            // remonterait le bloc — le remède de l'animation ne suffirait pas, la valeur animée
            // repartirait de zéro à chaque frappe.
            key={miseFantome ? 'fantome' : displayBet}
            amount={displayBet}
            gameType={gameType}
            currency={currency}
            showAmount={Boolean(currentBet)}
            bb={bb}
            useBB={useBB}
            gabarit={gabarit}
            fantome={miseFantome}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // La translation verticale est posée au rendu (elle dépend du gabarit et de qui occupe le siège) ;
  // l'horizontale l'accompagne là-bas pour ne pas être écrasée par elle.
  wrapper: {
    position: 'absolute',
    alignItems: 'center',
    width: 80,
  },
  cardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Espacement/chevauchement géré par le marginLeft de chaque carte (cf. rendu de l'éventail),
    // pas par `gap` : les deux se cumuleraient sinon.
    marginBottom: 4,
  },
  badge: {
    position: 'relative',
    alignItems: 'center',
  },
  // La cible tactile du siège reprend EXACTEMENT la géométrie du halo : elle couvre le badge et
  // le peu de marge qui l'entoure. En absolu, donc sans ajouter la moindre boîte de mise en page —
  // un `Pressable` qui envelopperait le badge, lui, en ajouterait une, et déplacerait les noms.
  cibleSiege: {
    position: 'absolute',
    top: -4,
    left: -8,
    right: -8,
    bottom: -4,
  },
  halo: {
    position: 'absolute',
    top: -4,
    left: -8,
    right: -8,
    bottom: -4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.gold,
  },
  // Le halo APPUYÉ de l'atelier : un fond, pas seulement un trait. Il n'existe que là où le halo
  // porte seul l'information « c'est à lui » — dans le feed, la bulle d'action le double déjà.
  haloAppuye: {
    backgroundColor: 'rgba(201,162,39,0.3)',
    borderWidth: 2,
  },
  // Contrairement au halo doré "à toi de jouer" (pulsant, ponctuel), celui-ci reste fixe tant que
  // le siège est à tapis — pas d'opacité animée en boucle, pour ne pas distraire le reste de la
  // main. Remplace toujours le halo doré (jamais les deux en même temps sur un même siège).
  haloAllIn: {
    borderColor: colors.cardTextRed,
    borderWidth: 2,
  },
  // Bouton donneur : disque plein (bordure continue) plutôt que pointillée comme les jetons de
  // mise, pour signaler visuellement qu'il s'agit d'un repère de position et non d'argent misé.
  buttonMarker: {
    position: 'absolute',
    width: BTN_MARKER_SIZE,
    height: BTN_MARKER_SIZE,
    borderRadius: radius.full,
    backgroundColor: colors.cardFace,
    borderWidth: 1.5,
    borderColor: colors.gold,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  buttonMarkerText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  name: {
    color: colors.textOnFelt,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  stack: {
    color: colors.gold,
    fontSize: 11,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  textFolded: {
    opacity: 0.45,
  },
  textWinner: {
    color: colors.goldBright,
  },
  foldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.goldBright,
    opacity: 0.85,
    textTransform: 'lowercase',
  },
  // Volontairement identique à `foldLabel` : ce sont les deux seules choses qu'un joueur peut faire
  // sans poser un jeton, elles se lisent donc de la même façon. Style dupliqué plutôt que partagé
  // pour qu'on puisse en changer une sans toucher l'autre — elles n'ont pas la même durée de vie.
  checkLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.goldBright,
    opacity: 0.85,
    textTransform: 'lowercase',
  },
  allInLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.cardTextRed,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  equityLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  betChip: {
    position: 'absolute',
    width: CHIP_BLOCK_W,
    alignItems: 'center',
  },
  // Largeur, hauteur et taille des jetons viennent du gabarit au moment du rendu (cf. `jetonLargeur`
  // / `jetonHauteur`) : ce sont les seules dimensions de ce fichier que l'atelier fait varier.
  chipStack: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chipToken: {
    position: 'absolute',
    bottom: 0,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
  },
  chipTokenInner: {
    width: CHIP_TOKEN_INNER_SIZE,
    height: CHIP_TOKEN_INNER_SIZE,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  // LE FANTÔME. Quatre écarts avec une vraie mise, et il en faut quatre : les trois premiers
  // essayés (jeton creux, bloc estompé, italique) restaient « un poil trop légers » à l'usage.
  // Le quatrième est le plus fort et le plus simple : LA COULEUR. L'or, dans toute l'app, c'est de
  // l'argent qui existe. Un montant qui n'est pas encore joué n'a rien à faire en or.
  // La carte qu'on attend devant un siège — même dessin que sur le board, à l'échelle du siège.
  carteAttendue: {
    borderRadius: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.38)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Réglage du 31/08, en deux temps : l'or estompé ne se distinguait pas assez d'une vraie mise,
  // le blanc ÉTEINT (`textOnFeltMuted`, déjà à 60 % d'alpha) devenait trop pâle une fois multiplié
  // par l'opacité du bloc. L'entre-deux retenu : le blanc PLEIN du feutre, à 60 % de bloc. Ce qui
  // porte la différence reste la couleur — l'or, dans toute l'app, c'est de l'argent qui existe.
  montantFantome: {
    fontStyle: 'italic',
    fontWeight: '500',
    color: colors.textOnFelt,
    textShadowColor: 'transparent',
  },
  pastilleFantome: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.textOnFelt,
  },
  stackFantome: {
    fontStyle: 'italic',
    color: colors.textOnFelt,
  },
  chipAmount: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: colors.gold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  compactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  compactAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.gold,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
