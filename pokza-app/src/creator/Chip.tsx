import React from 'react';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors } from '../theme/theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Posé APRÈS les styles par défaut, donc il les écrase. Sert au seul cas où ces pastilles ne
   *  sont pas une liste mais une ÉCHELLE — le nombre de joueurs, qui se range sur une ligne en
   *  largeurs égales (cf. `ContextStep`). Partout ailleurs, ne rien passer. */
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected, onPress, style }: ChipProps) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected, style]} onPress={onPress}>
      <Text style={[styles.text, selected && styles.textSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: borders.default,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: colors.tableFelt,
    borderColor: colors.tableFelt,
  },
  text: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  textSelected: {
    color: colors.textOnFelt,
  },
});
