import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { BackButton } from '../components/ui/HeaderButton';
import { borders, colors, radius, SCREEN_TOP, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { searchProfiles, type ProfileSummary } from '../data/profiles';
import { fetchFriends } from '../data/friends';
import {
  cancelGroupInvite,
  fetchGroupMembers,
  inviteToGroup,
  type GroupMember,
  type GroupMemberStatus,
} from '../data/groups';
import { refusedMessage } from '../data/writeGuard';
import { Popover } from '../components/ui/Popover';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { PersonIcon } from '../components/ui/icons';
import { PastilleEtat } from '../components/ui/PastilleEtat';
import { autoFocusUtile } from '../web/clavierVirtuel';
import { useT } from '../i18n';

/** Où en est chacun dans le groupe, par id de profil. */
function statusById(members: GroupMember[]): Map<string, GroupMemberStatus> {
  return new Map(members.map((m) => [m.userId, m.status] as const));
}

interface SearchScreenProps {
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
  /** `'screen'` (défaut) = plein écran avec flèche ← (utilisé aussi par l'invitation en groupe) ;
   * `'sheet'` = bottom-sheet par-dessus le feed, champ de recherche dans le bandeau. */
  variant?: 'screen' | 'sheet';
  /** Variante `'sheet'` uniquement : contrôle l'ouverture/fermeture de la feuille. */
  visible?: boolean;
  onClose?: () => void;
  /** Mode "inviter dans un groupe" : au lieu de mener au profil, chaque ligne dit où en est la
   * personne dans le groupe — « Inviter », « Invité ✓ » (le toucher propose d'annuler) ou « Déjà
   * membre ». L'écran invite et annule lui-même, pour montrer le résultat là où l'on a touché. */
  inviteMode?: boolean;
  /** En mode invitation, on affiche d'emblée la liste d'amis (moins ceux déjà dans le groupe) tant
   * que rien n'est tapé — inviter un ami ne devrait pas obliger à retaper son nom. */
  currentUserId?: string;
  inviteGroupId?: string;
}

export function SearchScreen({
  onBack,
  onSelectProfile,
  variant = 'screen',
  visible,
  onClose,
  inviteMode,
  currentUserId,
  inviteGroupId,
}: SearchScreenProps) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Liste d'amis invitables (mode invitation, recherche vide). `null` = pas encore chargée.
  const [invitableFriends, setInvitableFriends] = useState<ProfileSummary[] | null>(null);
  // Nombre d'amis AVANT filtrage. C'est la seule façon de distinguer « tu n'as encore aucun ami »
  // de « tes amis sont tous déjà dans le groupe » : la liste filtrée est vide dans les deux cas, et
  // l'app affirmait la seconde à quelqu'un qui venait de s'inscrire.
  const [friendCount, setFriendCount] = useState<number | null>(null);
  // Mode invitation. `null` tant que ce n'est pas chargé : aucun bouton avant, il proposerait
  // d'inviter quelqu'un qui est déjà dans le groupe.
  const [memberStatus, setMemberStatus] = useState<Map<string, GroupMemberStatus> | null>(null);
  // Invitations parties dont le serveur n'a pas encore répondu : leur bouton ne reprend pas d'appui.
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  // Feuille « Annuler l'invitation ». La personne visée survit à la fermeture : la feuille met
  // 220 ms à redescendre, et son titre perdrait le nom en route.
  const [cancelTarget, setCancelTarget] = useState<ProfileSummary | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Recherche à la volée, avec un léger débounce pour ne pas envoyer une requête à chaque frappe.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchProfiles(trimmed)
        .then((data) => {
          setResults(data);
          setLoading(false);
        })
        .catch((err) => {
          setError(errorMessage(err));
          setLoading(false);
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Chargement (une fois) de l'état du groupe et des amis invitables : ceux qui n'en sont ni membres
  // ni invités À L'OUVERTURE. La liste reste figée ensuite, pour qu'un ami invité d'ici y reste avec
  // « Invité ✓ » : le faire disparaître laissait croire que rien n'était parti (Victor, 15/09/2026).
  useEffect(() => {
    if (!inviteMode || !currentUserId || !inviteGroupId) return;
    let cancelled = false;
    Promise.all([fetchFriends(currentUserId), fetchGroupMembers(inviteGroupId)])
      .then(([friends, members]) => {
        if (cancelled) return;
        const statuses = statusById(members);
        setMemberStatus(statuses);
        setFriendCount(friends.length);
        setInvitableFriends(
          friends
            .filter((f) => !statuses.has(f.id))
            .map((f) => ({ id: f.id, displayName: f.displayName, avatarUrl: f.avatarUrl }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [inviteMode, currentUserId, inviteGroupId]);

  // Les erreurs s'affichent ICI. Elles partaient sur le fil, où on les découvrait plus tard et hors
  // contexte, pendant que cet écran laissait croire que l'invitation était partie.
  const handleInvite = async (profileId: string) => {
    if (!currentUserId || !inviteGroupId) return;
    setError(null);
    setSendingIds((s) => new Set(s).add(profileId));
    try {
      await inviteToGroup(inviteGroupId, profileId, currentUserId);
      setMemberStatus((m) => new Map(m).set(profileId, 'pending'));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSendingIds((s) => {
        const next = new Set(s);
        next.delete(profileId);
        return next;
      });
    }
  };

  const confirmCancel = async () => {
    if (!inviteGroupId || !cancelTarget) return;
    const profileId = cancelTarget.id;
    setError(null);
    setCancelling(true);
    try {
      if (await cancelGroupInvite(inviteGroupId, profileId)) {
        setMemberStatus((m) => {
          const next = new Map(m);
          next.delete(profileId);
          return next;
        });
      } else {
        // Rien d'annulé : la personne a répondu entre-temps, ou la suppression a été refusée. On relit
        // plutôt que de deviner — « Déjà membre » si elle a accepté, « Inviter » si elle a refusé.
        const statuses = statusById(await fetchGroupMembers(inviteGroupId));
        setMemberStatus(statuses);
        if (statuses.get(profileId) === 'pending') setError(refusedMessage(t('erreur.appartenance_groupe')));
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCancelling(false);
      setCancelOpen(false);
    }
  };

  // En mode invitation avec recherche vide : on montre les amis plutôt qu'un écran vide.
  const showFriendsList = inviteMode && query.trim().length === 0;
  // On ne se trouve pas soi-même en cherchant qui inviter : la base refuse qu'on s'invite.
  const displayed = showFriendsList
    ? invitableFriends ?? []
    : inviteMode
    ? results.filter((p) => p.id !== currentUserId)
    : results;

  const renderInviteAction = (profile: ProfileSummary) => {
    if (!memberStatus) return null;
    const status = memberStatus.get(profile.id);
    if (status === 'accepted') return <Text style={styles.memberText}>{t('groupe.deja_membre')}</Text>;
    if (status === 'pending') {
      return (
        <PastilleEtat
          label={t('groupe.invitation_envoyee')}
          onPress={() => {
            setCancelTarget(profile);
            setCancelOpen(true);
          }}
        />
      );
    }
    const sending = sendingIds.has(profile.id);
    return (
      <Pressable
        style={[styles.inviteButton, sending && styles.inviteButtonSending]}
        onPress={() => void handleInvite(profile.id)}
        disabled={sending}
        hitSlop={8}
      >
        <Text style={styles.inviteButtonText}>{t('groupe.inviter')}</Text>
      </Pressable>
    );
  };

  const renderInput = (style: any) => (
    <TextInput
      autoComplete="off"
      aria-label={t('recherche.titre')}
      // On cherche un PSEUDO, qui n'est le plus souvent pas un mot de la langue : la correction
      // automatique n'a rien a y faire, elle ne peut que dégrader la saisie. Tranché par Victor le
      // 09/09/2026. Même choix que la recherche de groupe et le sélecteur de pays.
      autoCorrect={false}
      spellCheck={false}
      // SE DECLARER, SINON SAFARI DEVINE — il proposait une carte bancaire ici et dans les
      // commentaires, et nulle part ailleurs. `inputMode="search"` fait rendre un
      // `<input type="search">` (`TextInput/index.js:141`) : c'est la déclaration la plus forte
      // qu'on puisse faire, et elle est vraie. Effet visible assumé : la touche de retour du
      // clavier iOS devient une touche de recherche.
      inputMode="search"
      id="search"
      style={style}
      value={query}
      onChangeText={setQuery}
      placeholder={t('recherche.placeholder')}
      autoCapitalize="none"
      autoFocus={autoFocusUtile()}
    />
  );

  const body = (
    <>
      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView
        style={variant === 'sheet' ? styles.listSheet : styles.listScreen}
        contentContainerStyle={styles.resultsContent}
      >
        {showFriendsList && <Text style={styles.friendsHint}>{t('recherche.tes_amis')}</Text>}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.action} />
        ) : displayed.length === 0 ? (
          <Text style={styles.statusText}>
            {showFriendsList
              ? invitableFriends === null
                ? t('commun.chargement')
                : friendCount === 0
                ? t('recherche.aucun_ami')
                : t('recherche.tous_amis_dans_groupe')
              : query.trim().length > 0
              ? t('recherche.personne')
              : ''}
          </Text>
        ) : (
          displayed.map((profile) => (
            <Pressable
              key={profile.id}
              style={styles.resultRow}
              onPress={inviteMode ? undefined : () => onSelectProfile(profile.id)}
            >
              <View style={styles.resultInfo}>
                {/* `displayName` et lui seul, ici comme dans toutes les listes de l'app : le
                    pseudo de quelqu'un qui a choisi d'afficher son nom ne veut rien dire pour
                    personne. Cf. `ProfileSummary`, qui ne porte volontairement pas de `pseudo`. */}
                <Avatar url={profile.avatarUrl} name={profile.displayName} size={40} />
                <Text style={styles.pseudo}>{profile.displayName}</Text>
              </View>
              {inviteMode && renderInviteAction(profile)}
            </Pressable>
          ))
        )}
      </ScrollView>

      {inviteMode && (
        <ConfirmSheet
          visible={cancelOpen}
          icon={PersonIcon}
          title={t('groupe.annuler_invitation_titre', { nom: cancelTarget?.displayName ?? '' })}
          message={t('groupe.annuler_invitation_message')}
          confirmLabel={t('groupe.annuler_invitation')}
          cancelLabel={t('groupe.garder_invitation')}
          // Orange, pas rouge : l'annulation se rattrape en réinvitant (tranché par Victor, 15/09/2026).
          destructive={false}
          loading={cancelling}
          onCancel={() => setCancelOpen(false)}
          onConfirm={() => void confirmCancel()}
        />
      )}
    </>
  );

  if (variant === 'sheet') {
    return (
      <Popover visible={!!visible} onClose={onClose ?? onBack} width={340}>
        <View style={styles.searchHeader}>{renderInput(styles.searchInputSheet)}</View>
        {body}
      </Popover>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <BackButton onPress={onBack} />
        {renderInput(styles.input)}
      </View>
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: SCREEN_TOP,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  // Bandeau du champ dans le panneau déroulant (variante `sheet`) : pas de `flex: 1` — dans une
  // colonne il étirerait le champ en hauteur ; la largeur se remplit d'elle-même (align stretch).
  searchHeader: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  searchInputSheet: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  // Plein écran (variante `screen`) : remplit la hauteur. Panneau (`sheet`) : `flexShrink` pour
  // que la carte épouse le contenu et ne défile qu'à hauteur max (cf. `Popover`).
  listScreen: {
    flex: 1,
  },
  listSheet: {
    flexShrink: 1,
  },
  resultsContent: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  friendsHint: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  loader: {
    marginTop: 24,
  },
  statusText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  resultInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  inviteButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  inviteButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  inviteButtonSending: {
    opacity: 0.6,
  },
  memberText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  pseudo: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
