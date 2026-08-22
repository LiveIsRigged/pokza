import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { HandReplayer } from '../components/replayer/HandReplayer';
import { PokzaLogo } from '../components/ui/authIcons';
import { fetchPublicPost, fetchSharedPost, type PublicPost } from '../data/posts';
import { colors, radius, typography } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';

/**
 * Main partagée ouverte SANS compte.
 *
 * Décision produit du 16/08/2026 : un lien vers une main publique doit s'ouvrir sans inscription,
 * et le visiteur ne voit NI le pseudo de l'auteur, NI les commentaires, NI les likes, NI les votes.
 * Juste la main et son déroulé.
 *
 * Depuis le 23/08 cet écran sert AUSSI les mains non publiques, ouvertes par un jeton que leur
 * auteur a explicitement créé (`/s/:token`, cf. `docs/dev/partage-lien.sql`). Volontairement le
 * MÊME écran, et donc les mêmes sept champs : la porte change, ce qu'on montre ne change pas. Une
 * main privée partagée n'en révèle pas davantage qu'une main publique.
 *
 * D'où un écran dédié plutôt qu'un `PostCard` amputé : la carte du feed est construite autour d'un
 * auteur et d'une barre sociale. La réutiliser aurait voulu dire inventer un faux auteur et
 * désactiver des morceaux un par un — chaque ajout ultérieur au `PostCard` risquant alors de
 * réexposer quelque chose ici sans que personne ne s'en aperçoive. Ici, ce qui n'est pas écrit
 * n'existe pas.
 */
interface Props {
  /** Main PUBLIQUE, ouverte par son identifiant. */
  postId?: string;
  /** Main NON publique, ouverte par le jeton que son auteur a créé (cf. `docs/dev/partage-lien.sql`).
   *  Exactement les mêmes champs à l'écran : la porte change, pas ce qu'on voit. */
  shareToken?: string;
  /** Amène à l'écran de connexion. L'URL n'est pas nettoyée : après inscription, la main s'ouvre. */
  onJoin: () => void;
  /** Vrai quand la personne est DÉJÀ connectée — elle suit son propre lien, ou celui d'un ami.
   *  Lui proposer « Crée un compte » n'aurait aucun sens, et elle se retrouverait sans issue. */
  dejaConnecte?: boolean;
}

export function PublicPostScreen({ postId, shareToken, onJoin, dejaConnecte }: Props) {
  const [post, setPost] = useState<PublicPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (shareToken ? fetchSharedPost(shareToken) : postId ? fetchPublicPost(postId) : Promise.resolve(null))
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
  }, [postId, shareToken]);

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
        {dejaConnecte ? (
          <>
            <Text style={styles.invitationTitre}>Tu es déjà sur Pokza</Text>
            <Text style={styles.invitationTexte}>
              Cette page est ce que verront les personnes à qui tu envoies le lien.
            </Text>
            <Pressable style={styles.bouton} onPress={onJoin}>
              <Text style={styles.boutonTexte}>Retour à Pokza</Text>
            </Pressable>
          </>
        ) : (
          <>
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
          </>
        )}
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
