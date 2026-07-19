import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Seat } from '../../types/poker';
import { chipColors, colors, typography } from '../../theme/theme';
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
}

function chipColorFor(amount: number): string {
  if (amount >= 1000) return chipColors[1000];
  if (amount >= 100) return chipColors[100];
  if (amount >= 25) return chipColors[25];
  if (amount >= 10) return chipColors[10];
  if (amount >= 5) return chipColors[5];
  return chipColors[1];
}

export function SeatView({ seat, x, y, tableCenter, folded, stackRemaining, currentBet, isActive }: SeatViewProps) {
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const chipAnim = useRef(new Animated.Value(0)).current;
  const prevBetRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    Animated.timing(cardOpacity, {
      toValue: folded ? 0.18 : 1,
      duration: 450,
      useNativeDriver: true,
    }).start();
  }, [folded, cardOpacity]);

  useEffect(() => {
    if (currentBet && currentBet !== prevBetRef.current) {
      chipAnim.setValue(0);
      Animated.timing(chipAnim, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
    }
    prevBetRef.current = currentBet;
  }, [currentBet, chipAnim]);

  const dx = tableCenter.x - x;
  const dy = tableCenter.y - y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const towardCenter = { x: dx / dist, y: dy / dist };

  const chipTranslateX = chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0, towardCenter.x * 26] });
  const chipTranslateY = chipAnim.interpolate({ inputRange: [0, 1], outputRange: [0, towardCenter.y * 26] });
  const chipOpacity = chipAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] });

  const displayName = seat.playerName ?? seat.position;

  return (
    <View style={[styles.wrapper, { left: x, top: y }]} pointerEvents="none">
      <Animated.View style={[styles.cardsRow, { opacity: cardOpacity }]}>
        <CardView card={seat.isHero ? seat.holeCards?.[0] : undefined} />
        <CardView card={seat.isHero ? seat.holeCards?.[1] : undefined} />
      </Animated.View>

      <View style={[styles.badge, isActive && styles.badgeActive]}>
        <Text style={[typography.contextLine, styles.name]} numberOfLines={1}>
          {seat.position !== displayName ? displayName : seat.position}
        </Text>
        <Text style={[typography.stackAmount, styles.stack]}>{Math.max(stackRemaining, 0)}</Text>
        {folded && <Text style={styles.foldLabel}>fold</Text>}
      </View>

      {currentBet ? (
        <Animated.View
          style={[
            styles.chip,
            {
              backgroundColor: chipColorFor(currentBet),
              opacity: chipOpacity,
              transform: [{ translateX: chipTranslateX }, { translateY: chipTranslateY }],
            },
          ]}
        >
          <Text style={styles.chipText}>{currentBet}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    alignItems: 'center',
    transform: [{ translateX: -30 }, { translateY: -30 }],
    width: 60,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 3,
  },
  badge: {
    backgroundColor: colors.tableRail,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.25)',
    alignItems: 'center',
    minWidth: 56,
  },
  badgeActive: {
    borderColor: colors.gold,
    borderWidth: 1.5,
  },
  name: {
    color: colors.textOnFelt,
    fontWeight: '700',
  },
  stack: {
    color: colors.gold,
  },
  foldLabel: {
    fontSize: 9,
    color: colors.textOnFeltMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  chip: {
    position: 'absolute',
    top: 34,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  chipText: {
    fontSize: 8,
    color: '#fff',
    fontWeight: '700',
  },
});
