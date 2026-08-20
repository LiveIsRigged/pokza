import React, { useEffect, useState } from 'react';
import { errorMessage } from '../../utils/errorMessage';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Pressable } from '../ui/Pressable';
import { sheetGrabStyle, useSheetDismiss } from '../ui/useSheetDismiss';
import type { Comment } from '../../types/poker';
import { createComment, deleteComment, fetchComments, setCommentLiked } from '../../data/comments';
import { pickImage, type PickedImage } from '../../data/images';
import type { GifResult } from '../../data/gifs';
import { borders, colors, radius, spacing, tints } from '../../theme/theme';
import { GifPicker } from './GifPicker';
import { ReportModal } from '../moderation/ReportModal';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { Avatar } from '../ui/Avatar';
import { COMMENT_MAX_LENGTH } from '../../constants/limits';
import { CameraIcon, HeartIcon, TrashIcon } from '../ui/icons';

// Cœur d'un commentaire : plus petit que celui d'une main (24), mais assez grand pour être vu et
// visé. 18 + 2 × 9 = 36 pt de surface tactile — on ne peut pas monter aux 44 recommandés sans que
// les zones de « Répondre » et « Signaler » se chevauchent dans une liste aussi dense.
const COMMENT_LIKE_ICON_SIZE = 18;
const COMMENT_ACTION_PADDING_V = 9;
const COMMENT_ACTION_PADDING_H = 6;

interface CommentsSectionProps {
  visible: boolean;
  onClose: () => void;
  postId: string;
  currentUserId: string;
  currentUserName: string;
  /** Le compteur affiché dans la barre d'engagement vit dans `Post` (au niveau du parent) — cet
   * appel le tient synchronisé à chaque ajout/suppression fait ici, réponses incluses. */
  onCountChange?: (delta: number) => void;
  /** Ouvre le profil d'un commentateur (clic sur son avatar/pseudo), comme dans le feed. */
  onSelectProfile?: (profileId: string) => void;
}

interface CommentRowProps {
  comment: Comment;
  indented?: boolean;
  onReply?: () => void;
  onDelete: () => void;
  onToggleLike: () => void;
  onOpenMedia: (uri: string) => void;
  canDelete: boolean;
  /** Fourni uniquement pour les commentaires des AUTRES → affiche le lien « Signaler ». */
  onReport?: () => void;
  /** Ouvre le profil de l'auteur du commentaire (avatar/pseudo cliquables). */
  onSelectProfile?: (profileId: string) => void;
}

/**
 * Vignette compacte façon Instagram, pas une image pleine largeur : la pièce jointe reste une
 * illustration du commentaire, pas le contenu principal de l'écran. 200×200 est un plafond, pas
 * une taille imposée — `fitWithinBox` calcule la vraie taille d'affichage à l'intérieur de ce
 * plafond en respectant EXACTEMENT le ratio de l'image, donc la boîte finale correspond toujours
 * pile à ses proportions : jamais de recadrage, jamais de bande vide (une bande n'apparaît que
 * lorsque la boîte est plus grande que l'image qu'elle contient, ce qui n'arrive jamais ici).
 */
const MEDIA_MAX_WIDTH = 200;
const MEDIA_MAX_HEIGHT = 200;
/** Repli si les dimensions ne sont pas connues (anciens commentaires antérieurs à cet ajout). */
const FALLBACK_ASPECT_RATIO = 4 / 3;

function fitWithinBox(ratio: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  return { width, height };
}

function CommentMedia({
  uri,
  width,
  height,
  onPress,
}: {
  uri: string;
  width?: number;
  height?: number;
  onPress: () => void;
}) {
  const ratio = width && height ? width / height : FALLBACK_ASPECT_RATIO;
  const box = fitWithinBox(ratio, MEDIA_MAX_WIDTH, MEDIA_MAX_HEIGHT);
  return (
    <Pressable onPress={onPress}>
      <Image source={{ uri }} style={[styles.commentMedia, box]} resizeMode="cover" />
    </Pressable>
  );
}

/**
 * Vue plein écran ouverte au tap sur une vignette. `contain` sans plafond serré : ici une bande
 * autour de l'image est normale et attendue (fond sombre façon visionneuse), contrairement à la
 * vignette compacte où toute bande serait un défaut.
 */
function MediaViewer({ uri, onClose }: { uri: string; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewerBackdrop} onPress={onClose}>
        <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" />
        <Pressable style={styles.viewerClose} onPress={onClose} hitSlop={8}>
          <Text style={styles.viewerCloseText}>✕</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CommentRow({ comment, indented, onReply, onDelete, onToggleLike, onOpenMedia, canDelete, onReport, onSelectProfile }: CommentRowProps) {
  const mediaUri = comment.imageUrl ?? comment.gifUrl;
  const openProfile = onSelectProfile ? () => onSelectProfile(comment.authorId) : undefined;

  // Commentaire modéré : la RLS ne le laisse voir qu'à son auteur → bandeau à la place du contenu,
  // sans média, sans actions (like/répondre/supprimer). Invisible pour tous les autres.
  if (comment.modStatus && comment.modStatus !== 'visible') {
    return (
      <View style={[styles.commentRow, indented && styles.commentRowIndented]}>
        <Avatar url={comment.authorAvatarUrl} name={comment.authorName} size={28} />
        <View style={[styles.commentBubble, styles.commentModerated]}>
          <Text style={styles.commentAuthor}>{comment.authorName}</Text>
          <Text style={styles.commentModeratedText}>
            {comment.modStatus === 'removed'
              ? '🚫 Commentaire retiré par la modération'
              : '🙈 Commentaire masqué par la modération'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.commentRow, indented && styles.commentRowIndented]}>
      <Pressable onPress={openProfile} disabled={!openProfile}>
        <Avatar url={comment.authorAvatarUrl} name={comment.authorName} size={28} />
      </Pressable>
      <View style={styles.commentBubble}>
        <Pressable onPress={openProfile} disabled={!openProfile} hitSlop={4}>
          <Text style={styles.commentAuthor}>{comment.authorName}</Text>
        </Pressable>
        {mediaUri && (
          <CommentMedia
            uri={mediaUri}
            width={comment.mediaWidth}
            height={comment.mediaHeight}
            onPress={() => onOpenMedia(mediaUri)}
          />
        )}
        {comment.body.length > 0 && <Text style={styles.commentBody}>{comment.body}</Text>}
        <View style={styles.commentActionsRow}>
          <Pressable style={styles.commentLikeButton} onPress={onToggleLike}>
            <HeartIcon
              size={COMMENT_LIKE_ICON_SIZE}
              color={comment.likedByMe ? colors.action : colors.textSecondary}
              filled={comment.likedByMe}
            />
            {comment.likeCount > 0 && (
              <Text style={[styles.commentLikeCount, comment.likedByMe && styles.commentLikeActive]}>
                {comment.likeCount}
              </Text>
            )}
          </Pressable>
          {onReply && (
            <Pressable style={styles.commentAction} onPress={onReply}>
              <Text style={styles.replyLink}>Répondre</Text>
            </Pressable>
          )}
          {onReport && (
            <Pressable style={styles.commentAction} onPress={onReport}>
              <Text style={styles.reportLink}>Signaler</Text>
            </Pressable>
          )}
        </View>
      </View>
      {canDelete && (
        <Pressable onPress={onDelete} hitSlop={8}>
          <TrashIcon size={14} color={colors.textSecondary} />
        </Pressable>
      )}
    </View>
  );
}

export function CommentsSection({
  visible,
  onClose,
  postId,
  currentUserId,
  currentUserName,
  onCountChange,
  onSelectProfile,
}: CommentsSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Une seule profondeur de réponse : répondre à une réponse l'attache au même commentaire de
  // premier niveau plutôt que de créer un fil imbriqué à l'infini.
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  // Une seule pièce jointe à la fois, photo OU gif — en choisir une remplace l'autre, comme dans
  // la plupart des messageries.
  const [pickedImage, setPickedImage] = useState<PickedImage | null>(null);
  const [pickedGif, setPickedGif] = useState<GifResult | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [reportingComment, setReportingComment] = useState<Comment | null>(null);
  // Un seul commentaire (ou une réponse) à la fois peut être en attente de confirmation de
  // suppression — son id, ou `null` si aucune ligne n'est en train de demander confirmation.
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  // Fermeture en attrapant le bandeau du haut (poignée + titre + croix) et en tirant vers le bas,
  // façon bottom-sheet (logique partagée avec les autres feuilles, cf. `useSheetDismiss`).
  const { dragY, grabHandlers } = useSheetDismiss(visible, onClose);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    fetchComments(postId)
      .then((data) => {
        if (cancelled) return;
        setComments(data);
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
  }, [postId, visible]);

  // ⚠️ Une réponse dont le parent est ABSENT de la liste doit remonter au premier niveau, sinon
  // elle n'est affichée nulle part : `topLevelComments` l'écarte (elle a un parent) et
  // `repliesFor` ne la trouve jamais (personne ne demande les réponses d'un commentaire absent).
  // Le parent peut disparaître sans que la réponse disparaisse avec lui : un commentaire retiré par
  // la modération n'est plus renvoyé aux AUTRES lecteurs (seul son auteur continue de le voir), et
  // bloquer quelqu'un masque ses commentaires mais pas les réponses des autres en dessous. Une
  // suppression par l'auteur, elle, emporte bien ses réponses en cascade — ce cas-là n'est pas
  // concerné.
  // Le compteur de la main, lui, continue de compter ces réponses : le fil annonçait « 5
  // commentaires » et n'en montrait que 3, sans que rien n'explique où étaient passés les autres.
  // Avec ce repli, tout commentaire chargé est rendu EXACTEMENT une fois : soit son parent est
  // présent et il apparaît dessous, soit il ne l'est pas et il apparaît au premier niveau.
  // Chaque commentaire est rattaché à son ancêtre RACINE, en remontant la chaîne des parents.
  // L'invariant obtenu : tout commentaire chargé est rendu exactement une fois, soit comme racine,
  // soit sous la sienne (vérifié sur 5000 fils tirés au hasard, cf. le commit).
  //
  // Deux raisons, et la première est un vrai bug observé :
  // 1. Le parent peut MANQUER dans la liste alors que la réponse, elle, y est. Un commentaire retiré
  //    par la modération n'est plus renvoyé aux autres lecteurs (seul son auteur continue de le
  //    voir), et bloquer quelqu'un masque ses commentaires sans masquer les réponses des autres.
  //    L'ancien code écartait ces réponses de `topLevelComments` (elles ont un parent) sans jamais
  //    les retrouver via `repliesFor` (personne ne demande les réponses d'un absent) : elles
  //    n'étaient affichées NULLE PART, pendant que le compteur de la main continuait de les
  //    compter — « 5 commentaires » pour 3 affichés, sans explication.
  //    Une suppression par l'auteur, elle, emporte ses réponses en cascade : cas non concerné.
  // 2. Le fil n'a que deux niveaux (`handleSubmit` aplatit toute réponse à une réponse sur la
  //    racine), mais rien côté base ne l'impose. Remonter jusqu'à la racine range un éventuel
  //    troisième niveau sous la bonne racine au lieu de le perdre — ou, avec une règle plus naïve,
  //    de le rendre deux fois.
  const idsCharges = new Set(comments.map((c) => c.id));
  const parentParId = new Map(comments.map((c) => [c.id, c.parentCommentId]));
  const racineDe = (commentId: string) => {
    let courant = commentId;
    const vus = new Set([courant]);
    for (;;) {
      const parent = parentParId.get(courant);
      if (!parent || !idsCharges.has(parent)) return courant; // chaîne terminée, ou parent absent
      // Cycle : impossible en principe (le parent est fixé à la création et n'est jamais modifié),
      // mais une boucle infinie ici figerait l'app. Renvoyer le commentaire LUI-MÊME plutôt que le
      // dernier maillon parcouru : sinon deux commentaires en cycle se désignent mutuellement comme
      // racine, aucun des deux n'est sa propre racine, et tous deux disparaissent de l'affichage —
      // soit exactement le bug qu'on est en train de corriger.
      if (vus.has(parent)) return commentId;
      courant = parent;
      vus.add(courant);
    }
  };
  const racineParId = new Map(comments.map((c) => [c.id, racineDe(c.id)]));
  const topLevelComments = comments.filter((c) => racineParId.get(c.id) === c.id);
  const repliesFor = (commentId: string) =>
    comments.filter((c) => c.id !== commentId && racineParId.get(c.id) === commentId);

  const handlePickImage = async () => {
    try {
      const image = await pickImage();
      if (!image) return;
      setPickedImage(image);
      setPickedGif(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const handleSelectGif = (gif: GifResult) => {
    setPickedGif(gif);
    setPickedImage(null);
    setGifPickerOpen(false);
  };

  const canSubmit = (draft.trim().length > 0 || pickedImage || pickedGif) && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body = draft.trim();
    setSubmitting(true);
    try {
      const parentId = replyingTo ? (replyingTo.parentCommentId ?? replyingTo.id) : undefined;
      const comment = await createComment({
        postId,
        authorId: currentUserId,
        authorName: currentUserName,
        body,
        parentCommentId: parentId,
        image: pickedImage ?? undefined,
        gif: pickedGif ?? undefined,
      });
      setComments((c) => [...c, comment]);
      onCountChange?.(1);
      setDraft('');
      setPickedImage(null);
      setPickedGif(null);
      setReplyingTo(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const previous = comments;
    // Supprime aussi les réponses de ce commentaire côté affichage (cascade déjà gérée en base) —
    // le compteur doit refléter TOUT ce qui disparaît, pas juste la ligne cliquée.
    const removedCount = previous.filter((cm) => cm.id === commentId || cm.parentCommentId === commentId).length;
    setComments((c) => c.filter((cm) => cm.id !== commentId && cm.parentCommentId !== commentId));
    onCountChange?.(-removedCount);
    try {
      await deleteComment(commentId);
    } catch (err) {
      setComments(previous);
      onCountChange?.(removedCount);
      setError(errorMessage(err));
    }
  };

  const handleToggleLike = async (comment: Comment) => {
    const nextLiked = !comment.likedByMe;
    setComments((cs) =>
      cs.map((c) =>
        c.id === comment.id ? { ...c, likedByMe: nextLiked, likeCount: c.likeCount + (nextLiked ? 1 : -1) } : c
      )
    );
    try {
      await setCommentLiked(comment.id, currentUserId, nextLiked);
    } catch (err) {
      setComments((cs) =>
        cs.map((c) =>
          c.id === comment.id ? { ...c, likedByMe: !nextLiked, likeCount: c.likeCount + (nextLiked ? -1 : 1) } : c
        )
      );
      setError(errorMessage(err));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: dragY }] }]}>
          <View style={sheetGrabStyle} {...grabHandlers}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Commentaires</Text>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {loading && <ActivityIndicator color={colors.textSecondary} />}
            {error && <Text style={styles.error}>{error}</Text>}
            {!loading && comments.length === 0 && (
              <Text style={styles.empty}>Aucun commentaire pour l'instant.</Text>
            )}
            {topLevelComments.map((comment) => (
              <View key={comment.id}>
                <CommentRow
                  comment={comment}
                  onReply={() => setReplyingTo(comment)}
                  onDelete={() => setDeletingCommentId(comment.id)}
                  onToggleLike={() => handleToggleLike(comment)}
                  onOpenMedia={setViewerUri}
                  canDelete={comment.authorId === currentUserId}
                  onReport={comment.authorId !== currentUserId ? () => setReportingComment(comment) : undefined}
                  onSelectProfile={onSelectProfile}
                />
                {repliesFor(comment.id).map((reply) => (
                  <CommentRow
                    key={reply.id}
                    comment={reply}
                    indented
                    onDelete={() => setDeletingCommentId(reply.id)}
                    onToggleLike={() => handleToggleLike(reply)}
                    onOpenMedia={setViewerUri}
                    canDelete={reply.authorId === currentUserId}
                    onReport={reply.authorId !== currentUserId ? () => setReportingComment(reply) : undefined}
                    onSelectProfile={onSelectProfile}
                  />
                ))}
              </View>
            ))}
          </ScrollView>

          {replyingTo && (
            <View style={styles.replyingBanner}>
              <Text style={styles.replyingText}>Réponse à {replyingTo.authorName}</Text>
              <Pressable onPress={() => setReplyingTo(null)} hitSlop={8}>
                <Text style={styles.replyingCancel}>Annuler</Text>
              </Pressable>
            </View>
          )}

          {(pickedImage || pickedGif) && (
            <View style={styles.attachmentPreviewRow}>
              <Image
                source={{ uri: pickedImage?.uri ?? pickedGif?.previewUrl }}
                style={styles.attachmentPreview}
                resizeMode="cover"
              />
              <Pressable
                onPress={() => {
                  setPickedImage(null);
                  setPickedGif(null);
                }}
                hitSlop={8}
              >
                <Text style={styles.attachmentRemove}>Retirer</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.inputRow}>
            <Pressable onPress={handlePickImage} hitSlop={8}>
              <CameraIcon size={18} color={colors.textSecondary} />
            </Pressable>
            <Pressable onPress={() => setGifPickerOpen(true)} hitSlop={8}>
              <Text style={styles.attachButtonText}>GIF</Text>
            </Pressable>
            <TextInput
              style={styles.input}
              placeholder={replyingTo ? 'Écrire une réponse…' : 'Ajouter un commentaire…'}
              maxLength={COMMENT_MAX_LENGTH}
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={handleSubmit}
            />
            <Pressable
              style={[styles.sendButton, !canSubmit && styles.sendButtonDisabled]}
              onPress={handleSubmit}
              disabled={!canSubmit}
            >
              <Text style={styles.sendButtonText}>Envoyer</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>

      <GifPicker visible={gifPickerOpen} onClose={() => setGifPickerOpen(false)} onSelect={handleSelectGif} />
      {viewerUri && <MediaViewer uri={viewerUri} onClose={() => setViewerUri(null)} />}
      <ConfirmSheet
        visible={deletingCommentId != null}
        icon={TrashIcon}
        title="Supprimer ce commentaire ?"
        message="Cette action est définitive."
        confirmLabel="Supprimer"
        onCancel={() => setDeletingCommentId(null)}
        onConfirm={() => {
          const id = deletingCommentId;
          setDeletingCommentId(null);
          if (id) handleDelete(id);
        }}
      />
      <ReportModal
        visible={reportingComment != null}
        onClose={() => setReportingComment(null)}
        reporterId={currentUserId}
        targetType="comment"
        targetId={reportingComment?.id ?? ''}
        targetLabel="ce commentaire"
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    height: '85%',
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: tints.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  closeButton: {
    fontSize: 18,
    color: colors.textSecondary,
    padding: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.md,
  },
  error: {
    fontSize: 12,
    color: '#C0392B',
    marginBottom: spacing.xs,
  },
  empty: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  commentRowIndented: {
    marginLeft: spacing.lg,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: tints.faint,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  commentBody: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  commentModerated: {
    backgroundColor: 'rgba(192,57,43,0.06)',
  },
  commentModeratedText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#C0392B',
    marginTop: 2,
  },
  commentMedia: {
    borderRadius: radius.sm,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: tints.faint,
  },
  commentActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Écart visible = ce gap + les deux rembourrages horizontaux, soit les 16 pt d'avant.
    gap: spacing.xs,
    marginHorizontal: -COMMENT_ACTION_PADDING_H,
  },
  // Rembourrage réel plutôt que `hitSlop` : celui-ci n'existe que dans l'ancien `Touchable` de
  // react-native-web, pas dans `Pressable` — sur la PWA il n'agrandissait rien du tout, et le cœur
  // n'offrait au doigt que ses 14 × 14 pt de dessin.
  commentAction: {
    paddingVertical: COMMENT_ACTION_PADDING_V,
    paddingHorizontal: COMMENT_ACTION_PADDING_H,
  },
  commentLikeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: COMMENT_ACTION_PADDING_V,
    paddingHorizontal: COMMENT_ACTION_PADDING_H,
  },
  commentLikeIcon: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  commentLikeCount: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  commentLikeActive: {
    color: colors.action,
  },
  replyLink: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.action,
  },
  reportLink: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  commentDelete: {
    fontSize: 14,
    padding: 4,
  },
  replyingBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(232,87,31,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  replyingText: {
    fontSize: 12,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  replyingCancel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  attachmentPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  attachmentPreview: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: tints.faint,
  },
  attachmentRemove: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
  },
  attachButtonIcon: {
    fontSize: 18,
  },
  attachButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.textPrimary,
  },
  sendButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  viewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '90%',
    height: '80%',
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: spacing.md,
    padding: spacing.xs,
  },
  viewerCloseText: {
    fontSize: 22,
    color: '#fff',
    fontWeight: '700',
  },
});
