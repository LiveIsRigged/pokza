import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/theme';

interface ActionCalloutProps {
  text: string | null;
  stepKey: number;
  /** Bulle en rouge plutôt qu'en navy — utilisé pour signaler un tapis (all-in). */
  danger?: boolean;
}

export function ActionCallout({ text, stepKey, danger = false }: ActionCalloutProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    if (!text) return;
    opacity.setValue(1);
    translateY.setValue(0);
    const timeout = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 1400);
    return () => clearTimeout(timeout);
  }, [stepKey, text, opacity, translateY]);

  return (
    <View style={styles.slot}>
      {text && (
        <Animated.View style={[styles.pill, danger && styles.pillDanger, { opacity, transform: [{ translateY }] }]}>
          <Text style={[styles.text, danger && styles.textDanger]} numberOfLines={1}>
            {text}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    paddingVertical: 4,
  },
  pill: {
    backgroundColor: colors.tableFelt,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    maxWidth: '92%',
  },
  pillDanger: {
    backgroundColor: colors.cardTextRed,
  },
  text: {
    color: colors.textOnFelt,
    fontSize: 13,
    fontWeight: '600',
  },
  textDanger: {
    color: '#fff',
  },
});
