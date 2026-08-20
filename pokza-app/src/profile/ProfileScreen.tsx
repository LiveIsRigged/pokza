import React, { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, hitSlopPairLeft, hitSlopPairRight, radius, spacing, tints, typography } from '../theme/theme';
import { fetchProfile, type ProfileDetails } from '../data/profiles';
import { EditProfileScreen } from './EditProfileScreen';
import {
  pickAvatarFromCamera,
  pickAvatarImage,
  removeAvatar,
  uploadAvatar,
  type CropRegion,
  type PickedImage,
} from '../data/avatars';
import { deletePost, fetchPosts, setLiked } from '../data/posts';
import {
  acceptFriendRequest,
  deleteFriendRelation,
  fetchFriendCount,
  fetchFriendStatus,
  fetchMutualFriendCount,
  fetchMutualFriendsPreview,
  fetchPendingRequests,
  sendFriendRequest,
  type FriendStatus,
  type MutualFriendPreview,
  type PendingRequest,
} from '../data/friends';
import type { Post } from '../types/poker';
import { PostCard } from '../components/post/PostCard';
import { Avatar } from '../components/ui/Avatar';
import { AvatarCropper } from '../components/ui/AvatarCropper';
import { OverflowMenu, type OverflowMenuItem, type OverflowAnchor } from '../components/ui/OverflowMenu';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { ReportModal } from '../components/moderation/ReportModal';
import { blockUser, isBlockedByMe, unblockUser } from '../data/blocks';
import { countryLabel } from '../data/countries';
import { playerSummary } from './profileOptions';
import { BlockIcon, CameraIcon, FlagIcon, ImageIcon, PersonIcon, PersonMinusIcon, TrashIcon, UndoIcon } from '../components/ui/icons';

/** Même format que les dates de main affichées sur `PostCard` (ex: "29 juil. 2026") — cohérence
 * visuelle entre les deux, pas de format de date différent selon l'écran. */
function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function mutualFriendCountLabel(count: number): string {
  return `${count} ami${count > 1 ? 's' : ''} en commun`;
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
  /** Lance la création d'une main. Sert au bouton proposé quand SON PROPRE profil est encore vide :
   *  la moitié basse de l'écran restait inerte, sans rien indiquer quoi faire ensuite. */
  onCreateHand?: () => void;
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
  onCreateHand,
  onProfileChanged,
}: ProfileScreenProps) {
  const [profile, setProfile] = useState<ProfileDetails | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isOwnProfile = profileId === currentUserId;
  const [friendStatus, setFriendStatus] = useState<FriendStatus | null>(null);
  const [mutualFriends, setMutualFriends] = useState<MutualFriendPreview[]>([]);
  const [mutualFriendCount, setMutualFriendCount] = useState(0);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [friendCount, setFriendCount] = useState(0);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropTarget, setCropTarget] = useState<PickedImage | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<OverflowAnchor | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  // Menu de la pastille 📷 : sources photo + retrait, regroupés au même endroit.
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarBadgeRef = useRef<View>(null);
  const [avatarMenuAnchor, setAvatarMenuAnchor] = useState<OverflowAnchor | null>(null);

  const openMenu = () => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };

  const openAvatarMenu = () => {
    avatarBadgeRef.current?.measureInWindow((x, y, width, height) => {
      setAvatarMenuAnchor({ x, y, width, height });
      setAvatarMenuOpen(true);
    });
  };
  // null tant qu'on ne sait pas encore ; pertinent uniquement pour le profil d'un autre.
  const [blocked, setBlocked] = useState<boolean | null>(null);

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
    let cancelled = false;
    fetchFriendCount(profileId)
      .then((count) => {
        if (!cancelled) setFriendCount(count);
      })
      .catch(() => {
        // Non bloquant : l'absence du compte d'amis ne doit pas empêcher l'affichage du profil.
      });
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const handleAcceptPending = async (senderId: string) => {
    const previous = pendingRequests;
    setPendingRequests((r) => r.filter((req) => req.senderId !== senderId));
    // Le compte d'amis augmente immédiatement : la demande vient d'être acceptée, inutile
    // d'attendre un rechargement pour le voir reflété.
    setFriendCount((c) => c + 1);
    try {
      await acceptFriendRequest(senderId, currentUserId);
    } catch (err) {
      setPendingRequests(previous);
      setFriendCount((c) => c - 1);
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

  useEffect(() => {
    if (isOwnProfile) return;
    let cancelled = false;
    fetchMutualFriendCount(profileId)
      .then((count) => {
        if (!cancelled) setMutualFriendCount(count);
      })
      .catch(() => {
        // Discret, même logique que l'aperçu ci-dessus : non bloquant.
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, isOwnProfile]);

  useEffect(() => {
    if (isOwnProfile) return;
    let cancelled = false;
    isBlockedByMe(currentUserId, profileId)
      .then((v) => {
        if (!cancelled) setBlocked(v);
      })
      .catch(() => {
        if (!cancelled) setBlocked(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profileId, currentUserId, isOwnProfile]);

  const handleBlock = async () => {
    try {
      await blockUser(currentUserId, profileId);
      // Le blocage rompt l'amitié et masque les mains de l'autre (RLS) — on reflète les deux
      // localement sans attendre un rechargement : plus d'actions ami, plus de mains affichées.
      setBlocked(true);
      setFriendStatus('none');
      setPosts([]);
      setMutualFriends([]);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleUnblock = async () => {
    try {
      await unblockUser(currentUserId, profileId);
      setBlocked(false);
      // Les mains redeviennent visibles côté serveur : on les recharge (l'amitié rompue, elle, ne
      // se restaure pas — il faudra refaire une demande, comme après un simple retrait d'ami).
      const fresh = await fetchPosts(profileId);
      setPosts(fresh);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  // Menu ⋯ de l'en-tête, uniquement sur le profil d'un autre : signaler le compte, retirer l'ami
  // (si on l'est déjà — sinon ce choix n'a pas de sens et n'apparaît pas), bloquer/débloquer.
  const menuItems: OverflowMenuItem[] = [
    { label: 'Signaler ce joueur', icon: FlagIcon, onPress: () => setReportOpen(true) },
    ...(friendStatus === 'friends'
      ? [{ label: 'Retirer cet ami', icon: PersonMinusIcon, destructive: true, onPress: () => setConfirmingRemove(true) }]
      : []),
    blocked
      ? { label: 'Débloquer', icon: UndoIcon, onPress: handleUnblock }
      : { label: 'Bloquer ce joueur', icon: BlockIcon, destructive: true, onPress: () => setConfirmingBlock(true) },
  ];

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

  const handleTakePhoto = async () => {
    try {
      const image = await pickAvatarFromCamera();
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

  // Items du menu de la pastille 📷 : prendre une photo (natif — la photothèque ne l'expose pas),
  // choisir dans la photothèque, et retirer la photo si elle existe. Remplace l'ancien lien
  // « Retirer la photo » isolé sous l'avatar.
  const avatarMenuItems: OverflowMenuItem[] = [
    ...(Platform.OS !== 'web'
      ? [{ label: 'Prendre une photo', icon: CameraIcon, onPress: handleTakePhoto }]
      : []),
    { label: 'Choisir une photo', icon: ImageIcon, onPress: handleChangeAvatar },
    ...(profile?.avatarUrl
      ? [{ label: 'Retirer la photo', icon: TrashIcon, destructive: true, onPress: handleRemoveAvatar }]
      : []),
  ];

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
          {!isOwnProfile && (
            <Pressable ref={menuButtonRef} onPress={openMenu} hitSlop={8}>
              <Text style={styles.overflowIcon}>⋯</Text>
            </Pressable>
          )}
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
                    ref={avatarBadgeRef}
                    style={styles.avatarEditBadge}
                    onPress={openAvatarMenu}
                    disabled={avatarUploading}
                    hitSlop={8}
                  >
                    {avatarUploading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <CameraIcon size={14} color="#fff" />
                    )}
                  </Pressable>
                )}
              </View>
              <Text style={styles.displayName}>{profile.displayName}</Text>
              {profile.country && countryLabel(profile.country) ? (
                <Text style={styles.countryLine}>{countryLabel(profile.country)}</Text>
              ) : null}
              {profile.bio ? (
                <Text style={styles.bio}>{profile.bio}</Text>
              ) : (
                <Text style={styles.subtitle}>{playerSummary(profile.formatFavori, profile.frequenceJeu)}</Text>
              )}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{posts.length}</Text>
                  <Text style={styles.statLabel}>main{posts.length !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statNumber}>{friendCount}</Text>
                  <Text style={styles.statLabel}>ami{friendCount !== 1 ? 's' : ''}</Text>
                </View>
              </View>
              {/* Visible que l'on soit déjà ami ou non : contrairement au bloc détaillé plus bas
                  (avatars + noms, réservé aux cas où il y en a au moins un), ce chiffre exact vient
                  de `mutual_friend_count` côté base — jamais tronqué comme l'aperçu limité à 10. */}
              {!isOwnProfile && !blocked && mutualFriendCount > 0 && (
                <Text style={styles.mutualCountLine}>{mutualFriendCountLabel(mutualFriendCount)}</Text>
              )}
              <Text style={styles.metaLine}>Membre depuis {formatJoinDate(profile.createdAt)}</Text>

              {isOwnProfile && (
                <View style={styles.ownProfileActions}>
                  <Pressable style={styles.editProfileButton} onPress={() => setEditingProfile(true)}>
                    <Text style={styles.editProfileButtonText}>Modifier mon profil</Text>
                  </Pressable>
                  <Pressable style={styles.editProfileButton} onPress={onOpenFriends} disabled={!onOpenFriends}>
                    <Text style={styles.editProfileButtonText}>
                      Mes amis{friendCount > 0 ? ` · ${friendCount}` : ''}
                    </Text>
                  </Pressable>
                </View>
              )}

              {!isOwnProfile && !blocked && friendStatus && (
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
                  {/* Le retrait d'ami n'est plus déclenché ici : il vit désormais dans le menu ⋯
                      en haut de l'écran, pour ne pas laisser une option destructive en accès direct
                      sur la page. */}
                  {friendStatus === 'friends' && <Text style={styles.friendsLabel}>✓ Amis</Text>}
                </View>
              )}

              {!isOwnProfile && !blocked && mutualFriends.length > 0 && (
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
                        hitSlop={hitSlopPairLeft}
                      >
                        <Text style={styles.pendingDeclineText}>Refuser</Text>
                      </Pressable>
                      <Pressable
                        style={styles.pendingAcceptButton}
                        onPress={() => handleAcceptPending(req.senderId)}
                        hitSlop={hitSlopPairRight}
                      >
                        <Text style={styles.pendingAcceptText}>Accepter</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {blocked ? (
              <View style={styles.blockedNotice}>
                <Text style={styles.blockedTitle}>Tu as bloqué ce joueur</Text>
                <Text style={styles.blockedText}>
                  Ses mains et ses interactions te sont masquées, et il ne peut plus t'envoyer de
                  demande d'ami. Tu peux le débloquer à tout moment.
                </Text>
                <Pressable style={styles.unblockButton} onPress={handleUnblock}>
                  <Text style={styles.unblockButtonText}>Débloquer</Text>
                </Pressable>
              </View>
            ) : posts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.statusText}>Aucune main partagée pour l'instant.</Text>
                {isOwnProfile && onCreateHand && (
                  <Pressable style={styles.emptyButton} onPress={onCreateHand}>
                    <Text style={styles.emptyButtonText}>+ Créer une main</Text>
                  </Pressable>
                )}
              </View>
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
                  onSelectProfile={onSelectProfile}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      <OverflowMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} anchor={menuAnchor} />
      <OverflowMenu
        visible={avatarMenuOpen}
        onClose={() => setAvatarMenuOpen(false)}
        items={avatarMenuItems}
        anchor={avatarMenuAnchor}
      />
      <ConfirmSheet
        visible={confirmingRemove}
        icon={PersonIcon}
        title="Retirer cet ami ?"
        confirmLabel="Retirer"
        onCancel={() => setConfirmingRemove(false)}
        onConfirm={handleCancelOrRemove}
      />
      <ConfirmSheet
        visible={confirmingBlock}
        icon={BlockIcon}
        title={`Bloquer ${profile?.displayName ?? 'ce joueur'} ?`}
        message="Tu ne verras plus ses mains, et il ne pourra plus t'envoyer de demande d'ami."
        confirmLabel="Bloquer"
        onCancel={() => setConfirmingBlock(false)}
        onConfirm={() => {
          setConfirmingBlock(false);
          handleBlock();
        }}
      />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reporterId={currentUserId}
        targetType="user"
        targetId={profileId}
        targetLabel={profile?.displayName ?? 'ce joueur'}
      />
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  overflowIcon: {
    fontSize: 22,
    lineHeight: 22,
    fontWeight: '700',
    color: colors.textSecondary,
    paddingHorizontal: 4,
  },
  blockedNotice: {
    marginHorizontal: 14,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(192,57,43,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.2)',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockedTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#C0392B',
  },
  blockedText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  unblockButton: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  unblockButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
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
  displayName: {
    ...typography.postTitle,
    color: colors.textPrimary,
  },
  countryLine: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 3,
    textAlign: 'center',
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 26,
    backgroundColor: tints.medium,
  },
  mutualCountLine: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  metaLine: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
  editProfileButton: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  editProfileButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  // État vide de SON PROPRE profil : le texte seul laissait la moitié basse de l'écran inerte.
  // Même bouton que celui déjà proposé sous la liste vide des groupes privés.
  emptyState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  emptyButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  emptyButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
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
    // Écart entre le bloc « profil » (étiré, cf. `flex: 1`) et les boutons d'action : au moins le
    // débordement de leur zone de touche (`HIT_SLOP`), sinon elle mord sur le bloc profil.
    gap: spacing.sm,
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
    gap: spacing.sm,
  },
  pendingDeclineButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
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
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  friendButtonOutlineText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  friendsLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.action,
  },
});
