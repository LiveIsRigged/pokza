import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Post } from '../../types/poker';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { Avatar } from '../ui/Avatar';
import { HandReplayer } from '../replayer/HandReplayer';
import { VotePoll } from './VotePoll';
import { CommentsSection } from './CommentsSection';
import { OverflowMenu, type OverflowMenuItem, type OverflowAnchor } from '../ui/OverflowMenu';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { ReportModal } from '../moderation/ReportModal';
import { blockUser } from '../../data/blocks';
import { errorMessage } from '../../utils/errorMessage';
import { shareOrCopy, POKZA_WEB_ORIGIN } from '../../utils/share';
import { formatChipAmount, cashCurrencySuffix } from '../../utils/chipFormat';

const DESCRIPTION_LINES = 3;

interface PostCardProps {
  post: Post;
  currentUserId: string;
  currentUserName: string;
  /** Vrai si l'utilisateur connecté est l'auteur — seul cas où modifier/supprimer est proposé. */
  isOwnPost?: boolean;
  /** Vrai si l'auteur est le fondateur du groupe dans lequel ce post est affiché — même distinction
   * (👑) que dans la liste des membres du groupe, cf. GroupScreen. */
  isGroupFounder?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleLike?: () => void;
  onPressAuthor?: () => void;
  /** Ouvre les commentaires dès l'affichage — utilisé quand la carte est atteinte depuis une
   * notification de commentaire, où le commentaire EST ce qu'on vient lire. */
  initialCommentsOpen?: boolean;
  /** Ouvre la page du groupe depuis la pastille 👥. Absent (ex. sur la page du groupe lui-même) →
   * la pastille ne s'affiche de toute façon jamais là puisque `groupName` n'y est pas renseigné. */
  onOpenGroup?: (groupId: string) => void;
  /** Fourni → propose « Bloquer l'auteur » dans le menu ⋯ (feed principal). Le blocage est déjà
   * effectué en base quand ce callback est appelé ; le parent n'a plus qu'à retirer localement les
   * mains de cet auteur (la RLS les masque déjà côté serveur). Absent (page de profil) → pas d'option
   * de blocage ici, elle vit dans l'en-tête du profil. */
  onBlockAuthor?: (authorId: string) => void;
  /** Ouvre le profil d'un utilisateur par son id — utilisé pour les commentateurs (avatar/pseudo
   * cliquables dans la section commentaires). Le clic sur l'auteur DE LA MAIN passe, lui, par
   * `onPressAuthor` (sans argument). */
  onSelectProfile?: (profileId: string) => void;
}

// Tronque la description à 3 lignes avec "… voir plus" collé à la fin de la 3e ligne. Le nombre
// de lignes que prend le texte complet dépend de la largeur d'écran et de la police — jamais
// deviné : un exemplaire invisible du même texte, sans limite de lignes, mesure sa hauteur réelle
// (onLayout) et on la compare à la hauteur du texte tronqué à 3 lignes. `onTextLayout` n'est pas
// implémenté par react-native-web, donc inutilisable ici.
function ExpandableDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const fullHeight = useRef<number | null>(null);
  const clampedHeight = useRef<number | null>(null);

  const checkTruncation = () => {
    if (fullHeight.current != null && clampedHeight.current != null) {
      setTruncated(fullHeight.current > clampedHeight.current + 1);
    }
  };

  return (
    <View style={styles.descriptionWrapper}>
      <Text
        style={[typography.description, styles.description, styles.measure]}
        onLayout={(e) => {
          fullHeight.current = e.nativeEvent.layout.height;
          checkTruncation();
        }}
        pointerEvents="none"
      >
        {text}
      </Text>
      <Text
        style={[typography.description, styles.description]}
        numberOfLines={expanded ? undefined : DESCRIPTION_LINES}
        onLayout={(e) => {
          if (!expanded) {
            clampedHeight.current = e.nativeEvent.layout.height;
            checkTruncation();
          }
        }}
      >
        {text}
      </Text>
      {truncated && !expanded && (
        <Pressable style={styles.moreOverlay} onPress={() => setExpanded(true)} hitSlop={8}>
          <Text style={styles.moreLink}>… voir plus</Text>
        </Pressable>
      )}
      {expanded && (
        <Pressable onPress={() => setExpanded(false)} hitSlop={8}>
          <Text style={styles.moreLink}>voir moins</Text>
        </Pressable>
      )}
    </View>
  );
}

const VARIANT_LABEL: Record<string, string> = { nlhe: 'NLHE', plo: 'PLO', plo5: 'PLO5' };

function formatContextLine(post: Post): string {
  const { hand } = post;
  const parts: string[] = [];
  parts.push(hand.gameType === 'cash' ? 'Cash game' : 'Tournoi');
  // Variante en préfixe de la dénomination : donne "NLHE 2/5€", "PLO 2/5€" ou "PLO bomb pot 5€" en
  // un seul segment fluide, plutôt que des morceaux séparés par des points.
  const variantPrefix = VARIANT_LABEL[hand.variant] ? `${VARIANT_LABEL[hand.variant]} ` : '';
  if (hand.bombPot) {
    // Bomb pot : pas de blindes — le montant de l'ante (stocké comme `bb`, cf. finalize) suffit.
    parts.push(`${variantPrefix}bomb pot ${formatChipAmount(hand.blinds.bb, hand.gameType)}`);
  } else {
    // Un straddle (simple/double/triple) change le niveau de mise à suivre au-delà de la BB : la
    // dénomination doit le refléter ("5/10/25"), comme on écrirait "1/2/5" pour une table straddlée.
    const straddleAmounts = hand.actions
      .filter((a) => a.type === 'post-straddle')
      .sort((a, b) => a.order - b.order)
      .map((a) => a.amount ?? 0);
    const stakes = [hand.blinds.sb, hand.blinds.bb, ...straddleAmounts].join('/') + cashCurrencySuffix(hand.gameType);
    parts.push(`${variantPrefix}${stakes}`);
  }
  if (post.location) parts.push(post.location);
  if (post.buyIn) parts.push(post.buyIn);
  if (post.level) parts.push(post.level);
  return parts.join(' · ');
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildShareContent(post: Post): { title: string; message: string; url: string } {
  const url = `${POKZA_WEB_ORIGIN}/post/${post.id}`;
  return { title: post.title, message: `${post.title} — ${formatContextLine(post)}`, url };
}

/**
 * Enrobe la carte d'une barrière d'erreur : une main malformée (ou tout autre plantage de rendu)
 * n'affecte que SA carte — repli discret à sa place — au lieu de blanchir tout le feed.
 */
export function PostCard(props: PostCardProps) {
  return (
    <ErrorBoundary label={`PostCard ${props.post.id}`}>
      <PostCardInner {...props} />
    </ErrorBoundary>
  );
}

function PostCardInner({
  post,
  currentUserId,
  currentUserName,
  isOwnPost,
  isGroupFounder,
  onEdit,
  onDelete,
  onToggleLike,
  onPressAuthor,
  initialCommentsOpen,
  onOpenGroup,
  onBlockAuthor,
  onSelectProfile,
}: PostCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<View>(null);
  const [menuAnchor, setMenuAnchor] = useState<OverflowAnchor | null>(null);

  // On mesure la position du « ⋯ » à l'écran juste avant d'ouvrir, pour caler le petit panneau
  // pile en dessous (le composant n'est pas au même endroit selon le défilement).
  const openMenu = () => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };
  const [reportOpen, setReportOpen] = useState(false);
  const [showComments, setShowComments] = useState(Boolean(initialCommentsOpen));
  // `post` vient du parent et ne se remet à jour que si le feed est rechargé — le compteur affiché
  // ici doit réagir immédiatement quand `CommentsSection` ajoute/supprime un commentaire.
  const [commentCountDelta, setCommentCountDelta] = useState(0);
  const commentCount = post.commentCount + commentCountDelta;
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const voteOptions = post.voteOptions && post.voteOptions.length >= 2 ? post.voteOptions : ['Oui', 'Non'];

  const handleShare = async () => {
    const outcome = await shareOrCopy(buildShareContent(post));
    if (outcome === 'copied') setShareFeedback('Lien copié dans le presse-papiers !');
    else if (outcome === 'unavailable') setShareFeedback("Le partage n'est pas disponible ici.");
    if (outcome === 'copied' || outcome === 'unavailable') setTimeout(() => setShareFeedback(null), 2500);
  };

  const handleBlockAuthor = async () => {
    try {
      await blockUser(currentUserId, post.authorId);
      onBlockAuthor?.(post.authorId);
    } catch (err) {
      setShareFeedback(errorMessage(err));
      setTimeout(() => setShareFeedback(null), 2500);
    }
  };

  // Un seul bouton ⋯ pour toutes les mains ; son menu change selon qu'on en est l'auteur ou non.
  // Sur sa propre main : modifier / supprimer. Sur celle d'un autre : signaler (+ bloquer l'auteur
  // quand le parent le permet, càd le feed principal). « Supprimer » ouvre la confirmation en ligne
  // plutôt que d'agir directement, comme avant.
  const menuItems: OverflowMenuItem[] = isOwnPost
    ? [
        ...(onEdit ? [{ label: 'Modifier la main', icon: '✏️', onPress: onEdit }] : []),
        ...(onDelete
          ? [{ label: 'Supprimer la main', icon: '🗑', destructive: true, onPress: () => setConfirmingDelete(true) }]
          : []),
      ]
    : [
        { label: 'Signaler cette main', icon: '🚩', onPress: () => setReportOpen(true) },
        ...(onBlockAuthor
          ? [{ label: `Bloquer ${post.authorName}`, icon: '🚫', destructive: true, onPress: handleBlockAuthor }]
          : []),
      ];

  // Contenu modéré : la RLS ne le laisse passer qu'à son propre auteur → on lui montre un bandeau à
  // la place de la main (jamais de disparition silencieuse), et on masque tout le reste (replay,
  // vote, engagement). Pour tous les autres, cette carte n'existe simplement pas dans le feed.
  if (post.modStatus && post.modStatus !== 'visible') {
    const removed = post.modStatus === 'removed';
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <Pressable style={styles.authorPressable} onPress={onPressAuthor} disabled={!onPressAuthor}>
            <Avatar url={post.authorAvatarUrl} name={post.authorName} size={36} />
            <View style={styles.headerText}>
              <Text style={typography.authorName}>{post.authorName}</Text>
              <Text style={[typography.dateLocation, styles.muted]}>{formatDate(post.createdAt)}</Text>
            </View>
          </Pressable>
        </View>
        <View style={styles.moderationBanner}>
          <Text style={styles.moderationBannerTitle}>
            {removed ? '🚫 Retiré par la modération' : '🙈 Masqué par la modération'}
          </Text>
          <Text style={styles.moderationBannerText}>
            {removed
              ? "Cette main a été retirée car elle ne respecte pas nos règles. Toi seul vois encore ce bandeau — elle n'est plus visible par les autres joueurs."
              : "Cette main a été masquée par la modération. Elle n'est plus visible par les autres joueurs."}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Pressable style={styles.authorPressable} onPress={onPressAuthor} disabled={!onPressAuthor}>
          <Avatar url={post.authorAvatarUrl} name={post.authorName} size={36} />
          <View style={styles.headerText}>
            <Text style={typography.authorName}>
              {post.authorName}
              {isGroupFounder && ' 👑'}
            </Text>
            <Text style={[typography.dateLocation, styles.muted]}>
              {formatDate(post.createdAt)}
              {post.location ? ` · ${post.location}` : ''}
            </Text>
          </View>
        </Pressable>
        {post.visibility === 'private' && (
          <View style={styles.visibilityBadge}>
            <Text style={styles.visibilityBadgeText}>🔒 Privé</Text>
          </View>
        )}
        {post.visibility === 'group' && post.groupName && (
          <Pressable
            style={styles.visibilityBadge}
            onPress={() => post.groupId && onOpenGroup?.(post.groupId)}
            disabled={!onOpenGroup || !post.groupId}
            hitSlop={4}
          >
            <Text style={styles.visibilityBadgeText} numberOfLines={1}>
              👥 {post.groupName}
            </Text>
          </Pressable>
        )}
        {!confirmingDelete && menuItems.length > 0 && (
          <Pressable ref={menuButtonRef} style={styles.deleteButton} onPress={openMenu} hitSlop={8}>
            <Text style={styles.overflowIcon}>⋯</Text>
          </Pressable>
        )}
      </View>

      {isOwnPost && confirmingDelete && (
        <View style={styles.confirmDeleteRow}>
          <Text style={styles.confirmDeleteText}>Supprimer ce post ?</Text>
          <Pressable onPress={() => setConfirmingDelete(false)} hitSlop={8}>
            <Text style={styles.confirmDeleteCancel}>Non</Text>
          </Pressable>
          <Pressable onPress={onDelete} hitSlop={8}>
            <Text style={styles.confirmDeleteConfirm}>Oui, supprimer</Text>
          </Pressable>
        </View>
      )}

      <Text style={[typography.contextLine, styles.muted, styles.contextLine]}>{formatContextLine(post)}</Text>

      <Text style={[typography.postTitle, styles.title]}>{post.title}</Text>

      {post.description && <ExpandableDescription text={post.description} />}

      <View style={styles.replayerWrapper}>
        <HandReplayer hand={post.hand} />
      </View>

      {post.voteQuestion && (
        <VotePoll
          postId={post.id}
          currentUserId={currentUserId}
          question={post.voteQuestion}
          options={voteOptions}
          initialCounts={post.voteCounts}
          myVote={post.myVote}
        />
      )}

      <View style={styles.engagementRow}>
        <Pressable style={styles.engagementItem} onPress={onToggleLike}>
          <Text style={[styles.engagementIcon, post.likedByMe && styles.engagementIconActive]}>
            {post.likedByMe ? '♥' : '♡'}
          </Text>
          <Text style={[styles.engagementCount, post.likedByMe && styles.engagementCountActive]}>
            {post.likeCount}
          </Text>
        </Pressable>
        <Pressable style={styles.engagementItem} onPress={() => setShowComments(true)}>
          <Text style={styles.engagementIcon}>💬</Text>
          <Text style={styles.engagementCount}>{commentCount}</Text>
        </Pressable>
        <Pressable style={styles.engagementItem} onPress={handleShare}>
          <Text style={styles.engagementIcon}>↗</Text>
        </Pressable>
      </View>

      {shareFeedback && <Text style={styles.shareFeedback}>{shareFeedback}</Text>}

      <CommentsSection
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={post.id}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onCountChange={(delta) => setCommentCountDelta((d) => d + delta)}
        onSelectProfile={
          onSelectProfile &&
          ((profileId) => {
            // On ferme les commentaires avant d'ouvrir le profil (sinon la feuille resterait
            // au-dessus de la page profil).
            setShowComments(false);
            onSelectProfile(profileId);
          })
        }
      />

      <OverflowMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} anchor={menuAnchor} />
      <ReportModal
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        reporterId={currentUserId}
        targetType="post"
        targetId={post.id}
        targetLabel="cette main"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.feedBackground,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  authorPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  deleteButton: {
    padding: spacing.xs,
  },
  overflowIcon: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  visibilityBadge: {
    flexShrink: 0,
    maxWidth: 140,
    backgroundColor: colors.feedBackground,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  visibilityBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  confirmDeleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  confirmDeleteText: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  confirmDeleteCancel: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  confirmDeleteConfirm: {
    fontSize: 13,
    color: '#C0392B',
    fontWeight: '700',
  },
  muted: {
    color: colors.textSecondary,
  },
  contextLine: {
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  descriptionWrapper: {
    position: 'relative',
    marginBottom: spacing.sm,
  },
  description: {
    color: colors.textPrimary,
  },
  measure: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
  },
  moreOverlay: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    paddingLeft: 6,
    backgroundColor: colors.feedBackground,
  },
  moreLink: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.action,
  },
  replayerWrapper: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22,35,61,0.15)',
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  engagementIcon: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  engagementIconActive: {
    color: colors.action,
    transform: [{ scale: 1.1 }],
  },
  engagementCount: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  engagementCountActive: {
    color: colors.action,
    fontWeight: '700',
  },
  shareFeedback: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    paddingTop: spacing.xs,
  },
  moderationBanner: {
    backgroundColor: 'rgba(192,57,43,0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.25)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  moderationBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C0392B',
    marginBottom: 2,
  },
  moderationBannerText: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
