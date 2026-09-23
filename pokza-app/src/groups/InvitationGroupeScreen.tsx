import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { HandReplayer } from '../components/replayer/HandReplayer';
import { PokzaLogo } from '../components/ui/authIcons';
import { Avatar } from '../components/ui/Avatar';
import { fetchGroupLinkPreview, joinGroupByLink, type GroupLinkPreview, type ResultatLienGroupe } from '../data/groups';
import { fetchPublicPost, type PublicPost } from '../data/posts';
import { colors, radius, typography } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { trackEvent } from '../analytics';
import { useT } from '../i18n';

/**
 * Ce que voit quelqu'un qui ouvre un lien d'invitation à un groupe (`/g/:token`) — le plus souvent
 * sans compte, puisque c'est précisément à ceux qui ne sont pas sur Pokza qu'on l'envoie.
 *
 * Décisions de Victor (16 et 17/09/2026) :
 *  · l'hôte est celui qui a ENVOYÉ le lien, pas le fondateur : « Paul t'invite », parce que c'est
 *    Paul que l'arrivant connaît ;
 *  · on montre le groupe, qui invite, et une main PUBLIQUE de l'hôte qui se rejoue — on vend le
 *    produit avec le produit plutôt qu'avec un formulaire ;
 *  · ouvrir le lien fait ENTRER : pas de validation, le fondateur est prévenu à l'arrivée.
 *
 * L'INVITATION D'ABORD, LA MAIN ENSUITE. Sur un téléphone le replayer dépasse 500 px : placé avant,
 * il aurait repoussé le bouton sous l'écran, et le seul geste qu'on attend ici avec lui.
 *
 * Construit comme `PublicPostScreen` (même en-tête, même encadré, même bouton), sans lui emprunter
 * son contenu : ici ce n'est pas la main qu'on partage, c'est la place à la table.
 */
interface Props {
  token: string;
  /** Déjà connecté (le lien suivi depuis un navigateur où l'on a une session) : on propose de
   *  rejoindre tout de suite. Sinon, de créer un compte — et cette même page revient à la fin de
   *  l'inscription, qui rejoint alors toute seule (cf. `rejoindreAutomatiquement`). */
  dejaConnecte: boolean;
  onCreerCompte: () => void;
  /** Vrai quand la personne vient de créer son compte (ou de se connecter) DEPUIS cette page : elle
   *  a déjà touché « Créer mon compte pour rejoindre », lui redemander « Rejoindre le groupe » serait
   *  lui faire répéter son intention. L'entrée part donc seule, dès que l'aperçu est là — et tout
   *  passe par le même chemin que le bouton (mesure, lien mort, erreur). */
  rejoindreAutomatiquement?: boolean;
  onOuvrirGroupe: (groupId: string) => void;
  /** Lien mort, connecté : revenir à l'app. */
  onFermer: () => void;
}

export function InvitationGroupeScreen({
  token,
  dejaConnecte,
  onCreerCompte,
  rejoindreAutomatiquement = false,
  onOuvrirGroupe,
  onFermer,
}: Props) {
  const t = useT();
  const [apercu, setApercu] = useState<GroupLinkPreview | null>(null);
  const [main, setMain] = useState<PublicPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejoindreEnCours, setRejoindreEnCours] = useState(false);
  const [resultat, setResultat] = useState<ResultatLienGroupe | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchGroupLinkPreview(token)
      .then(async (data) => {
        if (cancelled) return;
        setApercu(data);
        setError(null);
        setLoading(false);
        // La main vient APRÈS : son absence (l'hôte n'a rien publié en public) ou son échec ne doit
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
  }, [token]);

  const rejoindre = async () => {
    if (!apercu || rejoindreEnCours) return;
    setRejoindreEnCours(true);
    setError(null);
    try {
      const issue = await joinGroupByLink(token);
      if (issue === 'rejoint') {
        trackEvent('groupe_rejoint', { origine: 'lien' });
        onOuvrirGroupe(apercu.groupId);
        return;
      }
      setResultat(issue);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRejoindreEnCours(false);
    }
  };

  // Une seule fois, quand l'aperçu arrive. Le bouton se montre alors dans son état « en cours » :
  // rien ne clignote, et un échec retombe sur l'écran normal avec son message.
  const [autoLance, setAutoLance] = useState(false);
  useEffect(() => {
    if (!rejoindreAutomatiquement || !dejaConnecte || !apercu || autoLance) return;
    setAutoLance(true);
    void rejoindre();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rejoindreAutomatiquement, dejaConnecte, apercu, autoLance]);

  const contexte = [main?.location, main?.buyIn, main?.level].filter(Boolean).join(' · ');
  // Mort d'avance (expiré, hôte exclu, jeton inventé) ou refusé au moment d'entrer : même phrase.
  // On ne dit pas à quelqu'un, par ce biais, qu'il a été retiré du groupe.
  const lienMort = (!loading && !error && !apercu) || resultat === 'lien_invalide';

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
          <Text style={styles.invitationTitre}>{t('accueil_groupe.invalide')}</Text>
          {dejaConnecte ? (
            <Pressable style={styles.bouton} onPress={onFermer}>
              <Text style={styles.boutonTexte}>{t('public.retour')}</Text>
            </Pressable>
          ) : (
            // Pas d'impasse : un lien mort reste une porte d'entrée vers Pokza.
            <Pressable style={styles.bouton} onPress={onCreerCompte}>
              <Text style={styles.boutonTexte}>{t('public.creer_compte')}</Text>
            </Pressable>
          )}
        </View>
      )}

      {!loading && apercu && !lienMort && (
        <>
          <View style={styles.invitation}>
            {/* Un anneau autour de l'avatar : sans photo, son rond est bleu marine — la couleur
                même de l'encadré. Mesuré le 19/09 : seule l'initiale restait visible. */}
            <View style={styles.anneau}>
              <Avatar url={apercu.hostAvatarUrl} name={apercu.hostName} size={56} />
            </View>
            <Text style={styles.invitationTitre}>
              {t('accueil_groupe.titre', { nom: apercu.hostName, groupe: apercu.groupName })}
            </Text>
            <Text style={styles.invitationTexte}>
              {t('accueil_groupe.membres', { count: apercu.memberCount })}
            </Text>

            {resultat === 'deja_membre' ? (
              <>
                <Text style={styles.invitationTexte}>{t('accueil_groupe.deja_membre')}</Text>
                <Pressable style={styles.bouton} onPress={() => onOuvrirGroupe(apercu.groupId)}>
                  <Text style={styles.boutonTexte}>{t('public.retour')}</Text>
                </Pressable>
              </>
            ) : dejaConnecte ? (
              <Pressable
                style={[styles.bouton, rejoindreEnCours && styles.boutonEnCours]}
                onPress={() => void rejoindre()}
                disabled={rejoindreEnCours}
              >
                {rejoindreEnCours ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.boutonTexte}>{t('accueil_groupe.rejoindre')}</Text>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable style={styles.bouton} onPress={onCreerCompte}>
                  <Text style={styles.boutonTexte}>{t('accueil_groupe.creer_compte')}</Text>
                </Pressable>
                <Pressable onPress={onCreerCompte} hitSlop={8}>
                  <Text style={styles.lien}>{t('public.deja_un_compte')}</Text>
                </Pressable>
              </>
            )}
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
  // Toute la largeur de l'encadré : « Créer mon compte pour rejoindre » passait sur deux lignes,
  // calé à gauche, dans un bouton ajusté au texte.
  bouton: {
    alignSelf: 'stretch',
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 4,
    alignItems: 'center',
  },
  boutonEnCours: {
    opacity: 0.6,
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
