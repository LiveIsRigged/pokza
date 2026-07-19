import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [pendingRank, setPendingRank] = useState<Rank | undefined>(value?.rank);
  const [pendingSuit, setPendingSuit] = useState<Suit | undefined>(value?.suit);

  const selectRank = (rank: Rank) => {
    setPendingRank(rank);
    if (pendingSuit) onChange({ rank, suit: pendingSuit });
  };

  const selectSuit = (suit: Suit) => {
    setPendingSuit(suit);
    if (pendingRank) onChange({ rank: pendingRank, suit });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.preview}>
          <CardView card={value} size="medium" />
        </View>
      </View>

      <View style={styles.rankRow}>
        {RANKS.map((rank) => {
          const isSelected = pendingRank === rank;
          const isDisabled = pendingSuit !== undefined && disabledCards.some((c) => c.rank === rank && c.suit === pendingSuit);
          return (
            <Pressable
              key={rank}
              disabled={isDisabled}
              onPress={() => selectRank(rank)}
              style={[styles.rankCell, isSelected && styles.rankCellSelected, isDisabled && styles.cellDisabled]}
            >
              <Text style={[styles.rankText, isSelected && styles.cellTextSelected]}>{rank}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.suitRow}>
        {SUITS.map(({ suit, symbol, red }) => {
          const isSelected = pendingSuit === suit;
          const isDisabled = pendingRank !== undefined && disabledCards.some((c) => c.rank === pendingRank && c.suit === suit);
          return (
            <Pressable
              key={suit}
              disabled={isDisabled}
              onPress={() => selectSuit(suit)}
              style={[styles.suitCell, isSelected && styles.suitCellSelected, isDisabled && styles.cellDisabled]}
            >
              <Text style={[styles.suitText, { color: isSelected ? '#fff' : red ? colors.cardTextRed : colors.cardTextBlack }]}>
                {symbol}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
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
  rankRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  rankCell: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardFace,
    borderWidth: 1,
    borderColor: '#D8D4C8',
  },
  rankCellSelected: {
    backgroundColor: colors.tableFelt,
    borderColor: colors.tableFelt,
  },
  rankText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  suitRow: {
    flexDirection: 'row',
    gap: 6,
  },
  suitCell: {
    flex: 1,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardFace,
    borderWidth: 1,
    borderColor: '#D8D4C8',
  },
  suitCellSelected: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  suitText: {
    fontSize: 20,
  },
  cellDisabled: {
    opacity: 0.25,
  },
  cellTextSelected: {
    color: '#fff',
  },
});
