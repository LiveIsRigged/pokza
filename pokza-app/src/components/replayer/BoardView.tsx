import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { Card } from '../../types/poker';
import { colors } from '../../theme/theme';
import { CardView } from './CardView';
import { ChipsView } from './ChipsView';

interface BoardViewProps {
  cards: Card[];
  pot: number;
  winningSeatId?: string | null;
  winnerSeatCoords?: { x: number; y: number } | null;
}

export function BoardView({ cards, pot, winningSeatId, winnerSeatCoords }: BoardViewProps) {
  const chipsTranslateX = useRef(new Animated.Value(0)).current;
  const chipsTranslateY = useRef(new Animated.Value(0)).current;
  const chipsOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (winningSeatId && winnerSeatCoords) {
      // Animate chips towards winner seat
      Animated.parallel([
        Animated.timing(chipsTranslateX, {
          toValue: winnerSeatCoords.x,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(chipsTranslateY, {
          toValue: winnerSeatCoords.y,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(chipsOpacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      // Reset animation
      chipsTranslateX.setValue(0);
      chipsTranslateY.setValue(0);
      chipsOpacity.setValue(1);
    }
  }, [winningSeatId, winnerSeatCoords, chipsTranslateX, chipsTranslateY, chipsOpacity]);

  return (
    <View style={styles.wrapper} pointerEvents="none">
      <View style={styles.chipsFloat}>
        <Animated.View
          style={[
            styles.chipsContainer,
            {
              transform: [
                { translateX: chipsTranslateX },
                { translateY: chipsTranslateY },
              ],
              opacity: chipsOpacity,
            },
          ]}
        >
          <ChipsView amount={pot} />
        </Animated.View>
      </View>

      <View style={styles.cardsRow}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.slot}>
            {cards[i] ? <CardView card={cards[i]} size="medium" /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  chipsFloat: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    width: '100%',
    alignItems: 'center',
  },
  chipsContainer: {},
  cardsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  slot: {
    width: 34,
    height: 46,
  },
});
