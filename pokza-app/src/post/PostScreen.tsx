import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme/theme';
import { deletePost, fetchPost, setLiked } from '../data/posts';
import type { Post } from '../types/poker';
import { PostCard } from '../components/post/PostCard';

interface PostScreenProps {
  postId: string;
  currentUserId: string;
  currentUserName: string;
  /** Ouvre directement le fil de commentaires (arrivée depuis une notification de commentaire). */
  openComments?: boolean;
  onBack: () => void;
  onEditPost: (postId: string) => void;
  onSelectProfile: (profileId: string) => void;
  /** Remonte la main chargée pour que l'écran de modification puisse s'en servir même quand elle
   * n'est pas dans le feed (feed chargé une seule fois, main publiée depuis un autre appareil). */
  onLoaded?: (post: Post | null) => void;
}

/**
 * Page d'une main seule. Sa raison d'être : une notification parle d'UNE main précise
 * ("Julien a aimé ta main"), il faut donc une destination qui montre cette main-là — jusqu'ici on
 * retombait sur le profil de la personne, ce qui obligeait à retrouver la main à la main dans la
 * liste. C'est aussi la page que le futur bouton "partager" devra pointer.
 *
 * Volontairement une simple `PostCard` et rien de plus : la carte du feed contient déjà tout
 * (replayer, vote, likes, commentaires). Une mise en page différente ici ferait douter d'être sur
 * la même main.
 */
export function PostScreen({
  postId,
  currentUserId,
  currentUserName,
  openComments,
  onBack,
  onEditPost,
  onSelectProfile,
  onLoaded,
}: PostScreenProps) {
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPost(postId)
      .then((data) => {
        if (cancelled) return;
        setPost(data);
        onLoaded?.(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  const handleDelete = async () => {
    try {
      await deletePost(postId);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleLike = async () => {
    if (!post) return;
    const nextLiked = !post.likedByMe;
    setPost({ ...post, likedByMe: nextLiked, likeCount: post.likeCount + (nextLiked ? 1 : -1) });
    try {
      await setLiked(postId, currentUserId, nextLiked);
    } catch (err) {
      setPost(post); // `post` est la valeur capturée avant la mise à jour optimiste
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.title}>La main</Text>
        </View>

        {error && <Text style={styles.statusText}>{error}</Text>}

        {loading ? (
          <Text style={styles.statusText}>Chargement de la main…</Text>
        ) : !post ? (
          // Cas normal, pas une panne : main supprimée, repassée en privé, ou groupe quitté depuis
          // l'envoi de la notification.
          <Text style={styles.statusText}>Cette main n'est plus disponible.</Text>
        ) : (
          <PostCard
            post={post}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            isOwnPost={post.authorId === currentUserId}
            initialCommentsOpen={openComments}
            onDelete={handleDelete}
            onEdit={() => onEditPost(post.id)}
            onToggleLike={handleToggleLike}
            onPressAuthor={() => onSelectProfile(post.authorId)}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  scrollContent: {
    paddingTop: 50,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusText: {
    marginHorizontal: 14,
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
