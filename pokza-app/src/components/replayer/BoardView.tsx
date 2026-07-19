import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Card } from '../../types/poker';
import { colors, typography } from '../../theme/theme';
import { CardView } from './CardView';

interface BoardViewProps {
  cards: Card[];
  pot: number;
}

export function BoardView({ cards, pot }: BoardViewProps) {
  return (
    <View style={styles.wrapper} pointerEvents="none">
      <Text style={[typography.potAmount, styles.pot]}>Pot {pot}</Text>
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
    alignItems: 'center',
  },
  pot: {
    color: colors.gold,
    marginBottom: 6,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  slot: {
    width: 34,
    height: 46,
  },
});
