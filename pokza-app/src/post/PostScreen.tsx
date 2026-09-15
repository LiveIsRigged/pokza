import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import type { Phase } from '../creator/types';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton } from '../components/ui/HeaderButton';
import { colors, SCREEN_TOP, spacing } from '../theme/theme';
import { deletePost, fetchPost, setLiked } from '../data/posts';
import { markPostRead } from '../data/postViews';
import type { Post } from '../types/poker';
import { PostCard } from '../components/post/PostCard';
import { useT } from '../i18n';

interface PostScreenProps {
  postId: string;
  currentUserId: string;
  currentUserName: string;
  /** Ouvre directement le fil de commentaires (arrivée depuis une notification de commentaire). */
  openComments?: boolean;
  onBack: () => void;
  /** Rejettent si la main ne peut pas s'ouvrir : la carte d'où part le geste l'affiche. */
  onEditPost: (postId: string) => void | Promise<void>;
  onCorrectPost: (postId: string, depuis: Phase) => void | Promise<void>;
  onDuplicatePost: (postId: string) => void | Promise<void>;
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
  onCorrectPost,
  onDuplicatePost,
  onSelectProfile,
  onLoaded,
}: PostScreenProps) {
  const t = useT();
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
        // « Toutes les surfaces valent une lecture » : arriver ici est délibéré, la main occupe
        // l'écran entier et rien d'autre. L'anti-rebond de 12 h fait que voir la carte dans le
        // fil PUIS ouvrir sa page ne compte qu'une fois — c'est exactement son métier.
        if (data) void markPostRead(data.id);
        onLoaded?.(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  // Un échec REJETTE : la carte l'affiche, près du menu d'où part le geste (cf. `PostCard`).
  const handleDelete = async () => {
    await deletePost(postId);
    onBack();
  };

  const handleToggleLike = async () => {
    if (!post) return;
    const nextLiked = !post.likedByMe;
    setPost({ ...post, likedByMe: nextLiked, likeCount: post.likeCount + (nextLiked ? 1 : -1) });
    try {
      await setLiked(postId, currentUserId, nextLiked);
    } catch (err) {
      setPost(post); // `post` est la valeur capturée avant la mise à jour optimiste
      // La carte affiche l'échec près du cœur (cf. `PostCard`).
      throw err;
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <BackButton onPress={onBack} />
          <Text style={styles.title}>{t('post.la_main')}</Text>
        </View>

        {error && <Text style={styles.statusText}>{error}</Text>}

        {loading ? (
          <Text style={styles.statusText}>{t('post.chargement')}</Text>
        ) : !post ? (
          // Cas normal, pas une panne : main supprimée, repassée en privé, ou groupe quitté depuis
          // l'envoi de la notification.
          <Text style={styles.statusText}>{t('post.introuvable')}</Text>
        ) : (
          <PostCard
            post={post}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            isOwnPost={post.authorId === currentUserId}
            initialCommentsOpen={openComments}
            onDelete={handleDelete}
            onEdit={() => onEditPost(post.id)}
            onCorrect={(depuis) => onCorrectPost(post.id, depuis)}
            onDuplicate={() => onDuplicatePost(post.id)}
            onToggleLike={handleToggleLike}
            onPressAuthor={() => onSelectProfile(post.authorId)}
            onSelectProfile={onSelectProfile}
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
    paddingTop: SCREEN_TOP,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 20,
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
