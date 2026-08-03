import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { GameType, Seat } from '../../types/poker';
import { cashChipColors, chipColors, colors, radius, typography } from '../../theme/theme';
import { formatChipAmount } from '../../utils/chipFormat';
import {
  POT_PILL_HEIGHT,
  boardCardSize,
  boardVerticalOffset,
} from '../../engine/layout';
import { CardView } from './CardView';

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
  stackRemaining: number;
  currentBet?: number;
  isActive: boolean;
  isWinner?: boolean;
  /** Stack à 0, toujours dans le coup — persiste jusqu'à la fin de la main (cf. handEngine). */
  isAllIn?: boolean;
  /** % d'équité (tapis avant la river) — remplace temporairement stack/ALL-IN tant que la main
   * n'est pas résolue (cf. `computeEquity`). */
  equityPct?: number;
  /** Coordonnées ABSOLUES (repère table) du siège gagnant, une fois la main terminée — sert à faire
   * glisser les jetons déjà posés au pot jusqu'au vainqueur, en plus de la pastille "Pot X". */
  winnerSeatPos?: { x: number; y: number } | null;
  gameType?: GameType;
  /** Grosse blinde de la main — sert à convertir les montants affichés quand `useBB` est activé. */
  bb: number;
  /** Préférence globale au feed (cf. `useDisplayUnit`) : montants en BB plutôt qu'en jetons bruts. */
  useBB?: boolean;
  /** "Straddle" / "Double straddle" / "Triple straddle" si ce siège a posté un straddle — remplace
   * l'acronyme de position (UTG, HJ...) tant qu'aucun nom de joueur personnalisé n'est défini. */
  straddleLabel?: string | null;
}

const CASH_DENOMS = [1000, 100, 25, 5, 1] as const;
const TOURNAMENT_DENOMS = [5000, 1000, 100, 25, 10, 5, 1] as const;
const MAX_VISIBLE_CHIPS = 3;
const BTN_MARKER_SIZE = 20;
const BTN_CLEARANCE = 4;

// Jetons 20% plus petits qu'à l'origine (14px → 11px) et empilés bien droit plutôt qu'en éventail
// diagonal : la pile occupe une largeur proche d'un seul jeton, ce qui laisse plus de marge contre
// le board (sièges du milieu) et contre le bord ovale de la table (sièges excentrés) — cf. SeatView.
const CHIP_TOKEN_SIZE = 11;
const CHIP_TOKEN_INNER_SIZE = 4;
const CHIP_STACK_OFFSET = 2;
const CHIP_STACK_WIDTH = CHIP_TOKEN_SIZE + 6;
const CHIP_STACK_HEIGHT = CHIP_TOKEN_SIZE + (MAX_VISIBLE_CHIPS - 1) * CHIP_STACK_OFFSET;
// Encombrement total du bloc mise (pile de jetons + montant en dessous) : sert au placement radial
// (demi-hauteur = distance à laisser devant le siège) et au centrage du conteneur.
const CHIP_BLOCK_W = 28;
const CHIP_BLOCK_H = CHIP_STACK_HEIGHT + 2 + 12;

interface ChipToken {
  denom: number;
  color: string;
}

// Une mise "économise" ses jetons par dénomination (ex: 45 → 1 vert (25) + 4 rouges (5)) au lieu
// d'un seul rond générique — plus lisible, et plus proche de ce qu'on voit sur une vraie table.
function chipStackFor(amount: number, gameType: GameType): ChipToken[] {
  const denoms: readonly number[] = gameType === 'cash' ? CASH_DENOMS : TOURNAMENT_DENOMS;
  const palette: Record<number, string> = gameType === 'cash' ? cashChipColors : chipColors;
  const stack: ChipToken[] = [];
  let remaining = amount;
  for (const denom of denoms) {
    while (remaining >= denom && stack.length < MAX_VISIBLE_CHIPS) {
      stack.push({ denom, color: palette[denom] });
      remaining -= denom;
    }
    if (stack.length >= MAX_VISIBLE_CHIPS) break;
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
  showAmount,
  bb,
  useBB,
  compact = false,
}: {
  amount: number;
  gameType: GameType;
  showAmount: boolean;
  bb: number;
  useBB: boolean;
  // BB et Hero (sièges "du milieu") poussent leur jeton vers le centre, où le board est recentré
  // pour leur laisser une marge égale — mais cette marge reste, par construction, plus courte que
  // la hauteur de la pile de jetons illustrée utilisée pour les sièges de côté. Plutôt que de la
  // laisser chevaucher le board, on bascule sur un rendu compact (un point + le montant, en
  // ligne) qui tient dans l'espace réellement disponible.
  compact?: boolean;
}) {
  const chipAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(chipAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [chipAnim]);

  const scale = chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const opacity = chipAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });
  const chipStack = chipStackFor(amount, gameType);

  if (compact) {
    return (
      <Animated.View style={[styles.compactChip, { opacity, transform: [{ scale }] }]}>
        <View style={[styles.compactDot, { backgroundColor: chipStack[0].color }]} />
        {showAmount && (
          <Text style={styles.compactAmount}>{formatChipAmount(amount, gameType, { bb, useBB })}</Text>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <View style={styles.chipStack}>
        {chipStack.map((token, i) => (
          <View
            key={i}
            style={[
              styles.chipToken,
              {
                backgroundColor: token.color,
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
        <Text style={styles.chipAmount}>{formatChipAmount(amount, gameType, { bb, useBB })}</Text>
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
  showCardBacks = false,
  stackRemaining,
  currentBet,
  isActive,
  isWinner = false,
  isAllIn = false,
  equityPct,
  winnerSeatPos = null,
  gameType = 'cash',
  bb,
  useBB = false,
  straddleLabel = null,
}: SeatViewProps) {
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardOffset = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const winnerSlideAnim = useRef(new Animated.Value(0)).current;
  const haloAnim = useRef(new Animated.Value(0.35)).current;
  const winnerScale = useRef(new Animated.Value(1)).current;
  const haloLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // La mise reste affichée (et glisse vers le pot) un instant après la fin de la street, plutôt
  // que de disparaître d'un coup dès que `currentBet` retombe à zéro pour ce siège.
  const [displayBet, setDisplayBet] = useState<number | undefined>(currentBet);

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
    } else if (displayBet) {
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
  const seatAnchor = { x: 40, y: 39 };
  const toCenterX = tableCenter.x - x;
  const toCenterY = tableCenter.y - y;
  const distToCenter = Math.hypot(toCenterX, toCenterY) || 1;
  const dirX = toCenterX / distToCenter;
  const dirY = toCenterY / distToCenter;

  // Distance pour sortir du bloc cartes+badge (rectangle ~80×80 centré sur l'ancre) dans la
  // direction du centre, + une marge, + la demi-hauteur du bloc jeton pour le poser juste devant.
  const SEAT_BOX_HALF = 40;
  const CHIP_CLEARANCE = 6;
  const boxExit = Math.min(
    SEAT_BOX_HALF / (Math.abs(dirX) || 1e-6),
    SEAT_BOX_HALF / (Math.abs(dirY) || 1e-6)
  );
  const chipDistance = boxExit + CHIP_CLEARANCE + CHIP_BLOCK_H / 2;
  const chipCenter = {
    x: seatAnchor.x + dirX * chipDistance,
    y: seatAnchor.y + dirY * chipDistance,
  };

  // Position de la pastille "Pot X" : cartes du board centrées sur la table, pastille du pot
  // collée juste au-dessus (cf. BoardView), puis le même décalage de recentrage lui est appliqué —
  // calculé à partir de la taille RÉELLE de la table, pas d'une position mesurée une seule fois.
  const { height: boardCardHeight } = boardCardSize(tableCenter.x * 2);
  const potPillCenterOffset = -boardCardHeight / 2 - POT_PILL_HEIGHT / 2 + boardVerticalOffset();
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
    SEAT_BOX_HALF / (Math.abs(perpX) || 1e-6),
    SEAT_BOX_HALF / (Math.abs(perpY) || 1e-6)
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

  // Hero garde toujours "Hero" — jamais sa position ni un nom personnalisé (buildSeats ne lui en
  // assigne d'ailleurs jamais) : c'est le narrateur de la main, pas un joueur identifié par siège.
  const displayName = seat.isHero ? 'Hero' : seat.playerName ?? straddleLabel ?? seat.position;

  return (
    <View style={[styles.wrapper, { left: x, top: y }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.cardsRow,
          { opacity: cardOpacity, transform: [{ translateY: cardOffset }] },
        ]}
      >
        <CardView card={showCardBacks ? undefined : seat.holeCards?.[0]} size="medium" />
        <CardView card={showCardBacks ? undefined : seat.holeCards?.[1]} size="medium" />
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
              style={[styles.halo, { opacity: haloAnim, transform: [{ scale: winnerScale }] }]}
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
        {folded ? (
          <Text style={styles.foldLabel}>fold</Text>
        ) : equityPct != null ? (
          <Text style={styles.equityLabel}>{Math.round(equityPct)}%</Text>
        ) : isAllIn ? (
          <Text style={styles.allInLabel}>ALL-IN</Text>
        ) : (
          <Text style={[typography.stackAmount, styles.stack, isWinner && styles.textWinner]}>
            {formatChipAmount(Math.max(stackRemaining, 0), gameType, { bb, useBB })}
          </Text>
        )}
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
              top: chipCenter.y - CHIP_BLOCK_H / 2,
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
            key={displayBet}
            amount={displayBet}
            gameType={gameType}
            showAmount={Boolean(currentBet)}
            bb={bb}
            useBB={useBB}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -40 }, { translateY: -39 }],
    width: 80,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 4,
  },
  badge: {
    position: 'relative',
    alignItems: 'center',
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
  chipStack: {
    width: CHIP_STACK_WIDTH,
    height: CHIP_STACK_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chipToken: {
    position: 'absolute',
    left: (CHIP_STACK_WIDTH - CHIP_TOKEN_SIZE) / 2,
    bottom: 0,
    width: CHIP_TOKEN_SIZE,
    height: CHIP_TOKEN_SIZE,
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
