import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { Card, GameType } from '../../types/poker';
import { colors } from '../../theme/theme';
import { CardView } from './CardView';
import { ChipsView } from './ChipsView';

interface BoardViewProps {
  cards: Card[];
  pot: number;
  winningSeatId?: string | null;
  winnerSeatCoords?: { x: number; y: number } | null;
  gameType?: GameType;
  /** Largeur de la table : sert à dimensionner les cartes pour qu'elles ne débordent jamais sur les sièges. */
  tableWidth?: number;
}

const CARD_GAP = 4;
const CARD_ASPECT = 46 / 34;

export function BoardView({
  cards,
  pot,
  winningSeatId,
  winnerSeatCoords,
  gameType = 'cash',
  tableWidth = 0,
}: BoardViewProps) {
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

  // Les 5 cartes ne doivent jamais déborder sur les badges des sièges latéraux : on les
  // dimensionne à partir de la largeur réelle de la table plutôt qu'une taille fixe.
  const maxCardsWidth = tableWidth * 0.6;
  const cardWidth = tableWidth > 0 ? Math.max(20, Math.min(34, (maxCardsWidth - 4 * CARD_GAP) / 5)) : 34;
  const cardHeight = Math.round(cardWidth * CARD_ASPECT);

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
          <ChipsView amount={pot} gameType={gameType} isWinning={Boolean(winningSeatId)} />
        </Animated.View>
      </View>

      <View style={[styles.cardsRow, { gap: CARD_GAP }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: cardWidth, height: cardHeight }}>
            {cards[i] ? <CardView card={cards[i]} width={cardWidth} height={cardHeight} /> : null}
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
    marginBottom: 0,
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  chipsContainer: {},
  cardsRow: {
    flexDirection: 'row',
  },
});
