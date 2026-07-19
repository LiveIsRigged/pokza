import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../theme/theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable style={[styles.chip, selected && styles.chipSelected]} onPress={onPress}>
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
    borderColor: 'rgba(22,35,61,0.25)',
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
