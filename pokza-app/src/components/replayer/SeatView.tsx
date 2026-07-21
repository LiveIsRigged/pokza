import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { GameType, Seat } from '../../types/poker';
import { cashChipColors, chipColors, colors, radius, typography } from '../../theme/theme';
import { formatChipAmount } from '../../utils/chipFormat';
import { CardView } from './CardView';

interface SeatViewProps {
  seat: Seat;
  x: number;
  y: number;
  tableCenter: { x: number; y: number };
  folded: boolean;
  stackRemaining: number;
  currentBet?: number;
  isActive: boolean;
  isWinner?: boolean;
  gameType?: GameType;
}

const CASH_DENOMS = [1000, 100, 25, 5, 1] as const;
const TOURNAMENT_DENOMS = [5000, 1000, 100, 25, 10, 5, 1] as const;
const MAX_VISIBLE_CHIPS = 3;

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
}: {
  amount: number;
  gameType: GameType;
  showAmount: boolean;
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
                transform: [{ translateX: i * 4 }, { translateY: i * -3 }],
              },
            ]}
          >
            <View style={styles.chipTokenInner} />
          </View>
        ))}
      </View>
      {showAmount && (
        <Text style={styles.chipAmount}>{formatChipAmount(amount, gameType)}</Text>
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
  stackRemaining,
  currentBet,
  isActive,
  isWinner = false,
  gameType = 'cash',
}: SeatViewProps) {
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardOffset = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
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

  // Le jeton de mise (icône + montant) est trop haut pour tenir dans le petit espace entre les
  // cartes et le badge : pendant que la mise est active, il flotte à mi-chemin vers le centre de
  // la table, en terrain dégagé, comme une vraie mise posée devant le siège plutôt que collée
  // dessus. Deux cibles différentes sont utilisées (pas la même point à deux moments) :
  // - `activeTarget` : décalage modeste, calibré pour dégager les propres cartes/badge du siège
  //   pendant que la mise est active — pas assez pour aussi dégager le badge de BB, mais BB n'a
  //   pas besoin d'en être protégé à ce stade puisque le jeton reste proche de son propre siège.
  // - `restTarget` : un seul point, décalé bien plus loin, partagé par TOUS les sièges — une fois
  //   la street terminée, la mise y glisse entièrement (100%, pas une fraction) et s'y arrête :
  //   un seul endroit discret pour toutes les mises "posées", plutôt que dispersées sur la table.
  const seatAnchor = { x: 40, y: 39 };
  const activeTarget = { x: tableCenter.x, y: tableCenter.y - 50 };
  const activeDx = activeTarget.x - x;
  const activeDy = activeTarget.y - y;
  const chipCenter = { x: seatAnchor.x + activeDx * 0.42, y: seatAnchor.y + activeDy * 0.42 };

  const restTarget = { x: tableCenter.x, y: tableCenter.y - 90 };
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

  const displayName = seat.playerName ?? seat.position;

  return (
    <View style={[styles.wrapper, { left: x, top: y }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.cardsRow,
          { opacity: cardOpacity, transform: [{ translateY: cardOffset }] },
        ]}
      >
        <CardView card={seat.holeCards?.[0]} size="medium" />
        <CardView card={seat.holeCards?.[1]} size="medium" />
      </Animated.View>

      <Animated.View style={[styles.badge, isActive && { transform: [{ scale: winnerScale }] }]}>
        {isActive && (
          <Animated.View
            pointerEvents="none"
            style={[styles.halo, { opacity: haloAnim, transform: [{ scale: winnerScale }] }]}
          />
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
        ) : (
          <Text style={[typography.stackAmount, styles.stack, isWinner && styles.textWinner]}>
            {formatChipAmount(Math.max(stackRemaining, 0), gameType)}
          </Text>
        )}
      </Animated.View>

      {displayBet ? (
        <Animated.View
          style={[
            styles.betChip,
            {
              left: chipCenter.x - 20,
              top: chipCenter.y - 22,
              transform: [{ translateX: slideTranslateX }, { translateY: slideTranslateY }],
            },
          ]}
        >
          <BetChipPopIn
            key={displayBet}
            amount={displayBet}
            gameType={gameType}
            showAmount={Boolean(currentBet)}
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
  betChip: {
    position: 'absolute',
    width: 40,
    alignItems: 'center',
  },
  chipStack: {
    width: 34,
    height: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chipToken: {
    position: 'absolute',
    left: 8,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.55)',
  },
  chipTokenInner: {
    width: 5,
    height: 5,
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
});
