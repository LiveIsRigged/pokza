import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';
import { fetchProfile, type ProfileDetails } from '../data/profiles';
import { EditProfileScreen } from './EditProfileScreen';
import { pickAvatarImage, removeAvatar, uploadAvatar, type CropRegion, type PickedImage } from '../data/avatars';
import { deletePost, fetchPosts, setLiked } from '../data/posts';
import {
  acceptFriendRequest,
  deleteFriendRelation,
  fetchFriendStatus,
  fetchFriends,
  fetchMutualFriendsPreview,
  fetchPendingRequests,
  sendFriendRequest,
  type Friend,
  type FriendStatus,
  type MutualFriendPreview,
  type PendingRequest,
} from '../data/friends';
import type { Post } from '../types/poker';
import { PostCard } from '../components/post/PostCard';
import { Avatar } from '../components/ui/Avatar';
import { AvatarCropper } from '../components/ui/AvatarCropper';
import { playerSummary } from './profileOptions';

/** Même format que les dates de main affichées sur `PostCard` (ex: "29 juil. 2026") — cohérence
 * visuelle entre les deux, pas de format de date différent selon l'écran. */
function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mutualFriendsLabel(pseudos: string[]): string {
  const prefix = pseudos.length === 1 ? 'Ami en commun' : 'Amis en commun';
  if (pseudos.length <= 3) {
    const allButLast = pseudos.slice(0, -1).join(', ');
    return `${prefix} : ${allButLast}${allButLast ? ' et ' : ''}${pseudos[pseudos.length - 1]}`;
  }
  const shown = pseudos.slice(0, 2);
  return `${prefix} : ${shown.join(', ')} et ${pseudos.length - 2} de plus`;
}

interface ProfileScreenProps {
  profileId: string;
  currentUserId: string;
  currentUserName: string;
  onBack: () => void;
  onEditPost: (postId: string) => void;
  onSelectProfile?: (profileId: string) => void;
  /** Ouvre la page du groupe depuis la pastille 👥 d'une main de groupe. */
  onOpenGroup?: (groupId: string) => void;
  /** Ouvre l'écran séparé « Mes amis » (uniquement sur son propre profil). */
  onOpenFriends?: () => void;
  /** Prévient l'écran parent qu'il faut rafraîchir sa propre copie du profil (menu latéral) —
   * après un changement d'avatar, de pseudo ou de préférence d'affichage. */
  onProfileChanged?: () => void;
}

export function ProfileScreen({
  profileId,
  currentUserId,
  currentUserName,
  onBack,
  onEditPost,
  onSelectProfile,
  onOpenGroup,
  onOpenFriends,
  onProfileChanged,
}: ProfileScreenProps) {
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOwnProfile = profileId === currentUserId;
  const [friendStatus, setFriendStatus] = useState<FriendStatus | null>(null);
  const [mutualFriends, setMutualFriends] = useState<MutualFriendPreview[]>([]);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropTarget, setCropTarget] = useState<PickedImage | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchProfile(profileId), fetchPosts(profileId)])
      .then(([profileData, postsData]) => {
        if (cancelled) return;
        setProfile(profileData);
        setPosts(postsData);
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
  }, [profileId]);

  useEffect(() => {
    if (!isOwnProfile) return;
    let cancelled = false;
    fetchPendingRequests(currentUserId)
      .then((data) => {
        if (!cancelled) setPendingRequests(data);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, isOwnProfile]);

  useEffect(() => {
    if (!isOwnProfile) return;
    let cancelled = false;
    fetchFriends(currentUserId)
      .then((data) => {
        if (!cancelled) setFriends(data);
      })
      .catch(() => {
        // Non bloquant : l'absence de la liste d'amis ne doit pas empêcher l'affichage du profil.
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId, isOwnProfile]);

  const handleAcceptPending = async (senderId: string) => {
    const previous = pendingRequests;
    const accepted = pendingRequests.find((req) => req.senderId === senderId);
    setPendingRequests((r) => r.filter((req) => req.senderId !== senderId));
    // L'ami passe immédiatement dans "Mes amis" : la demande vient d'être acceptée, inutile
    // d'attendre un rechargement pour le voir apparaître.
    if (accepted) {
      setFriends((f) =>
        f.some((fr) => fr.id === senderId)
          ? f
          : [...f, { id: senderId, pseudo: accepted.senderPseudo, avatarUrl: accepted.senderAvatarUrl }]
      );
    }
    try {
      await acceptFriendRequest(senderId, currentUserId);
    } catch (err) {
      setPendingRequests(previous);
      setFriends((f) => f.filter((fr) => fr.id !== senderId));
      setError(errorMessage(err));
    }
  };

  const handleDeclinePending = async (senderId: string) => {
    const previous = pendingRequests;
    setPendingRequests((r) => r.filter((req) => req.senderId !== senderId));
    try {
      await deleteFriendRelation(currentUserId, senderId);
    } catch (err) {
      setPendingRequests(previous);
      setError(errorMessage(err));
    }
  };

  useEffect(() => {
    if (isOwnProfile) return;
    let cancelled = false;
    fetchFriendStatus(currentUserId, profileId)
      .then((status) => {
        if (!cancelled) setFriendStatus(status);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, currentUserId, isOwnProfile]);

  useEffect(() => {
    if (isOwnProfile) return;
    let cancelled = false;
    fetchMutualFriendsPreview(profileId)
      .then((data) => {
        if (!cancelled) setMutualFriends(data);
      })
      .catch(() => {
        // Discret : l'aperçu d'amis en commun n'est pas une information critique, une erreur ici
        // ne doit pas bloquer l'affichage du reste du profil.
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, isOwnProfile]);

  const handleSendFriendRequest = async () => {
    const previous = friendStatus;
    setFriendStatus('pending_sent');
    try {
      await sendFriendRequest(currentUserId, profileId);
    } catch (err) {
      setFriendStatus(previous);
      setError(errorMessage(err));
    }
  };

  const handleAcceptFriendRequest = async () => {
    const previous = friendStatus;
    setFriendStatus('friends');
    try {
      await acceptFriendRequest(profileId, currentUserId);
    } catch (err) {
      setFriendStatus(previous);
      setError(errorMessage(err));
    }
  };

  const handleCancelOrRemove = async () => {
    const previous = friendStatus;
    setFriendStatus('none');
    setConfirmingRemove(false);
    try {
      await deleteFriendRelation(currentUserId, profileId);
    } catch (err) {
      setFriendStatus(previous);
      setError(errorMessage(err));
    }
  };

  const handleChangeAvatar = async () => {
    try {
      const image = await pickAvatarImage();
      if (!image) return;
      setCropTarget(image);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleCropCancel = () => setCropTarget(null);

  const handleCropConfirm = async (region: CropRegion) => {
    const image = cropTarget;
    if (!image) return;
    setCropTarget(null);
    setAvatarUploading(true);
    try {
      const url = await uploadAvatar(currentUserId, image.uri, region);
      setProfile((p) => (p ? { ...p, avatarUrl: url } : p));
      onProfileChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const previous = profile?.avatarUrl;
    setProfile((p) => (p ? { ...p, avatarUrl: undefined } : p));
    try {
      await removeAvatar(currentUserId);
      onProfileChanged?.();
    } catch (err) {
      setProfile((p) => (p ? { ...p, avatarUrl: previous } : p));
      setError(errorMessage(err));
    }
  };

  const handleProfileSaved = (updated: ProfileDetails) => {
    setProfile(updated);
    setEditingProfile(false);
    onProfileChanged?.();
  };

  const handleDelete = async (postId: string) => {
    const previous = posts;
    setPosts((p) => p.filter((post) => post.id !== postId));
    try {
      await deletePost(postId);
    } catch (err) {
      setPosts(previous);
      setError(errorMessage(err));
    }
  };

  const handleToggleLike = async (postId: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const nextLiked = !post.likedByMe;
    setPosts((p) =>
      p.map((post) =>
        post.id === postId
          ? { ...post, likedByMe: nextLiked, likeCount: post.likeCount + (nextLiked ? 1 : -1) }
          : post
      )
    );
    try {
      await setLiked(postId, currentUserId, nextLiked);
    } catch (err) {
      setPosts((p) =>
        p.map((post) =>
          post.id === postId
            ? { ...post, likedByMe: !nextLiked, likeCount: post.likeCount + (nextLiked ? -1 : 1) }
            : post
        )
      );
      setError(errorMessage(err));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        </View>

        {error && <Text style={styles.statusText}>{error}</Text>}

        {loading || !profile ? (
          <Text style={styles.statusText}>Chargement du profil…</Text>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.avatarWrap}>
                <Avatar url={profile.avatarUrl} name={profile.displayName} size={72} />
                {isOwnProfile && (
                  <Pressable
                    style={styles.avatarEditBadge}
                    onPress={handleChangeAvatar}
                    disabled={avatarUploading}
                    hitSlop={8}
                  >
                    {avatarUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.avatarEditIcon}>📷</Text>
                    )}
                  </Pressable>
                )}
              </View>
              {isOwnProfile && profile.avatarUrl && !avatarUploading && (
                <Pressable onPress={handleRemoveAvatar} hitSlop={8}>
                  <Text style={styles.removeAvatarLink}>Retirer la photo</Text>
                </Pressable>
              )}
              <Text style={styles.displayName}>{profile.displayName}</Text>
              {profile.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : (
                <Text style={styles.subtitle}>{playerSummary(profile.formatFavori, profile.frequenceJeu)}</Text>
              )}
              <Text style={styles.metaLine}>
                {posts.length} main{posts.length !== 1 ? 's' : ''} partagée{posts.length !== 1 ? 's' : ''} · Membre
                depuis {formatJoinDate(profile.createdAt)}
              </Text>

              {isOwnProfile && (
                <View style={styles.ownProfileActions}>
                  <Pressable style={styles.editProfileButton} onPress={() => setEditingProfile(true)}>
                    <Text style={styles.editProfileButtonText}>Modifier mon profil</Text>
                  </Pressable>
                  <Pressable style={styles.editProfileButton} onPress={onOpenFriends} disabled={!onOpenFriends}>
                    <Text style={styles.editProfileButtonText}>
                      Mes amis{friends.length > 0 ? ` · ${friends.length}` : ''}
                    </Text>
                  </Pressable>
                </View>
              )}

              {!isOwnProfile && friendStatus && (
                <View style={styles.friendSection}>
                  {friendStatus === 'none' && (
                    <Pressable style={styles.friendButton} onPress={handleSendFriendRequest}>
                      <Text style={styles.friendButtonText}>Ajouter en ami</Text>
                    </Pressable>
                  )}
                  {friendStatus === 'pending_sent' && (
                    <Pressable style={styles.friendButtonOutline} onPress={handleCancelOrRemove}>
                      <Text style={styles.friendButtonOutlineText}>Demande envoyée · Annuler</Text>
                    </Pressable>
                  )}
                  {friendStatus === 'pending_received' && (
                    <Pressable style={styles.friendButton} onPress={handleAcceptFriendRequest}>
                      <Text style={styles.friendButtonText}>Accepter la demande d'ami</Text>
                    </Pressable>
                  )}
                  {friendStatus === 'friends' && !confirmingRemove && (
                    <View style={styles.friendsRow}>
                      <Text style={styles.friendsLabel}>✓ Amis</Text>
                      <Pressable onPress={() => setConfirmingRemove(true)} hitSlop={8}>
                        <Text style={styles.friendRemoveLink}>Retirer</Text>
                      </Pressable>
                    </View>
                  )}
                  {friendStatus === 'friends' && confirmingRemove && (
                    <View style={styles.friendsRow}>
                      <Text style={styles.confirmRemoveText}>Retirer cet ami ?</Text>
                      <Pressable onPress={() => setConfirmingRemove(false)} hitSlop={8}>
                        <Text style={styles.confirmRemoveCancel}>Non</Text>
                      </Pressable>
                      <Pressable onPress={handleCancelOrRemove} hitSlop={8}>
                        <Text style={styles.confirmRemoveConfirm}>Oui, retirer</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {!isOwnProfile && mutualFriends.length > 0 && (
                <View style={styles.mutualFriendsRow}>
                  <View style={styles.mutualAvatarsStack}>
                    {mutualFriends.slice(0, 3).map((f, i) => (
                      <View
                        key={f.id}
                        style={[styles.mutualAvatarWrap, { marginLeft: i === 0 ? 0 : -10, zIndex: 3 - i }]}
                      >
                        <Avatar url={f.avatarUrl} name={f.pseudo} size={22} />
                      </View>
                    ))}
                  </View>
                  <Text style={styles.mutualFriendsText}>
                    {mutualFriendsLabel(mutualFriends.map((f) => f.pseudo))}
                  </Text>
                </View>
              )}
            </View>

            {isOwnProfile && pendingRequests.length > 0 && (
              <View style={styles.pendingSection}>
                <Text style={styles.pendingSectionTitle}>Invitations en attente</Text>
                {pendingRequests.map((req) => (
                  <View key={req.senderId} style={styles.pendingRow}>
                    <Pressable
                      style={styles.pendingRowInfo}
                      onPress={() => onSelectProfile?.(req.senderId)}
                      disabled={!onSelectProfile}
                    >
                      <Avatar url={req.senderAvatarUrl} name={req.senderPseudo} size={34} />
                      <Text style={styles.pendingPseudo}>{req.senderPseudo}</Text>
                    </Pressable>
                    <View style={styles.pendingActions}>
                      <Pressable
                        style={styles.pendingDeclineButton}
                        onPress={() => handleDeclinePending(req.senderId)}
                        hitSlop={8}
                      >
                        <Text style={styles.pendingDeclineText}>Refuser</Text>
                      </Pressable>
                      <Pressable
                        style={styles.pendingAcceptButton}
                        onPress={() => handleAcceptPending(req.senderId)}
                        hitSlop={8}
                      >
                        <Text style={styles.pendingAcceptText}>Accepter</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {posts.length === 0 ? (
              <Text style={styles.statusText}>Aucune main partagée pour l'instant.</Text>
            ) : (
              posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  isOwnPost={post.authorId === currentUserId}
                  onDelete={() => handleDelete(post.id)}
                  onEdit={() => onEditPost(post.id)}
                  onToggleLike={() => handleToggleLike(post.id)}
                  onOpenGroup={onOpenGroup}
                />
              ))
            )}
          </>
        )}
      </ScrollView>
      {cropTarget && (
        <AvatarCropper
          uri={cropTarget.uri}
          naturalWidth={cropTarget.width}
          naturalHeight={cropTarget.height}
          onCancel={handleCropCancel}
          onConfirm={handleCropConfirm}
        />
      )}
      {editingProfile && profile && (
        <EditProfileScreen
          profile={profile}
          userId={currentUserId}
          onCancel={() => setEditingProfile(false)}
          onSaved={handleProfileSaved}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: colors.feedBackground,
  },
  scrollContent: {
    paddingTop: 50,
    paddingBottom: 40,
  },
  topRow: {
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.action,
    borderWidth: 2,
    borderColor: colors.feedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditIcon: {
    fontSize: 13,
  },
  removeAvatarLink: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
    marginBottom: spacing.sm,
  },
  displayName: {
    ...typography.postTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  bio: {
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
    lineHeight: 20,
  },
  metaLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    textAlign: 'center',
  },
  editProfileButton: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  editProfileButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  statusText: {
    marginHorizontal: 14,
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  friendSection: {
    marginTop: spacing.sm,
  },
  mutualFriendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  mutualAvatarsStack: {
    flexDirection: 'row',
  },
  mutualAvatarWrap: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.feedBackground,
  },
  mutualFriendsText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  ownProfileActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  pendingSection: {
    marginHorizontal: 14,
    marginBottom: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(232,87,31,0.06)',
  },
  pendingSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: spacing.xs,
  },
  pendingRowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  pendingPseudo: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  pendingDeclineButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  pendingDeclineText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pendingAcceptButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  pendingAcceptText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  friendButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  friendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  friendButtonOutline: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  friendButtonOutlineText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  friendsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  friendsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.action,
  },
  friendRemoveLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmRemoveText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmRemoveCancel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmRemoveConfirm: {
    fontSize: 13,
    color: '#C0392B',
    fontWeight: '700',
  },
});
