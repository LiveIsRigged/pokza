import React, { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../utils/errorMessage';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { castVote, retractVote } from '../../data/posts';

interface VotePollProps {
  postId: string;
  currentUserId: string;
  question: string;
  options: string[];
  initialCounts?: Record<string, number>;
  /** Option déjà votée par l'utilisateur courant lors d'une session précédente (cf. `posts_feed`) —
   * permet de rouvrir un post déjà voté directement sur les résultats, sans réanimer l'apparition. */
  myVote?: string;
}

export function VotePoll({ postId, currentUserId, question, options, initialCounts, myVote }: VotePollProps) {
  const [voted, setVoted] = useState<string | null>(myVote ?? null);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    options.forEach((o) => {
      c[o] = initialCounts?.[o] ?? 0;
    });
    return c;
  });
  const [error, setError] = useState<string | null>(null);

  const alreadyVoted = Boolean(myVote);
  const initialTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  const barWidths = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(
      options.map((o) => [
        o,
        new Animated.Value(alreadyVoted && initialTotal > 0 ? (counts[o] ?? 0) / initialTotal : 0),
      ])
    )
  ).current;
  // Si l'utilisateur a déjà voté lors d'une session précédente, les résultats s'affichent tels
  // quels au montage (pas de ré-animation d'apparition à chaque fois qu'on rouvre le post).
  const resultsAnim = useRef(new Animated.Value(alreadyVoted ? 1 : 0)).current;

  const totalVotes = Object.values(counts).reduce((a, b) => a + b, 0);

  // `postId` reste le même tout au long de la vie du composant (clé stable dans la liste des
  // posts), donc ce composant n'est jamais démonté/remonté après un simple rechargement du feed —
  // sans cet effet, un vote posé ailleurs (ex: depuis la page de profil) puis revu ici resterait
  // bloqué sur l'état initial du tout premier montage.
  useEffect(() => {
    setVoted(myVote ?? null);
    const nextCounts: Record<string, number> = {};
    options.forEach((o) => {
      nextCounts[o] = initialCounts?.[o] ?? 0;
    });
    setCounts(nextCounts);
    const total = Object.values(nextCounts).reduce((a, b) => a + b, 0);
    resultsAnim.setValue(myVote ? 1 : 0);
    options.forEach((opt) => {
      barWidths[opt].setValue(total > 0 ? (nextCounts[opt] ?? 0) / total : 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVote, initialCounts]);

  const handleVote = async (option: string) => {
    if (voted) return;
    setError(null);
    const previousCounts = counts;
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

    try {
      await castVote(postId, currentUserId, option);
    } catch (err) {
      // Le vote n'a pas été enregistré côté serveur : on revient à l'état "pas encore voté" plutôt
      // que de laisser croire à l'utilisateur que son choix compte alors qu'il a été perdu.
      setCounts(previousCounts);
      setVoted(null);
      resultsAnim.setValue(0);
      options.forEach((opt) => barWidths[opt].setValue(0));
      setError(errorMessage(err));
    }
  };

  const handleRetract = async () => {
    if (!voted) return;
    setError(null);
    const previousVoted = voted;
    const previousCounts = counts;
    const nextCounts = { ...counts, [previousVoted]: Math.max((counts[previousVoted] ?? 0) - 1, 0) };
    setCounts(nextCounts);
    setVoted(null);
    resultsAnim.setValue(0);
    options.forEach((opt) => barWidths[opt].setValue(0));

    try {
      await retractVote(postId, currentUserId);
    } catch (err) {
      // Le retrait a échoué côté serveur : on revient à l'état "voté" plutôt que de laisser
      // l'utilisateur croire qu'il peut revoter alors que son vote précédent tient toujours.
      setCounts(previousCounts);
      setVoted(previousVoted);
      resultsAnim.setValue(1);
      const total = Object.values(previousCounts).reduce((a, b) => a + b, 0);
      options.forEach((opt) => {
        barWidths[opt].setValue(total > 0 ? (previousCounts[opt] ?? 0) / total : 0);
      });
      setError(errorMessage(err));
    }
  };

  return (
    <View style={styles.container}>
      <Text style={[typography.voteQuestion, styles.question]}>{question}</Text>

      {error && <Text style={styles.error}>{error}</Text>}

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
              <Pressable
                key={option}
                style={styles.resultTrack}
                onPress={isSelected ? handleRetract : undefined}
              >
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
              </Pressable>
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
    marginBottom: spacing.md,
  },
  question: {
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  error: {
    fontSize: 12,
    color: '#C0392B',
    marginBottom: spacing.xs,
  },
  buttonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bubble: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  bubbleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  resultTrack: {
    position: 'relative',
    height: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.15)',
    backgroundColor: 'rgba(22,35,61,0.05)',
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: spacing.xs + 2,
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
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  resultLabelActive: {
    fontWeight: '700',
    color: colors.action,
  },
  resultPct: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  totalText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
