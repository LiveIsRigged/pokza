import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors } from '../theme/theme';

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
