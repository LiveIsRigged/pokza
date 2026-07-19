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

interface MultiCardPickerProps {
  /** Nombre de cartes à choisir */
  count: number;
  /** Cartes choisies, dans l'ordre de sélection */
  selected: (Card | undefined)[];
  onChange: (cards: (Card | undefined)[]) => void;
  /** Cartes déjà utilisées ailleurs dans la main, à désactiver */
  disabledCards?: Card[];
}

function sameCard(a: Card, b: Card) {
  return a.rank === b.rank && a.suit === b.suit;
}

export function MultiCardPicker({ count, selected, onChange, disabledCards = [] }: MultiCardPickerProps) {
  const chosen = selected.filter(Boolean) as Card[];

  const toggle = (card: Card) => {
    const idx = chosen.findIndex((c) => sameCard(c, card));
    if (idx !== -1) {
      // déjà choisie → on la retire
      onChange(chosen.filter((_, i) => i !== idx));
      return;
    }
    if (chosen.length >= count) return; // déjà complet
    onChange([...chosen, card]);
  };

  return (
    <View>
      <View style={styles.slots}>
        {Array.from({ length: count }).map((_, i) => (
          <Pressable
            key={i}
            onPress={() => chosen[i] && onChange(chosen.filter((_, j) => j !== i))}
            style={styles.slot}
          >
            {chosen[i] ? <CardView card={chosen[i]} size="medium" /> : <View style={styles.emptySlot} />}
          </Pressable>
        ))}
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
            const isSelected = chosen.some((c) => sameCard(c, card));
            const isUsed = disabledCards.some((c) => sameCard(c, card));
            const isFull = chosen.length >= count && !isSelected;
            const isDisabled = isUsed || isFull;
            return (
              <Pressable
                key={rank}
                disabled={isUsed}
                onPress={() => toggle(card)}
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
  slots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  slot: {
    width: 44,
    height: 58,
  },
  emptySlot: {
    width: 44,
    height: 58,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(22,35,61,0.3)',
    backgroundColor: 'rgba(22,35,61,0.04)',
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
