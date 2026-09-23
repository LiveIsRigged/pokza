import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { HandReplayer } from '../components/replayer/HandReplayer';
import { PokzaLogo } from '../components/ui/authIcons';
import { Avatar } from '../components/ui/Avatar';
import { fetchProfileInvitePreview, type ProfileInvitePreview } from '../data/profiles';
import { fetchPublicPost, type PublicPost } from '../data/posts';
import { colors, radius, typography } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { useT } from '../i18n';

/**
 * Ce que voit quelqu'un qui ouvre `/invite/:id` SANS COMPTE — c'est-à-dire exactement le public
 * à qui ce lien est envoyé. Jusqu'au 23/09/2026 il tombait sur le formulaire de connexion nu,
 * sans un mot sur qui l'invitait.
 *
 * Jumeau d'`InvitationGroupeScreen`, dont il reprend la mise en page au pixel près : même en-tête,
 * même encadré de feutre, même anneau autour de l'avatar (sans photo, le rond est bleu marine —
 * la couleur même de l'encadré), l'invitation EN HAUT et la main dessous.
 *
 * Il n'existe QUE déconnecté : un visiteur qui a déjà une session est emmené directement sur la
 * vraie page de profil, où le bouton « Ajouter en ami » l'attend — lui montrer une page
 * d'accueil serait un écran de moins que ce qu'il peut déjà faire.
 *
 * Après l'inscription, l'effet de lien profond d'`App.tsx` rouvre ce profil tout seul : la
 * demande d'ami part d'un geste, jamais toute seule (décision de Victor prise pour le lien de
 * groupe, appliquée ici).
 */
interface Props {
  userId: string;
  onCreerCompte: () => void;
}

export function InvitationProfilScreen({ userId, onCreerCompte }: Props) {
  const t = useT();
  const [apercu, setApercu] = useState<ProfileInvitePreview | null>(null);
  const [main, setMain] = useState<PublicPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProfileInvitePreview(userId)
      .then(async (data) => {
        if (cancelled) return;
        setApercu(data);
        setError(null);
        setLoading(false);
        // La main vient APRÈS : son absence (il n'a rien publié en public) ou son échec ne doit
        // jamais retarder ni empêcher l'invitation elle-même.
        if (data?.postId) {
          const post = await fetchPublicPost(data.postId).catch(() => null);
          if (!cancelled) setMain(post);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const contexte = [main?.location, main?.buyIn, main?.level].filter(Boolean).join(' · ');
  // Identifiant inventé, compte supprimé ou banni : la même phrase dans les trois cas.
  const lienMort = !loading && !error && !apercu;

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <PokzaLogo size={26} />
        <Text style={styles.marque}>Pokza</Text>
      </View>

      {loading && <ActivityIndicator color={colors.action} style={styles.loader} />}

      {!loading && error && <Text style={styles.message}>{error}</Text>}

      {lienMort && (
        <View style={styles.invitation}>
          <Text style={styles.invitationTitre}>{t('accueil_profil.invalide')}</Text>
          {/* Pas d'impasse : un lien mort reste une porte d'entrée vers Pokza. */}
          <Pressable style={styles.bouton} onPress={onCreerCompte}>
            <Text style={styles.boutonTexte}>{t('public.creer_compte')}</Text>
          </Pressable>
        </View>
      )}

      {!loading && apercu && (
        <>
          <View style={styles.invitation}>
            <View style={styles.anneau}>
              <Avatar url={apercu.hostAvatarUrl} name={apercu.hostName} size={56} />
            </View>
            <Text style={styles.invitationTitre}>
              {t('accueil_profil.titre', { nom: apercu.hostName })}
            </Text>
            {apercu.handCount > 0 && (
              <Text style={styles.invitationTexte}>
                {t('accueil_profil.mains', { count: apercu.handCount })}
              </Text>
            )}
            <Pressable style={styles.bouton} onPress={onCreerCompte}>
              <Text style={styles.boutonTexte}>{t('accueil_profil.creer_compte')}</Text>
            </Pressable>
            <Pressable onPress={onCreerCompte} hitSlop={8}>
              <Text style={styles.lien}>{t('public.deja_un_compte')}</Text>
            </Pressable>
          </View>

          {main && (
            <View style={styles.main}>
              <Text style={styles.titre}>{main.title}</Text>
              {contexte.length > 0 && <Text style={styles.contexte}>{contexte}</Text>}
              <HandReplayer hand={main.hand} />
            </View>
          )}
        </>
      )}
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
  anneau: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.textOnFeltMuted,
    padding: 2,
  },
  bouton: {
    alignSelf: 'stretch',
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 4,
    alignItems: 'center',
  },
  boutonTexte: {
    ...typography.authorName,
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  lien: {
    ...typography.description,
    color: colors.textOnFeltMuted,
    textDecorationLine: 'underline',
  },
  main: {
    marginTop: 28,
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
});
