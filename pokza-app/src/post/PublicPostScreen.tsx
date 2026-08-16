import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HandReplayer } from '../components/replayer/HandReplayer';
import { PokzaLogo } from '../components/ui/authIcons';
import { fetchPublicPost, type PublicPost } from '../data/posts';
import { colors, radius, typography } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';

/**
 * Main partagée ouverte SANS compte.
 *
 * Décision produit du 16/08/2026 : un lien vers une main publique doit s'ouvrir sans inscription,
 * et le visiteur ne voit NI le pseudo de l'auteur, NI les commentaires, NI les likes, NI les votes.
 * Juste la main et son déroulé.
 *
 * D'où un écran dédié plutôt qu'un `PostCard` amputé : la carte du feed est construite autour d'un
 * auteur et d'une barre sociale. La réutiliser aurait voulu dire inventer un faux auteur et
 * désactiver des morceaux un par un — chaque ajout ultérieur au `PostCard` risquant alors de
 * réexposer quelque chose ici sans que personne ne s'en aperçoive. Ici, ce qui n'est pas écrit
 * n'existe pas.
 */
interface Props {
  postId: string;
  /** Amène à l'écran de connexion. L'URL n'est pas nettoyée : après inscription, la main s'ouvre. */
  onJoin: () => void;
}

export function PublicPostScreen({ postId, onJoin }: Props) {
  const [post, setPost] = useState<PublicPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicPost(postId)
      .then((data) => {
        if (cancelled) return;
        setPost(data);
        setError(null);
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
  }, [postId]);

  const contexte = [post?.location, post?.buyIn, post?.level].filter(Boolean).join(' · ');

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <PokzaLogo size={26} />
        <Text style={styles.marque}>Pokza</Text>
      </View>

      {loading && <ActivityIndicator color={colors.action} style={styles.loader} />}

      {!loading && error && <Text style={styles.message}>{error}</Text>}

      {/* `null` sans erreur : la main existe peut-être, mais elle n'est pas publique — ou plus.
          On ne distingue pas les deux, ce serait dire à un inconnu qu'un identifiant existe. */}
      {!loading && !error && !post && (
        <Text style={styles.message}>Cette main n'est pas disponible publiquement.</Text>
      )}

      {!loading && post && (
        <>
          <Text style={styles.titre}>{post.title}</Text>
          {contexte.length > 0 && <Text style={styles.contexte}>{contexte}</Text>}
          {post.description ? <Text style={styles.description}>{post.description}</Text> : null}
          <View style={styles.replayer}>
            <HandReplayer hand={post.hand} />
          </View>
        </>
      )}

      <View style={styles.invitation}>
        <Text style={styles.invitationTitre}>Partage tes mains sur Pokza</Text>
        <Text style={styles.invitationTexte}>
          Crée un compte pour commenter cette main, voter sur la décision, et publier les tiennes.
        </Text>
        <Pressable style={styles.bouton} onPress={onJoin}>
          <Text style={styles.boutonTexte}>Créer un compte</Text>
        </Pressable>
        <Pressable onPress={onJoin} hitSlop={8}>
          <Text style={styles.lien}>J'ai déjà un compte</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
  },
  marque: {
    ...typography.postTitle,
    fontSize: 22,
    color: colors.textPrimary,
  },
  loader: {
    marginVertical: 40,
  },
  message: {
    ...typography.description,
    color: colors.textSecondary,
    marginVertical: 40,
    textAlign: 'center',
  },
  titre: {
    ...typography.postTitle,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  contexte: {
    ...typography.contextLine,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  description: {
    ...typography.description,
    color: colors.textPrimary,
    marginBottom: 14,
  },
  replayer: {
    marginBottom: 28,
  },
  invitation: {
    backgroundColor: colors.tableFelt,
    borderRadius: radius.lg,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  invitationTitre: {
    ...typography.postTitle,
    fontSize: 17,
    color: colors.textOnFelt,
    textAlign: 'center',
  },
  invitationTexte: {
    ...typography.description,
    color: colors.textOnFeltMuted,
    textAlign: 'center',
  },
  bouton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 4,
  },
  boutonTexte: {
    ...typography.authorName,
    color: '#fff',
    fontWeight: '700',
  },
  lien: {
    ...typography.description,
    color: colors.textOnFeltMuted,
    textDecorationLine: 'underline',
  },
});
