import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { GameType } from '../../types/poker';
import { colors, radius, typography } from '../../theme/theme';
import { formatChipAmount } from '../../utils/chipFormat';
import type { CodeDevise } from '../../utils/currency';

interface ChipsViewProps {
  amount: number;
  gameType?: GameType;
  /** Devise de la main (cf. `DEVISES`) ; absente = euro. Sans effet en tournoi. */
  currency?: CodeDevise;
  isWinning?: boolean;
  bb: number;
  useBB?: boolean;
}

// Le pot est une simple pastille lisible plutôt qu'un tas de jetons illustré : plus premier,
// plus compact, et surtout garanti de ne jamais chevaucher le siège au-dessus (cf. layout.ts).
export function ChipsView({ amount, gameType = 'cash', currency, isWinning = false, bb, useBB = false }: ChipsViewProps) {
  return (
    <View style={[styles.pill, isWinning && styles.pillWinning]}>
      <Text style={[typography.potAmount, styles.amount, isWinning && styles.amountWinning]}>
        Pot {formatChipAmount(amount, gameType, { bb, useBB }, currency)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.tableRail,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.4)',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  pillWinning: {
    backgroundColor: 'rgba(201,162,39,0.9)',
    borderColor: colors.goldBright,
  },
  amount: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 11,
  },
  amountWinning: {
    color: colors.tableFelt,
  },
});
