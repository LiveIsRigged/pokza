import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Post } from '../../types/poker';
import { colors, typography } from '../../theme/theme';
import { HandReplayer } from '../replayer/HandReplayer';
import { VotePoll } from './VotePoll';

interface PostCardProps {
  post: Post;
}

function formatContextLine(post: Post): string {
  const { hand } = post;
  const parts: string[] = [];
  parts.push(hand.gameType === 'cash' ? 'Cash game' : 'Tournoi');
  parts.push(`${hand.blinds.sb}/${hand.blinds.bb}`);
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
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    marginBottom: 6,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: 10,
  },
  replayerWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 10,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 6,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22,35,61,0.15)',
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  engagementIcon: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  engagementIconActive: {
    color: colors.action,
    transform: [{ scale: 1.1 }],
  },
  engagementCount: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  engagementCountActive: {
    color: colors.action,
    fontWeight: '600',
  },
});
