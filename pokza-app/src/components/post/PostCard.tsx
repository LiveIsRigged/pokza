import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Post } from '../../types/poker';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { HandReplayer } from '../replayer/HandReplayer';
import { VotePoll } from './VotePoll';

const DESCRIPTION_LINES = 3;

interface PostCardProps {
  post: Post;
}

// Tronque la description à 3 lignes avec "… voir plus" collé à la fin de la 3e ligne. Le nombre
// de lignes que prend le texte complet dépend de la largeur d'écran et de la police — jamais
// deviné : un exemplaire invisible du même texte, sans limite de lignes, mesure sa hauteur réelle
// (onLayout) et on la compare à la hauteur du texte tronqué à 3 lignes. `onTextLayout` n'est pas
// implémenté par react-native-web, donc inutilisable ici.
function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const fullHeight = useRef<number | null>(null);
  const clampedHeight = useRef<number | null>(null);

  const checkTruncation = () => {
    if (fullHeight.current != null && clampedHeight.current != null) {
      setTruncated(fullHeight.current > clampedHeight.current + 1);
    }
  };

  return (
    <View style={styles.descriptionWrapper}>
      <Text
        style={[typography.description, styles.description, styles.measure]}
        onLayout={(e) => {
          fullHeight.current = e.nativeEvent.layout.height;
          checkTruncation();
        }}
        pointerEvents="none"
      >
        {text}
      </Text>
      <Text
        style={[typography.description, styles.description]}
        numberOfLines={expanded ? undefined : DESCRIPTION_LINES}
        onLayout={(e) => {
          if (!expanded) {
            clampedHeight.current = e.nativeEvent.layout.height;
            checkTruncation();
          }
        }}
      >
        {text}
      </Text>
      {truncated && !expanded && (
        <Pressable style={styles.moreOverlay} onPress={() => setExpanded(true)} hitSlop={8}>
          <Text style={styles.moreLink}>… voir plus</Text>
        </Pressable>
      )}
      {expanded && (
        <Pressable onPress={() => setExpanded(false)} hitSlop={8}>
          <Text style={styles.moreLink}>voir moins</Text>
        </Pressable>
      )}
    </View>
  );
}

function formatContextLine(post: Post): string {
  const { hand } = post;
  const parts: string[] = [];
  parts.push(hand.gameType === 'cash' ? 'Cash game' : 'Tournoi');
  // Un straddle (simple/double/triple) change le niveau de mise à suivre au-delà de la BB : la
  // dénomination doit le refléter ("5/10/25"), comme on écrirait "1/2/5" pour une table straddlée.
  const straddleAmounts = hand.actions
    .filter((a) => a.type === 'post-straddle')
    .sort((a, b) => a.order - b.order)
    .map((a) => a.amount ?? 0);
  parts.push([hand.blinds.sb, hand.blinds.bb, ...straddleAmounts].join('/'));
  if (post.location) parts.push(post.location);
  if (post.buyIn) parts.push(post.buyIn);
  if (post.level) parts.push(post.level);
  return parts.join(' · ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function PostCard({ post }: PostCardProps) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likeCount);

  const voteOptions = post.voteOptions && post.voteOptions.length >= 2 ? post.voteOptions : ['Oui', 'Non'];

  const toggleLike = () => {
    setLiked((prev) => {
      setLikeCount((c) => (prev ? c - 1 : c + 1));
      return !prev;
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{post.authorName.charAt(0).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={typography.authorName}>{post.authorName}</Text>
          <Text style={[typography.dateLocation, styles.muted]}>
            {formatDate(post.createdAt)}
            {post.location ? ` · ${post.location}` : ''}
          </Text>
        </View>
      </View>

      <Text style={[typography.contextLine, styles.muted, styles.contextLine]}>{formatContextLine(post)}</Text>

      <Text style={[typography.postTitle, styles.title]}>{post.title}</Text>

      {post.description && <ExpandableDescription text={post.description} />}

      <View style={styles.replayerWrapper}>
        <HandReplayer hand={post.hand} />
      </View>

      {post.voteQuestion && (
        <VotePoll question={post.voteQuestion} options={voteOptions} initialCounts={post.voteCounts} />
      )}

      <View style={styles.engagementRow}>
        <Pressable style={styles.engagementItem} onPress={toggleLike}>
          <Text style={[styles.engagementIcon, liked && styles.engagementIconActive]}>{liked ? '♥' : '♡'}</Text>
          <Text style={[styles.engagementCount, liked && styles.engagementCountActive]}>{likeCount}</Text>
        </Pressable>
        <View style={styles.engagementItem}>
          <Text style={styles.engagementIcon}>💬</Text>
          <Text style={styles.engagementCount}>{post.commentCount}</Text>
        </View>
        <View style={styles.engagementItem}>
          <Text style={styles.engagementIcon}>↗</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.feedBackground,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tableFelt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 14,
  },
  muted: {
    color: colors.textSecondary,
  },
  contextLine: {
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  descriptionWrapper: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.textPrimary,
  },
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  moreOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingLeft: 6,
    backgroundColor: colors.feedBackground,
  },
  moreLink: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.action,
  },
  replayerWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22,35,61,0.15)',
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  engagementIcon: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  engagementIconActive: {
    color: colors.action,
    transform: [{ scale: 1.1 }],
  },
  engagementCount: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  engagementCountActive: {
    color: colors.action,
    fontWeight: '700',
  },
});
