import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Card } from '../../types/poker';
import { colors } from '../../theme/theme';

const SUIT_SYMBOL: Record<Card['suit'], string> = {
  h: '♥',
  d: '♦',
  c: '♣',
  s: '♠',
};

const RED_SUITS = new Set(['h', 'd']);

interface CardViewProps {
  card?: Card;
  size?: 'small' | 'medium';
  /** Dimensions explicites (prioritaires sur `size`), pour un dimensionnement responsive (ex: board) */
  width?: number;
  height?: number;
}

export function CardView({ card, size = 'small', width, height }: CardViewProps) {
  const preset = size === 'small' ? { width: 20, height: 26 } : { width: 34, height: 46 };
  const dims = { width: width ?? preset.width, height: height ?? preset.height };
  const fontSize = Math.round(dims.height * 0.33);

  if (!card) {
    return (
      <View style={[styles.card, dims, styles.back]}>
        <View style={styles.backInner} />
      </View>
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  return (
    <View style={[styles.card, dims, styles.face]}>
      <Text style={[styles.rank, { fontSize, color: isRed ? colors.cardTextRed : colors.cardTextBlack }]}>
        {card.rank}
      </Text>
      <Text style={[styles.suit, { fontSize: fontSize - 1, color: isRed ? colors.cardTextRed : colors.cardTextBlack }]}>
        {SUIT_SYMBOL[card.suit]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    backgroundColor: colors.cardBack,
    borderWidth: 1.5,
    borderColor: colors.cardBackBorder,
  },
  backInner: {
    width: '60%',
    height: '70%',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.cardBackBorder,
    opacity: 0.6,
  },
  face: {
    backgroundColor: colors.cardFace,
    borderWidth: 1,
    borderColor: '#D8D4C8',
  },
  rank: {
    fontWeight: '700',
    lineHeight: undefined,
  },
  suit: {
    marginTop: -2,
  },
});
