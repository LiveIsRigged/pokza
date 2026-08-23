import React, { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import type { Phase } from '../creator/types';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing, tints, typography } from '../theme/theme';
import {
  deleteGroup,
  fetchGroup,
  fetchGroupMembers,
  markGroupSeen,
  removeGroupMember,
  type Group,
  type GroupMember,
} from '../data/groups';
import { pickAvatarFromCamera, pickAvatarImage, type CropRegion, type PickedImage } from '../data/avatars';
import { removeGroupAvatar, uploadGroupAvatar } from '../data/groupAvatars';
import { deletePost, fetchGroupPosts, setLiked } from '../data/posts';
import type { Post } from '../types/poker';
import { PostCard } from '../components/post/PostCard';
import { Avatar } from '../components/ui/Avatar';
import { AvatarCropper } from '../components/ui/AvatarCropper';
import { OverflowMenu, type OverflowAnchor, type OverflowMenuItem } from '../components/ui/OverflowMenu';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { EditGroupScreen } from './EditGroupScreen';
import { GroupMembersScreen } from './GroupMembersScreen';
import { CameraIcon, ExitIcon, GroupTableIcon, ImageIcon, PencilIcon, TrashIcon } from '../components/ui/icons';

/** Même format court que les dates de main / d'inscription ailleurs dans l'app (ex: "29 juil. 2026"). */
function formatCreatedDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

interface GroupScreenProps {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  onBack: () => void;
  onEditPost: (postId: string) => void;
  onCorrectPost: (postId: string, depuis: Phase) => void;
  onDuplicatePost: (postId: string) => void;
  onInviteMembers: (groupId: string) => void;
  /** Ouvre le profil d'un membre ou de l'auteur d'une main — comme le clic sur un auteur dans le feed. */
  onSelectProfile: (profileId: string) => void;
  /** Lance la création d'une main. Proposé quand le groupe n'a encore aucune main : sans lui, la
   *  page d'un groupe fraîchement créé ne dit pas quoi faire ensuite. */
  onCreateHand?: () => void;
  /** Bandeau d'arrivée après avoir publié une main dans un groupe créé pendant cette création :
   *  la main est bien là, mais personne d'autre n'est encore dans le groupe pour la voir. Ne
   *  survit pas à la sortie de l'écran (cf. App.tsx) — il annonce un fait qui vient d'arriver,
   *  pas un état du groupe. */
  showPublishedNotice?: boolean;
}

export interface GroupScreenHandle {
  /**
   * Ferme le panneau ouvert (Modifier le groupe / Liste de membres / Exclure un membre) s'il y en a
   * un, et renvoie `true` dans ce cas. `App.tsx` s'en sert pour le glissement de bord (`Screen`) :
   * sans ça, ce geste ignore ces panneaux (rendus en overlay LOCAL à `GroupScreen`, invisibles du
   * geste qui, lui, est attaché bien plus haut, autour de tout l'écran) et saute directement à « Mes
   * groupes privés » au lieu de refermer le panneau — contrairement à la flèche ‹ de chaque panneau,
   * qui referme correctement car elle appelle son propre `onCancel`/`onBack` local. Renvoie `false`
   * quand rien n'est ouvert, pour laisser `App.tsx` faire son retour normal.
   */
  handleBack: () => boolean;
}

export const GroupScreen = React.forwardRef<GroupScreenHandle, GroupScreenProps>(function GroupScreen(
  {
    groupId,
    currentUserId,
    currentUserName,
    onBack,
    onEditPost,
    onCorrectPost,
    onDuplicatePost,
    onInviteMembers,
    onSelectProfile,
    onCreateHand,
    showPublishedNotice,
  },
  ref
) {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [cropTarget, setCropTarget] = useState<PickedImage | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  // Écran « Liste de membres » (bulle, tout le monde) — toujours en lecture seule, même pour le
  // fondateur : cf. `GroupMembersScreen`, l'exclusion vit uniquement dans `managingMembers`.
  const [viewingMembers, setViewingMembers] = useState(false);
  // Écran « Exclure un membre » (menu ⋯, fondateur uniquement) — même liste, avec les liens
  // Retirer/Annuler en plus.
  const [managingMembers, setManagingMembers] = useState(false);
  // Menu de la pastille 📷 : sources photo + retrait, regroupés au même endroit.
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarBadgeRef = useRef<View>(null);
  const [avatarMenuAnchor, setAvatarMenuAnchor] = useState<OverflowAnchor | null>(null);
  // Menu ⋯ de l'en-tête (modifier/supprimer/quitter le groupe, exclure un membre).
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<OverflowAnchor | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      handleBack: () => {
        if (editingGroup) {
          setEditingGroup(false);
          return true;
        }
        if (managingMembers) {
          setManagingMembers(false);
          return true;
        }
        if (viewingMembers) {
          setViewingMembers(false);
          return true;
        }
        // Sans ça, le glissement de bord navigue vers « Mes groupes privés » sous la feuille de
        // confirmation encore affichée, au lieu de la refermer d'abord.
        if (confirmingLeave && !leavingGroup) {
          setConfirmingLeave(false);
          return true;
        }
        return false;
      },
    }),
    [editingGroup, managingMembers, viewingMembers, confirmingLeave, leavingGroup]
  );

  const openAvatarMenu = () => {
    avatarBadgeRef.current?.measureInWindow((x, y, width, height) => {
      setAvatarMenuAnchor({ x, y, width, height });
      setAvatarMenuOpen(true);
    });
  };

  const openMenu = () => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };

  const isOwner = group?.ownerId === currentUserId;

  const load = () => {
    setLoading(true);
    Promise.all([fetchGroup(groupId), fetchGroupMembers(groupId), fetchGroupPosts(groupId)])
      .then(([groupData, memberData, postsData]) => {
        setGroup(groupData);
        setMembers(memberData);
        setPosts(postsData);
        setLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
    // Ouvrir la page suffit à marquer le groupe comme vu. Volontairement hors du `Promise.all` :
    // si l'appel échoue, la pastille restera simplement affichée — ça ne doit pas empêcher la page
    // de s'afficher.
    markGroupSeen(groupId).catch(() => {});
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

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
      const url = await uploadGroupAvatar(groupId, image.uri, region);
      setGroup((g) => (g ? { ...g, avatarUrl: url } : g));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    const previous = group?.avatarUrl;
    setGroup((g) => (g ? { ...g, avatarUrl: undefined } : g));
    try {
      await removeGroupAvatar(groupId);
    } catch (err) {
      setGroup((g) => (g ? { ...g, avatarUrl: previous } : g));
      setError(errorMessage(err));
    }
  };

  // Items du menu de la pastille 📷 : prendre une photo (natif — la photothèque ne l'expose pas),
  // choisir dans la photothèque, et retirer la photo si elle existe. Remplace l'ancien lien
  // « Retirer la photo » isolé sous l'avatar du groupe.
  const avatarMenuItems: OverflowMenuItem[] = [
    ...(Platform.OS !== 'web'
      ? [{ label: 'Prendre une photo', icon: CameraIcon, onPress: handleTakePhoto }]
      : []),
    { label: 'Choisir une photo', icon: ImageIcon, onPress: handleChangeAvatar },
    ...(group?.avatarUrl
      ? [{ label: 'Retirer la photo', icon: TrashIcon, destructive: true, onPress: handleRemoveAvatar }]
      : []),
  ];

  const handleGroupSaved = (description: string) => {
    setGroup((g) => (g ? { ...g, description: description || undefined } : g));
    setEditingGroup(false);
  };

  const handleRemoveMember = async (userId: string) => {
    const previous = members;
    setMembers((m) => m.filter((mem) => mem.userId !== userId));
    try {
      await removeGroupMember(groupId, userId);
    } catch (err) {
      setMembers(previous);
      setError(errorMessage(err));
    }
  };

  const handleLeaveOrDelete = async () => {
    setLeavingGroup(true);
    try {
      if (isOwner) {
        await deleteGroup(groupId);
      } else {
        await removeGroupMember(groupId, currentUserId);
      }
      onBack();
    } catch (err) {
      setError(errorMessage(err));
      setLeavingGroup(false);
      setConfirmingLeave(false);
    }
  };

  // Menu ⋯ de l'en-tête : modifier/supprimer le groupe et exclure un membre pour le fondateur,
  // quitter le groupe pour les autres. « Supprimer »/« Quitter » déclenchent la même confirmation
  // (`confirmingLeave`) qu'auparavant, juste depuis le menu plutôt qu'un lien sur la page, et
  // affichée maintenant dans le `ConfirmSheet` partagé plutôt qu'en ligne.
  const groupMenuItems: OverflowMenuItem[] = [
    ...(isOwner ? [{ label: 'Modifier le groupe', icon: PencilIcon, onPress: () => setEditingGroup(true) }] : []),
    isOwner
      ? { label: 'Supprimer le groupe', icon: TrashIcon, destructive: true, onPress: () => setConfirmingLeave(true) }
      : { label: 'Quitter le groupe', icon: ExitIcon, destructive: true, onPress: () => setConfirmingLeave(true) },
    ...(isOwner
      ? [{ label: 'Exclure un membre', icon: GroupTableIcon, onPress: () => setManagingMembers(true) }]
      : []),
  ];

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
          {group && (
            <Pressable ref={menuButtonRef} onPress={openMenu} hitSlop={8}>
              <Text style={styles.overflowIcon}>⋯</Text>
            </Pressable>
          )}
        </View>

        {showPublishedNotice && (
          <View style={styles.publishedNotice}>
            <Text style={styles.publishedNoticeText}>
              Ta main est publiée ici. Tu es seul dans ce groupe pour l'instant — invite des joueurs
              pour qu'ils la voient.
            </Text>
          </View>
        )}

        {error && <Text style={styles.statusText}>{error}</Text>}

        {loading || !group ? (
          <Text style={styles.statusText}>Chargement du groupe privé…</Text>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.avatarWrap}>
                <Avatar url={group.avatarUrl} name={group.name} size={64} shape="square" />
                {isOwner && (
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
              <Text style={styles.groupName}>{group.name}</Text>

              {(() => {
                const acceptedCount = members.filter((m) => m.status === 'accepted').length;
                return (
                  <View style={styles.statsRow}>
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{posts.length}</Text>
                      <Text style={styles.statLabel}>main{posts.length > 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{acceptedCount}</Text>
                      <Text style={styles.statLabel}>membre{acceptedCount > 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                      <Text style={styles.statValue}>{formatCreatedDate(group.createdAt)}</Text>
                      <Text style={styles.statLabel}>créé le</Text>
                    </View>
                  </View>
                );
              })()}

              {(() => {
                const accepted = members.filter((m) => m.status === 'accepted');
                const shown = accepted.slice(0, 6);
                const extra = accepted.length - shown.length;
                if (shown.length === 0) return null;
                return (
                  <View style={styles.avatarStack}>
                    {shown.map((m, i) => (
                      <Pressable
                        key={m.userId}
                        onPress={() => onSelectProfile(m.userId)}
                        style={[styles.stackAvatar, i > 0 && styles.stackAvatarOverlap, { zIndex: shown.length - i }]}
                      >
                        <Avatar url={m.avatarUrl} name={m.displayName} size={34} />
                      </Pressable>
                    ))}
                    {extra > 0 && (
                      <View style={[styles.stackAvatar, styles.stackAvatarOverlap, styles.stackMore]}>
                        <Text style={styles.stackMoreText}>+{extra}</Text>
                      </View>
                    )}
                  </View>
                );
              })()}

              {group.description && <Text style={styles.description}>{group.description}</Text>}

              <View style={styles.headerActions}>
                {/* Visible de tous les membres, contrairement à « Inviter » — remplace l'ancienne
                    section « Membres » systématiquement dépliée sur la page. */}
                <Pressable style={styles.membersButton} onPress={() => setViewingMembers(true)}>
                  <Text style={styles.membersButtonText}>Liste de membres</Text>
                </Pressable>
                {isOwner && (
                  <Pressable style={styles.inviteButton} onPress={() => onInviteMembers(groupId)}>
                    <Text style={styles.inviteButtonText}>Inviter</Text>
                  </Pressable>
                )}
              </View>
            </View>

            <Text style={styles.sectionTitle}>Mains du groupe privé</Text>
            {posts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.statusText}>Aucune main partagée pour l'instant.</Text>
                {onCreateHand && (
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
                  isGroupFounder={post.authorId === group.ownerId}
                  onDelete={() => handleDelete(post.id)}
                  onEdit={() => onEditPost(post.id)}
                  onCorrect={(depuis) => onCorrectPost(post.id, depuis)}
                  onDuplicate={() => onDuplicatePost(post.id)}
                  onToggleLike={() => handleToggleLike(post.id)}
                  onPressAuthor={() => onSelectProfile(post.authorId)}
                  onSelectProfile={onSelectProfile}
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
      {editingGroup && group && (
        <EditGroupScreen
          groupId={groupId}
          initialDescription={group.description}
          onCancel={() => setEditingGroup(false)}
          onSaved={handleGroupSaved}
        />
      )}
      {viewingMembers && group && (
        <GroupMembersScreen
          members={members}
          ownerId={group.ownerId}
          currentUserId={currentUserId}
          onSelectProfile={onSelectProfile}
          onBack={() => setViewingMembers(false)}
        />
      )}
      {managingMembers && group && (
        <GroupMembersScreen
          members={members}
          ownerId={group.ownerId}
          currentUserId={currentUserId}
          canManage
          onRemoveMember={handleRemoveMember}
          onSelectProfile={onSelectProfile}
          onBack={() => setManagingMembers(false)}
        />
      )}
      <OverflowMenu
        visible={avatarMenuOpen}
        onClose={() => setAvatarMenuOpen(false)}
        items={avatarMenuItems}
        anchor={avatarMenuAnchor}
      />
      <OverflowMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={groupMenuItems} anchor={menuAnchor} />
      <ConfirmSheet
        visible={confirmingLeave}
        icon={isOwner ? TrashIcon : ExitIcon}
        title={isOwner ? 'Supprimer ce groupe privé ?' : 'Quitter ce groupe privé ?'}
        message={isOwner ? 'Le groupe et ses mains partagées disparaîtront pour tout le monde.' : undefined}
        confirmLabel={isOwner ? 'Supprimer' : 'Quitter'}
        loading={leavingGroup}
        onCancel={() => setConfirmingLeave(false)}
        onConfirm={handleLeaveOrDelete}
      />
    </View>
  );
});

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
  // Même bouton d'amorce que sur un profil vide et sous la liste des groupes privés.
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
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  avatarWrap: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: radius.full,
    backgroundColor: colors.action,
    borderWidth: 2,
    borderColor: colors.feedBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupName: {
    ...typography.postTitle,
    color: colors.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: tints.light,
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  stackAvatar: {
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.feedBackground,
  },
  stackAvatarOverlap: {
    marginLeft: -10,
  },
  stackMore: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: tints.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  description: {
    fontSize: 14,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  headerActions: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
  },
  membersButton: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  membersButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  inviteButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  inviteButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  publishedNotice: {
    marginHorizontal: 14,
    marginBottom: spacing.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.lg,
    backgroundColor: tints.light,
  },
  publishedNoticeText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textPrimary,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    marginLeft: spacing.xs,
    marginHorizontal: 14,
  },
});
