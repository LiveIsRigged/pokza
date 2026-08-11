import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/theme';
import {
  deleteGroup,
  fetchGroup,
  fetchGroupMembers,
  removeGroupMember,
  type Group,
  type GroupMember,
} from '../data/groups';
import { pickAvatarImage, type CropRegion, type PickedImage } from '../data/avatars';
import { removeGroupAvatar, uploadGroupAvatar } from '../data/groupAvatars';
import { deletePost, fetchGroupPosts, setLiked } from '../data/posts';
import type { Post } from '../types/poker';
import { PostCard } from '../components/post/PostCard';
import { Avatar } from '../components/ui/Avatar';
import { AvatarCropper } from '../components/ui/AvatarCropper';
import { EditGroupScreen } from './EditGroupScreen';

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
  onInviteMembers: (groupId: string) => void;
  /** Ouvre le profil d'un membre ou de l'auteur d'une main — comme le clic sur un auteur dans le feed. */
  onSelectProfile: (profileId: string) => void;
}

export function GroupScreen({
  groupId,
  currentUserId,
  currentUserName,
  onBack,
  onEditPost,
  onInviteMembers,
  onSelectProfile,
}: GroupScreenProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [cropTarget, setCropTarget] = useState<PickedImage | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);

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
    try {
      if (isOwner) {
        await deleteGroup(groupId);
      } else {
        await removeGroupMember(groupId, currentUserId);
      }
      onBack();
    } catch (err) {
      setError(errorMessage(err));
      setConfirmingLeave(false);
    }
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

        {loading || !group ? (
          <Text style={styles.statusText}>Chargement du groupe privé…</Text>
        ) : (
          <>
            <View style={styles.header}>
              <View style={styles.avatarWrap}>
                <Avatar url={group.avatarUrl} name={group.name} size={64} shape="square" />
                {isOwner && (
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
              {isOwner && group.avatarUrl && !avatarUploading && (
                <Pressable onPress={handleRemoveAvatar} hitSlop={8}>
                  <Text style={styles.removeAvatarLink}>Retirer la photo</Text>
                </Pressable>
              )}
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
                        <Avatar url={m.avatarUrl} name={m.pseudo} size={34} />
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
              {isOwner && (
                <Pressable style={styles.editGroupButton} onPress={() => setEditingGroup(true)}>
                  <Text style={styles.editGroupButtonText}>Modifier le groupe</Text>
                </Pressable>
              )}

              <View style={styles.headerActions}>
                {isOwner && (
                  <Pressable style={styles.inviteButton} onPress={() => onInviteMembers(groupId)}>
                    <Text style={styles.inviteButtonText}>Inviter</Text>
                  </Pressable>
                )}
                {!confirmingLeave ? (
                  <Pressable onPress={() => setConfirmingLeave(true)} hitSlop={8}>
                    <Text style={styles.leaveLink}>
                      {isOwner ? 'Supprimer le groupe privé' : 'Quitter le groupe privé'}
                    </Text>
                  </Pressable>
                ) : (
                  <View style={styles.confirmRow}>
                    <Text style={styles.confirmText}>
                      {isOwner ? 'Supprimer ce groupe privé ?' : 'Quitter ce groupe privé ?'}
                    </Text>
                    <Pressable onPress={() => setConfirmingLeave(false)} hitSlop={8}>
                      <Text style={styles.confirmCancel}>Non</Text>
                    </Pressable>
                    <Pressable onPress={handleLeaveOrDelete} hitSlop={8}>
                      <Text style={styles.confirmConfirm}>Oui</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.membersSection}>
              <Text style={styles.sectionTitle}>Membres</Text>
              {members.map((m) => (
                <View key={m.userId} style={styles.memberRow}>
                  <Pressable style={styles.memberInfo} onPress={() => onSelectProfile(m.userId)}>
                    <Avatar url={m.avatarUrl} name={m.pseudo} size={32} />
                    <Text style={styles.memberPseudo}>
                      {m.pseudo}
                      {m.userId === group.ownerId && ' 👑'}
                    </Text>
                    {m.status === 'pending' && <Text style={styles.memberPending}>en attente</Text>}
                  </Pressable>
                  {isOwner && m.userId !== currentUserId && (
                    <Pressable onPress={() => handleRemoveMember(m.userId)} hitSlop={8}>
                      <Text style={styles.memberRemoveLink}>{m.status === 'pending' ? 'Annuler' : 'Retirer'}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Mains du groupe privé</Text>
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
                  isGroupFounder={post.authorId === group.ownerId}
                  onDelete={() => handleDelete(post.id)}
                  onEdit={() => onEditPost(post.id)}
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
  avatarEditIcon: {
    fontSize: 12,
  },
  removeAvatarLink: {
    fontSize: 12,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
    marginBottom: spacing.sm,
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
    backgroundColor: 'rgba(22,35,61,0.12)',
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
    backgroundColor: 'rgba(22,35,61,0.12)',
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
  editGroupButton: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    marginTop: spacing.sm,
  },
  editGroupButtonText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
  headerActions: {
    marginTop: spacing.sm,
    alignItems: 'center',
    gap: spacing.xs,
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
  leaveLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmCancel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmConfirm: {
    fontSize: 13,
    color: '#C0392B',
    fontWeight: '700',
  },
  membersSection: {
    marginHorizontal: 14,
    marginBottom: spacing.lg,
    padding: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(22,35,61,0.04)',
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
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: spacing.xs,
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  memberPseudo: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  memberPending: {
    fontSize: 11,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  memberRemoveLink: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
