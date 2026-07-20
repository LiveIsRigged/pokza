import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../theme/theme';

interface ChipsViewProps {
  amount: number;
}

export function ChipsView({ amount }: ChipsViewProps) {
  // Determine chip breakdown (simplified: just display stacks)
  const chipStacks = getChipStacks(amount);

  return (
    <View style={styles.container}>
      {/* Stack of chips */}
      <View style={styles.chipStack}>
        {chipStacks.map((size, i) => (
          <View key={i} style={[styles.chip, getChipStyle(size, i, chipStacks.length)]} />
        ))}
      </View>
      {/* Pot amount text */}
      <Text style={[typography.potAmount, styles.amount]}>Pot {amount}</Text>
    </View>
  );
}

function getChipStacks(amount: number): string[] {
  // Breakdown into chip denominations: 1000, 100, 25, 5, 1
  const stacks: string[] = [];
  let remaining = amount;

  const denominations = [1000, 100, 25, 5, 1];
  for (const denom of denominations) {
    while (remaining >= denom) {
      stacks.push(denom.toString());
      remaining -= denom;
    }
    if (stacks.length >= 5) break; // Max 5 chips visible
  }

  return stacks.slice(0, 5);
}

function getChipStyle(
  denomination: string,
  index: number,
  total: number
): Record<string, any> {
  const denom = parseInt(denomination);
  const colors_: Record<number, string> = {
    1: '#3B6FD6',
    5: '#C0392B',
    25: '#2E8B57',
    100: '#E8571F',
    1000: '#111111',
  };

  return {
    backgroundColor: colors_[denom] || '#C9A227',
    zIndex: index,
    transform: [
      { translateY: index * -8 },
      { translateX: (index - total / 2) * 3 },
    ],
  };
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    position: 'relative',
    height: 60,
  },
  chipStack: {
    position: 'relative',
    width: 40,
    height: 40,
  },
  chip: {
    position: 'absolute',
    width: 40,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  amount: {
    color: colors.gold,
    marginTop: 4,
  },
});
