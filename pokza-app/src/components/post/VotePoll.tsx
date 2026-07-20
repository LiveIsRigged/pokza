import React, { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../theme/theme';

interface VotePollProps {
  question: string;
  options: string[];
  initialCounts?: Record<string, number>;
}

export function VotePoll({ question, options, initialCounts }: VotePollProps) {
  const [voted, setVoted] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    options.forEach((o) => {
      c[o] = initialCounts?.[o] ?? 0;
    });
    return c;
  });

  const barWidths = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(options.map((o) => [o, new Animated.Value(0)]))
  ).current;
  const resultsAnim = useRef(new Animated.Value(0)).current;

  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);

  const handleVote = (option: string) => {
    if (voted) return;
    const nextCounts = { ...counts, [option]: (counts[option] ?? 0) + 1 };
    const nextTotal = Object.values(nextCounts).reduce((a, b) => a + b, 0);
    setCounts(nextCounts);
    setVoted(option);

    Animated.spring(resultsAnim, {
      toValue: 1,
      friction: 7,
      tension: 60,
      useNativeDriver: true,
    }).start();

    options.forEach((opt) => {
      const pct = nextTotal > 0 ? (nextCounts[opt] ?? 0) / nextTotal : 0;
      Animated.timing(barWidths[opt], {
        toValue: pct,
        duration: 500,
        delay: 80,
        useNativeDriver: false,
      }).start();
    });
  };

  return (
    <View style={styles.container}>
      <Text style={[typography.voteQuestion, styles.question]}>{question}</Text>

      {voted === null ? (
        <View style={styles.buttonsRow}>
          {options.map((option) => (
            <Pressable key={option} style={styles.bubble} onPress={() => handleVote(option)}>
              <Text style={styles.bubbleText}>{option}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Animated.View
          style={{
            opacity: resultsAnim,
            transform: [{ scale: resultsAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
          }}
        >
          {options.map((option) => {
            const count = counts[option] ?? 0;
            const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
            const isSelected = voted === option;
            const width = barWidths[option].interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', '100%'],
            });
            return (
              <View key={option} style={styles.resultTrack}>
                <Animated.View style={[styles.resultFill, isSelected && styles.resultFillActive, { width }]} />
                <View style={styles.resultLabelRow}>
                  <Text style={[styles.resultLabel, isSelected && styles.resultLabelActive]}>
                    {isSelected ? '✓ ' : ''}
                    {option}
                  </Text>
                  <Text style={[styles.resultPct, isSelected && styles.resultLabelActive]}>
                    {count} · {pct}%
                  </Text>
                </View>
              </View>
            );
          })}
          <Text style={styles.totalText}>
            {totalVotes} vote{totalVotes > 1 ? 's' : ''}
          </Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  question: {
    color: colors.textSecondary,
    marginBottom: 6,
  },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  bubbleText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  resultTrack: {
    position: 'relative',
    height: 32,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.15)',
    backgroundColor: 'rgba(22,35,61,0.05)',
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: 6,
  },
  resultFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(22,35,61,0.12)',
  },
  resultFillActive: {
    backgroundColor: 'rgba(232,87,31,0.22)',
  },
  resultLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  resultLabel: {
    fontSize: 12,
    color: colors.textPrimary,
  },
  resultLabelActive: {
    fontWeight: '700',
    color: colors.action,
  },
  resultPct: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  totalText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
