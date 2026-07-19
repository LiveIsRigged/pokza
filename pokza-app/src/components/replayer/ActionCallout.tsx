import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from '../../theme/theme';

interface ActionCalloutProps {
  text: string | null;
  stepKey: number;
}

export function ActionCallout({ text, stepKey }: ActionCalloutProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!text) return;
    opacity.setValue(1);
    const timeout = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 900);
    return () => clearTimeout(timeout);
  }, [stepKey, text, opacity]);

  if (!text) return null;

  return (
    <Animated.View style={[styles.wrapper, { opacity }]} pointerEvents="none">
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    backgroundColor: 'rgba(14,24,48,0.85)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.4)',
  },
  text: {
    color: colors.textOnFelt,
    fontSize: 12,
    fontWeight: '600',
  },
});
