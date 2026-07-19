import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Card, Rank, Suit } from '../types/poker';
import { colors } from '../theme/theme';
import { CardView } from '../components/replayer/CardView';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { suit: Suit; symbol: string; red: boolean }[] = [
  { suit: 's', symbol: '♠', red: false },
  { suit: 'h', symbol: '♥', red: true },
  { suit: 'd', symbol: '♦', red: true },
  { suit: 'c', symbol: '♣', red: false },
];

interface CardPickerProps {
  label: string;
  value?: Card;
  onChange: (card: Card) => void;
  /** Cartes déjà utilisées ailleurs dans la main, à désactiver pour éviter les doublons */
  disabledCards?: Card[];
}

function sameCard(a: Card, b: Card) {
  return a.rank === b.rank && a.suit === b.suit;
}

export function CardPicker({ label, value, onChange, disabledCards = [] }: CardPickerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.preview}>
          <CardView card={value} size="medium" />
        </View>
      </View>

      {SUITS.map(({ suit, symbol, red }) => (
        <ScrollView
          key={suit}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suitRow}
        >
          {RANKS.map((rank) => {
            const card: Card = { rank, suit };
            const isSelected = value && sameCard(value, card);
            const isDisabled = disabledCards.some((c) => sameCard(c, card));
            return (
              <Pressable
                key={rank}
                disabled={isDisabled}
                onPress={() => onChange(card)}
                style={[styles.card, isSelected && styles.cardSelected, isDisabled && styles.cardDisabled]}
              >
                <Text style={[styles.rank, { color: red ? colors.cardTextRed : colors.cardTextBlack }]}>{rank}</Text>
                <Text style={[styles.suit, { color: red ? colors.cardTextRed : colors.cardTextBlack }]}>{symbol}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    flex: 1,
  },
  preview: {
    marginLeft: 8,
  },
  suitRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 6,
  },
  card: {
    width: 44,
    height: 58,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardFace,
    borderWidth: 1.5,
    borderColor: '#D8D4C8',
  },
  cardSelected: {
    borderColor: colors.gold,
    backgroundColor: '#FBF3DC',
  },
  cardDisabled: {
    opacity: 0.2,
  },
  rank: {
    fontSize: 17,
    fontWeight: '700',
  },
  suit: {
    fontSize: 16,
    marginTop: 1,
  },
});
