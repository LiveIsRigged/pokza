import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { searchProfiles, type ProfileSummary } from '../data/profiles';
import { fetchFriends } from '../data/friends';
import { fetchGroupMembers } from '../data/groups';
import { Popover } from '../components/ui/Popover';

interface SearchScreenProps {
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
  /** `'screen'` (défaut) = plein écran avec flèche ← (utilisé aussi par l'invitation en groupe) ;
   * `'sheet'` = bottom-sheet par-dessus le feed, champ de recherche dans le bandeau. */
  variant?: 'screen' | 'sheet';
  /** Variante `'sheet'` uniquement : contrôle l'ouverture/fermeture de la feuille. */
  visible?: boolean;
  onClose?: () => void;
  /** Mode "inviter dans un groupe" : la ligne affiche un bouton Inviter au lieu de naviguer vers
   * le profil au clic. */
  inviteMode?: boolean;
  onInvite?: (profileId: string) => void;
  /** En mode invitation, on affiche d'emblée la liste d'amis (moins ceux déjà dans le groupe) tant
   * que rien n'est tapé — inviter un ami ne devrait pas obliger à retaper son pseudo. */
  currentUserId?: string;
  excludeGroupId?: string;
}

export function SearchScreen({
  onBack,
  onSelectProfile,
  variant = 'screen',
  visible,
  onClose,
  inviteMode,
  onInvite,
  currentUserId,
  excludeGroupId,
}: SearchScreenProps) {
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
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

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

  // Chargement (une fois) des amis invitables : ceux qui ne sont pas déjà membres/invités du groupe.
  useEffect(() => {
    if (!inviteMode || !currentUserId || !excludeGroupId) return;
    let cancelled = false;
    Promise.all([fetchFriends(currentUserId), fetchGroupMembers(excludeGroupId)])
      .then(([friends, members]) => {
        if (cancelled) return;
        const memberIds = new Set(members.map((m) => m.userId));
        setFriendCount(friends.length);
        setInvitableFriends(
          friends
            .filter((f) => !memberIds.has(f.id))
            .map((f) => ({ id: f.id, pseudo: f.pseudo, avatarUrl: f.avatarUrl }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [inviteMode, currentUserId, excludeGroupId]);

  const handleInvite = (profileId: string) => {
    setInvitedIds((s) => new Set(s).add(profileId));
    onInvite?.(profileId);
  };

  // En mode invitation avec recherche vide : on montre les amis plutôt qu'un écran vide.
  const showFriendsList = inviteMode && query.trim().length === 0;
  const displayed = (showFriendsList ? invitableFriends ?? [] : results).filter((p) => !invitedIds.has(p.id));

  const renderInput = (style: any) => (
    <TextInput
      style={style}
      value={query}
      onChangeText={setQuery}
      placeholder="Rechercher un pseudo…"
      autoCapitalize="none"
      autoFocus
    />
  );

  const body = (
    <>
      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView
        style={variant === 'sheet' ? styles.listSheet : styles.listScreen}
        contentContainerStyle={styles.resultsContent}
      >
        {showFriendsList && <Text style={styles.friendsHint}>Tes amis</Text>}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.action} />
        ) : displayed.length === 0 ? (
          <Text style={styles.statusText}>
            {showFriendsList
              ? invitableFriends === null
                ? 'Chargement…'
                : friendCount === 0
                ? "Tu n'as pas encore d'amis sur Pokza. Recherche un pseudo pour inviter quelqu'un."
                : "Tous tes amis sont déjà dans le groupe. Recherche un pseudo pour inviter quelqu'un d'autre."
              : query.trim().length > 0
              ? 'Aucun pseudo ne correspond.'
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
                <Avatar url={profile.avatarUrl} name={profile.pseudo} size={40} />
                <Text style={styles.pseudo}>{profile.pseudo}</Text>
              </View>
              {inviteMode && (
                <Pressable style={styles.inviteButton} onPress={() => handleInvite(profile.id)} hitSlop={8}>
                  <Text style={styles.inviteButtonText}>Inviter</Text>
                </Pressable>
              )}
            </Pressable>
          ))
        )}
      </ScrollView>
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
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
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
    paddingTop: 50,
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
  pseudo: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
