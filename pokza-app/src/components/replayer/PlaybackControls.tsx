import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme/theme';

interface PlaybackControlsProps {
  playing: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onTogglePlay: () => void;
}

export function PlaybackControls({
  playing,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onTogglePlay,
}: PlaybackControlsProps) {
  return (
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
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 10,
  },
  sideButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(232,87,31,0.12)',
  },
  sideIcon: {
    fontSize: 20,
    color: colors.action,
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
