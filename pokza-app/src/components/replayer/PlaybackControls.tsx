import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/theme';

interface PlaybackControlsProps {
  playing: boolean;
  step: number;
  totalSteps: number;
  streetLabel: string;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onTogglePlay: () => void;
}

export function PlaybackControls({
  playing,
  step,
  totalSteps,
  streetLabel,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onTogglePlay,
}: PlaybackControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        <Text style={styles.streetLabel}>{streetLabel}</Text>
      </View>
      <View style={styles.segmentsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View key={i} style={[styles.segment, i < step && styles.segmentFilled]} />
        ))}
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          disabled={!canGoBack}
          style={[styles.sideButton, !canGoBack && styles.disabled]}
        >
          <Text style={styles.sideIcon}>‹</Text>
        </Pressable>

        <Pressable onPress={onTogglePlay} style={styles.mainButton}>
          <Text style={styles.mainIcon}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>

        <Pressable
          onPress={onForward}
          disabled={!canGoForward}
          style={[styles.sideButton, !canGoForward && styles.disabled]}
        >
          <Text style={styles.sideIcon}>›</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  streetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  segmentsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 14,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(22,35,61,0.1)',
  },
  segmentFilled: {
    backgroundColor: colors.gold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  sideButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  sideIcon: {
    fontSize: 20,
    color: '#fff',
    fontWeight: '700',
  },
  mainButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  mainIcon: {
    fontSize: 18,
    color: '#fff',
  },
  disabled: {
    opacity: 0.35,
  },
});
