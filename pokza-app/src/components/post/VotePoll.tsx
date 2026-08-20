import React, { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../utils/errorMessage';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { borders, colors, radius, spacing, tints, typography } from '../../theme/theme';
import { castVote, retractVote } from '../../data/posts';
import { VotersSheet } from './VotersSheet';

interface VotePollProps {
  postId: string;
  currentUserId: string;
  question: string;
  options: string[];
  initialCounts?: Record<string, number>;
  /** Option déjà votée par l'utilisateur courant lors d'une session précédente (cf. `posts_feed`) —
   * permet de rouvrir un post déjà voté directement sur les résultats, sans réanimer l'apparition. */
  myVote?: string;
  /** L'auteur du sondage : il voit les résultats d'emblée et ne vote pas (cf. le commentaire du
   * composant). */
  isAuthor?: boolean;
  /** Ouvre un profil depuis la liste « qui a voté quoi ». Absent = lignes non cliquables. */
  onSelectProfile?: (profileId: string) => void;
}

/**
 * Le sondage d'une main.
 *
 * RÈGLE DU SECRET, posée le 21/08 : on ne voit les résultats qu'après s'être prononcé. Un lien
 * « Voir les résultats » existait auparavant et vidait la règle de son sens — il suffisait de le
 * toucher pour tout voir sans rien risquer, et connaître la réponse majoritaire avant de choisir
 * influence le choix. Il a été retiré, pas déplacé.
 *
 * DEUX EXCEPTIONS, une seule en réalité : l'AUTEUR. Il voit les résultats d'emblée puisqu'il pose
 * la question, et il ne peut pas y répondre — voter sur son propre sondage fausserait son propre
 * échantillon.
 *
 * En échange du secret, qui a le droit de voir les résultats a aussi le droit de savoir QUI a voté
 * QUOI (cf. `VotersSheet`) : auteur, ou personne ayant déjà voté.
 */
export function VotePoll({
  postId,
  currentUserId,
  question,
  options,
  initialCounts,
  myVote,
  isAuthor,
  onSelectProfile,
}: VotePollProps) {
  const [voted, setVoted] = useState<string | null>(myVote ?? null);
  const [votersOpen, setVotersOpen] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const c: Record<string, number> = {};
    options.forEach((o) => {
      c[o] = initialCounts?.[o] ?? 0;
    });
    return c;
  });
  const [error, setError] = useState<string | null>(null);

  // L'auteur est dans le même état d'ouverture qu'un votant : résultats déjà là, sans animation
  // d'apparition à chaque fois qu'il rouvre son post.
  const openOnResults = Boolean(myVote) || Boolean(isAuthor);
  const initialTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  const barWidths = useRef<Record<string, Animated.Value>>(
    Object.fromEntries(
      options.map((o) => [
        o,
        new Animated.Value(openOnResults && initialTotal > 0 ? (counts[o] ?? 0) / initialTotal : 0),
      ])
    )
  ).current;
  const resultsAnim = useRef(new Animated.Value(openOnResults ? 1 : 0)).current;

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
    resultsAnim.setValue(myVote || isAuthor ? 1 : 0);
    options.forEach((opt) => {
      barWidths[opt].setValue(total > 0 ? (nextCounts[opt] ?? 0) / total : 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVote, initialCounts, isAuthor]);

  const showResults = voted !== null || Boolean(isAuthor);
  // Qui a le droit de voir les résultats a le droit de savoir qui a voté quoi — et personne d'autre.
  const canSeeVoters = showResults;

  const handleVote = async (option: string) => {
    if (voted || isAuthor) return;
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
    if (!voted || isAuthor) return;
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

      {!showResults ? (
        <View>
          <View style={styles.buttonsRow}>
            {options.map((option) => (
              <Pressable key={option} style={styles.bubble} onPress={() => handleVote(option)}>
                <Text style={styles.bubbleText}>{option}</Text>
              </Pressable>
            ))}
          </View>
          {/* Rien sous les options : ni lien vers les résultats, ni compteur. Le nombre de votes
              déjà exprimés est lui-même une information sur le sondage. */}
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
                // Seul son propre vote est cliquable, pour le retirer. L'auteur, lui, ne peut rien
                // toucher : il n'a pas de vote à reprendre et ne peut pas en poser.
                onPress={isSelected && !isAuthor ? handleRetract : undefined}
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
          <View style={styles.resultFooter}>
            <Text style={styles.totalText}>
              {totalVotes} vote{totalVotes > 1 ? 's' : ''}
            </Text>
            {canSeeVoters && totalVotes > 0 && (
              <Pressable onPress={() => setVotersOpen(true)} hitSlop={6}>
                <Text style={styles.votersLink}>Qui a voté quoi</Text>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}

      <VotersSheet
        visible={votersOpen}
        onClose={() => setVotersOpen(false)}
        postId={postId}
        options={options}
        onSelectProfile={
          onSelectProfile
            ? (profileId) => {
                // On referme avant d'ouvrir le profil : sinon la feuille reste posée au-dessus de
                // l'écran suivant (même précaution que dans `LikersSheet`).
                setVotersOpen(false);
                onSelectProfile(profileId);
              }
            : undefined
        }
      />
    </View>
  );
}

// Passe de densite A (2026-08-18) — on ne rogne QUE des espaces blancs, aucun element n'est
// reduit : ni la table, ni les cartes, ni les tailles de texte, ni les cibles tactiles. Les
// valeurs d'origine etaient toutes des jetons `spacing` par defaut, jamais choisies pour cette
// carte en particulier. Reversible d'un seul `git revert` (commit isole).
const styles = StyleSheet.create({
  container: {
    marginBottom: 10,
  },
  question: {
    color: colors.textPrimary,
    marginBottom: 6,
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
    borderColor: borders.default,
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
    borderColor: borders.hairline,
    backgroundColor: tints.faint,
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: spacing.xs + 2,
  },
  resultFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: tints.light,
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
  votersLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.action,
    marginTop: 6,
  },
  resultFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
