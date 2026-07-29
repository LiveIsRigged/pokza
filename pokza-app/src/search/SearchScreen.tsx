import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { searchProfiles, type ProfileSummary } from '../data/profiles';
import { fetchFriends } from '../data/friends';
import { fetchGroupMembers } from '../data/groups';

interface SearchScreenProps {
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
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
          setError(err instanceof Error ? err.message : String(err));
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
        setInvitableFriends(
          friends
            .filter((f) => !memberIds.has(f.id))
            .map((f) => ({ id: f.id, pseudo: f.pseudo, avatarUrl: f.avatarUrl }))
        );
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
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

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Rechercher un pseudo…"
          autoCapitalize="none"
          autoFocus
        />
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.resultsContent}>
        {showFriendsList && <Text style={styles.friendsHint}>Tes amis</Text>}
        {loading ? (
          <ActivityIndicator style={styles.loader} color={colors.action} />
        ) : displayed.length === 0 ? (
          <Text style={styles.statusText}>
            {showFriendsList
              ? invitableFriends === null
                ? 'Chargement…'
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
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    color: colors.textPrimary,
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
    borderBottomColor: 'rgba(22,35,61,0.15)',
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
