import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import type { Post } from '../../types/poker';
import { borders, colors, radius, spacing, typography } from '../../theme/theme';
import { Avatar } from '../ui/Avatar';
import { HandReplayer } from '../replayer/HandReplayer';
import { VotePoll } from './VotePoll';
import { CommentsSection } from './CommentsSection';
import { OverflowMenu, type OverflowMenuItem, type OverflowAnchor } from '../ui/OverflowMenu';
import { ConfirmSheet } from '../ui/ConfirmSheet';
import { LikersSheet } from './LikersSheet';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { ReportModal } from '../moderation/ReportModal';
import { blockUser } from '../../data/blocks';
import { errorMessage } from '../../utils/errorMessage';
import { shareOrCopy, POKZA_WEB_ORIGIN } from '../../utils/share';
import { abbreviateChips, formatChipAmount, cashCurrencySuffix } from '../../utils/chipFormat';
import { formatRelativeDate } from '../../utils/relativeDate';
import { wasEdited } from '../../utils/postEdited';
import { etapesCorrigibles } from '../../creator/rehydrate';
import type { Phase } from '../../creator/types';
import { friendEchoLabel } from '../../utils/friendEchoLabel';
import { BlockIcon, CommentIcon, CopyIcon, FlagIcon, GroupTableIcon, HeartIcon, PencilIcon, ShareIcon, SpadeIcon, TrashIcon } from '../ui/icons';

const DESCRIPTION_LINES = 3;
/** Taille commune des trois icônes sous une main (j'aime / commenter / partager) : elles
 *  forment un groupe, elles doivent peser pareil. */
// 24 pt : la taille des rangées d'engagement d'Instagram et de Strava. À 20, nos boutons étaient
// visiblement plus petits que les leurs alors qu'ils jouent le même rôle.
const ENGAGEMENT_ICON_SIZE = 24;
// Rembourrage vertical des boutons : 10 + 24 + 10 = 44 pt, le minimum tactile recommandé par Apple.
// Il tient lieu de hauteur de rangée — d'où le filet séparé, qui doit rester aligné sur la carte
// pendant que les boutons, eux, débordent de 8 pt à gauche pour que l'icône reste alignée au texte.
const ENGAGEMENT_TOUCH_PADDING = 10;

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
  /** Rouvre la main dans le créateur À L'ÉTAPE DEMANDÉE pour en refaire le déroulé, puis la
   * republie (cf. `mode` « correct » dans App.tsx). Distinct d'`onEdit`, qui ne touche qu'au texte
   * du post. L'étape est choisie dans la feuille de confirmation, avant d'entrer. */
  onCorrect?: (depuis: Phase) => void;
  /** Republie une COPIE de la main devant l'audience de son choix. C'est la sortie de secours du
   * verrou d'audience : une main publiée ne change plus de public, mais son auteur peut toujours
   * en refaire une neuve ailleurs. L'originale reste où elle est, avec ses commentaires. */
  onDuplicate?: () => void;
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

/**
 * Dénomination de la partie, telle qu'affichée sous l'en-tête.
 *
 * `withLocation` existe parce que cette même chaîne sert à DEUX endroits qui n'ont pas le même
 * contexte. Dans la carte, le lieu est déjà écrit à côté de la date, juste au-dessus : l'ajouter
 * ici l'affichait deux fois à trois pixels d'écart. Dans le message de partage, il n'y a pas
 * d'en-tête — le lieu doit y rester, sinon le destinataire perd l'info.
 */
function formatContextLine(post: Post, { withLocation = true }: { withLocation?: boolean } = {}): string {
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
    // Blindes de tournoi abrégées comme partout ailleurs ("15M/30M", pas "15000000/30000000") —
    // c'est déjà ce qu'affiche l'écran de création juste avant de publier. La devise se pose une
    // seule fois en fin de dénomination ("2/5€"), d'où le format à la main plutôt que
    // `formatChipAmount`, qui l'accolerait à chaque montant. Le cash game reste inchangé.
    const formatStake = (n: number) => (hand.gameType === 'tournament' ? abbreviateChips(n) : String(n));
    const stakes =
      [hand.blinds.sb, hand.blinds.bb, ...straddleAmounts].map(formatStake).join('/') +
      cashCurrencySuffix(hand.gameType);
    parts.push(`${variantPrefix}${stakes}`);
  }
  if (withLocation && post.location) parts.push(post.location);
  if (post.buyIn) parts.push(post.buyIn);
  if (post.level) parts.push(post.level);
  return parts.join(' · ');
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
  onCorrect,
  onDuplicate,
  onDelete,
  onToggleLike,
  onPressAuthor,
  initialCommentsOpen,
  onOpenGroup,
  onBlockAuthor,
  onSelectProfile,
}: PostCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingCorrect, setConfirmingCorrect] = useState(false);
  // Calculées à l'ouverture de la feuille, pas à chaque rendu de carte : redémonter la main pour
  // savoir quelles streets elle a jouées coûte trop cher pour un fil de dix cartes.
  const [etapes, setEtapes] = useState<{ phase: Phase; label: string }[]>([]);
  const [etapeChoisie, setEtapeChoisie] = useState<Phase>('review');
  const [confirmingBlock, setConfirmingBlock] = useState(false);
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
  const [likersOpen, setLikersOpen] = useState(false);
  const [showComments, setShowComments] = useState(Boolean(initialCommentsOpen));
  // `post` vient du parent et ne se remet à jour que si le feed est rechargé — le compteur affiché
  // ici doit réagir immédiatement quand `CommentsSection` ajoute/supprime un commentaire.
  const [commentCountDelta, setCommentCountDelta] = useState(0);
  const commentCount = post.commentCount + commentCountDelta;
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const voteOptions = post.voteOptions && post.voteOptions.length >= 2 ? post.voteOptions : ['Oui', 'Non'];

  // Corriger le déroulé REPUBLIE la main : la base ne laisse pas réécrire `hand` après coup (F-21),
  // et c'est voulu — sinon un auteur pourrait changer une mise sous les commentaires qui la
  // discutent.
  //
  // Le message est le MÊME que la main ait récolté quelque chose ou non. Une première version
  // comptait les pertes (« et 14 j'aime, 3 commentaires ne la suivent pas ») : elle disparaissait
  // donc au moment précis où l'on découvre la fonction, sur une main neuve — c'est-à-dire quand il
  // fallait justement apprendre la règle. Ici on énonce la mécanique, pas l'inventaire.
  // Ce que l'étape choisie va coûter en ressaisie. Reprendre une street efface celles qui suivent
  // — y compris la sienne, dont l'instantané précède ses propres actions. Une liste sans articles
  // (« flop, turn, rivière ») plutôt qu'une phrase : « le turn » et « la rivière » n'ont pas le
  // même genre, et la tournure qui les accorde tous devient illisible.
  const consequenceEtape = (() => {
    if (etapeChoisie === 'review') return "Le déroulé n'est pas touché.";
    const streets = etapes.filter((e) => e.phase !== 'review');
    const i = streets.findIndex((e) => e.phase === etapeChoisie);
    if (i < 0) return '';
    return `À ressaisir : ${streets.slice(i).map((e) => e.label.toLowerCase()).join(', ')}.`;
  })();
  const correctionWarning =
    "Corriger une main, c'est la republier : elle repart à zéro dans le fil. " +
    'Les anciens j\'aime, commentaires et votes seront perdus.';

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
  // Sur sa propre main : modifier / corriger / supprimer. Sur celle d'un autre : signaler
  // (+ bloquer l'auteur quand le parent le permet, càd le feed principal). « Supprimer » ouvre la
  // confirmation en ligne plutôt que d'agir directement, comme avant.
  //
  // « Modifier le post » et « Corriger la main » ne font pas la même chose et le disent : le
  // premier ne touche qu'au texte (titre, description, contexte), le second refait le déroulé et
  // republie. L'ancien libellé « Modifier la main » promettait le second en ne faisant que le
  // premier. « Dupliquer la main » complète la série : même déroulé, autre public, main neuve.
  //
  // Dupliquer n'a PAS de feuille de confirmation, contrairement à corriger et supprimer : il
  // n'y a rien à perdre — l'originale ne bouge pas et le geste s'arrête sur un formulaire, qu'on
  // peut quitter sans rien publier. Ce que la copie n'emporte pas se dit dans ce formulaire.
  const menuItems: OverflowMenuItem[] = isOwnPost
    ? [
        ...(onEdit ? [{ label: 'Modifier le post', icon: PencilIcon, onPress: onEdit }] : []),
        ...(onCorrect
          ? [{
              label: 'Corriger la main',
              icon: SpadeIcon,
              onPress: () => {
                const liste = etapesCorrigibles(post);
                setEtapes(liste);
                // Présélection sur la DERNIÈRE street jouée : c'est celle qui préserve le plus de
                // saisie, puisque reprendre une étape efface toutes les suivantes. Se tromper vers
                // l'aval se rattrape avec « ‹ » ; se tromper vers l'amont fait retaper la main.
                const streets = liste.filter((e) => e.phase !== 'review');
                setEtapeChoisie((streets[streets.length - 1] ?? liste[0]).phase);
                setConfirmingCorrect(true);
              },
            }]
          : []),
        ...(onDuplicate ? [{ label: 'Dupliquer la main', icon: CopyIcon, onPress: onDuplicate }] : []),
        ...(onDelete
          ? [{ label: 'Supprimer la main', icon: TrashIcon, destructive: true, onPress: () => setConfirmingDelete(true) }]
          : []),
      ]
    : [
        { label: 'Signaler cette main', icon: FlagIcon, onPress: () => setReportOpen(true) },
        ...(onBlockAuthor
          ? [
              {
                label: `Bloquer ${post.authorName}`,
                icon: BlockIcon,
                destructive: true,
                onPress: () => setConfirmingBlock(true),
              },
            ]
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
          <View style={styles.authorSlot}>
            <Pressable style={styles.authorPressable} onPress={onPressAuthor} disabled={!onPressAuthor}>
              <Avatar url={post.authorAvatarUrl} name={post.authorName} size={36} />
              <View style={styles.headerText}>
                <Text style={typography.authorName}>{post.authorName}</Text>
                <Text style={[typography.dateLocation, styles.muted]}>{formatRelativeDate(post.createdAt)}</Text>
              </View>
            </Pressable>
          </View>
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
      {/* Au-dessus de l'auteur, comme partout ailleurs : la ligne répond à « pourquoi cette main
          d'inconnu est-elle dans mon fil ? », elle doit donc se lire AVANT la main elle-même.
          Non cliquable à dessein — le compteur de likes ouvre déjà la liste de ceux qui ont aimé,
          deux chemins vers la même feuille ne feraient qu'embrouiller. */}
      {post.friendEcho && (
        <View style={styles.friendEcho}>
          {post.friendEcho.kind === 'comment' ? (
            <CommentIcon size={12} color={colors.textSecondary} />
          ) : (
            <HeartIcon size={12} color={colors.textSecondary} filled />
          )}
          <Text style={[typography.dateLocation, styles.muted]} numberOfLines={1}>
            {friendEchoLabel(post.friendEcho)}
          </Text>
        </View>
      )}
      <View style={styles.header}>
        {/* Le créneau prend toute la largeur restante — c'est lui qui pousse le badge et le "⋯" à
            droite — mais la zone TOUCHABLE, elle, s'arrête au bout du texte (cf. `authorPressable`). */}
        <View style={styles.authorSlot}>
          <Pressable style={styles.authorPressable} onPress={onPressAuthor} disabled={!onPressAuthor}>
            <Avatar url={post.authorAvatarUrl} name={post.authorName} size={36} />
            <View style={styles.headerText}>
              <Text style={typography.authorName}>
                {post.authorName}
                {isGroupFounder && ' 👑'}
              </Text>
              {/* « modifié » se glisse dans la ligne qui existe déjà : aucune hauteur ajoutée à une
                  carte qui en manque, et la mention reste plus discrète que « Julien a aimé cette
                  main » (qui, elle, occupe sa propre ligne). Collée au temps, qu'elle qualifie —
                  le lieu ne se modifie pas moins que le reste, mais il ne se date pas. */}
              <Text style={[typography.dateLocation, styles.muted]}>
                {formatRelativeDate(post.createdAt)}
                {wasEdited(post) ? ' · modifié' : ''}
                {post.location ? ` · ${post.location}` : ''}
              </Text>
            </View>
          </Pressable>
        </View>
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
            <GroupTableIcon size={13} color={colors.textSecondary} />
            <Text style={styles.visibilityBadgeText} numberOfLines={1}>
              {post.groupName}
            </Text>
          </Pressable>
        )}
        {menuItems.length > 0 && (
          <Pressable ref={menuButtonRef} style={styles.deleteButton} onPress={openMenu} hitSlop={8}>
            <Text style={styles.overflowIcon}>⋯</Text>
          </Pressable>
        )}
      </View>

      <Text style={[typography.contextLine, styles.muted, styles.contextLine]}>
        {formatContextLine(post, { withLocation: false })}
      </Text>

      {/*
        UNE seule ligne, toujours. La hauteur de ce bloc devient ainsi constante PAR CONSTRUCTION
        (même remède que le slot de `ActionCallout`), quoi que l'auteur ait tapé : aucun titre ne
        peut plus faire varier la hauteur de la carte dans le feed.
        La limite de saisie (`TITLE_MAX_LENGTH`, 40) ne suffit PAS à le garantir — la largeur d'un
        caractère varie d'un facteur 3,6 dans la police système (mesuré : « i » 5,4 px, « % »
        19,4 px à 19 px gras). 40 caractères larges dépasseraient largement les 343 px utiles du
        plus étroit des écrans visés. Les deux se complètent : la limite rend la troncature rare,
        `numberOfLines` la rend sans conséquence sur la mise en page.
      */}
      <Text style={[typography.postTitle, styles.title]} numberOfLines={1}>
        {post.title}
      </Text>

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
          isAuthor={isOwnPost}
          onSelectProfile={onSelectProfile}
        />
      )}

      <View style={styles.engagementDivider} />
      <View style={styles.engagementRow}>
        {/* Le cœur reste le bouton « j'aime » ; le CHIFFRE, lui, ouvre la liste de ceux qui ont
            aimé — le geste qu'on a partout ailleurs. Les deux zones de touche se partagent les
            6 pt qui les séparent sans se recouvrir, et l'ensemble occupe exactement la place de
            l'ancien bouton unique (8 + icône + 6 + chiffre + 8). */}
        <View style={styles.likeGroup}>
          <Pressable style={styles.likeHeart} onPress={onToggleLike}>
            <HeartIcon
              size={ENGAGEMENT_ICON_SIZE}
              color={post.likedByMe ? colors.action : colors.textSecondary}
              filled={post.likedByMe}
            />
          </Pressable>
          <Pressable
            style={styles.likeCountButton}
            onPress={() => setLikersOpen(true)}
            disabled={post.likeCount === 0}
          >
            <Text style={[styles.engagementCount, post.likedByMe && styles.engagementCountActive]}>
              {post.likeCount}
            </Text>
          </Pressable>
        </View>
        <Pressable style={styles.engagementItem} onPress={() => setShowComments(true)}>
          <CommentIcon size={ENGAGEMENT_ICON_SIZE} color={colors.textSecondary} />
          <Text style={styles.engagementCount}>{commentCount}</Text>
        </Pressable>
        <Pressable style={styles.engagementItem} onPress={handleShare}>
          <ShareIcon size={ENGAGEMENT_ICON_SIZE} color={colors.textSecondary} />
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

      <LikersSheet
        visible={likersOpen}
        onClose={() => setLikersOpen(false)}
        source={{ kind: 'post', id: post.id }}
        onSelectProfile={
          onSelectProfile &&
          ((profileId) => {
            setLikersOpen(false);
            onSelectProfile(profileId);
          })
        }
      />

      <OverflowMenu visible={menuOpen} onClose={() => setMenuOpen(false)} items={menuItems} anchor={menuAnchor} />
      {isOwnPost && onCorrect && (
        <ConfirmSheet
          visible={confirmingCorrect}
          icon={SpadeIcon}
          title="Corriger cette main ?"
          message={correctionWarning}
          confirmLabel="Corriger"
          onCancel={() => setConfirmingCorrect(false)}
          onConfirm={() => {
            setConfirmingCorrect(false);
            onCorrect(etapeChoisie);
          }}
        >
          <View style={styles.etapesRow}>
            {etapes.map((e) => {
              const active = e.phase === etapeChoisie;
              return (
                <Pressable
                  key={e.phase}
                  style={[styles.etapeChip, active && styles.etapeChipActive]}
                  onPress={() => setEtapeChoisie(e.phase)}
                >
                  <Text style={[styles.etapeChipText, active && styles.etapeChipTextActive]}>{e.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {!!consequenceEtape && <Text style={styles.etapeConsequence}>{consequenceEtape}</Text>}
        </ConfirmSheet>
      )}
      {isOwnPost && (
        <ConfirmSheet
          visible={confirmingDelete}
          icon={TrashIcon}
          title="Supprimer cette main ?"
          message="Cette action est définitive."
          confirmLabel="Supprimer"
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete?.();
          }}
        />
      )}
      {onBlockAuthor && (
        <ConfirmSheet
          visible={confirmingBlock}
          icon={BlockIcon}
          title={`Bloquer ${post.authorName} ?`}
          message="Tu ne verras plus ses mains, et il ne pourra plus t'envoyer de demande d'ami."
          confirmLabel="Bloquer"
          onCancel={() => setConfirmingBlock(false)}
          onConfirm={() => {
            setConfirmingBlock(false);
            handleBlockAuthor();
          }}
        />
      )}
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

// Passe de densite A (2026-08-18) — on ne rogne QUE des espaces blancs, aucun element n'est
// reduit : ni la table, ni les cartes, ni les tailles de texte, ni les cibles tactiles. Les
// valeurs d'origine etaient toutes des jetons `spacing` par defaut, jamais choisies pour cette
// carte en particulier. Reversible d'un seul `git revert` (commit isole).
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.feedBackground,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    // Pas de rembourrage bas : les 10 pt sous les icônes d'engagement en tiennent lieu.
    paddingBottom: 0,
  },
  // `flexShrink` sur rien ici : le texte est en `numberOfLines={1}`, un pseudo à rallonge se
  // termine donc en « … » au lieu de pousser la ligne sur deux hauteurs.
  friendEcho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  // Espace réservé à l'auteur dans la ligne d'en-tête : il occupe toute la largeur laissée libre
  // par le badge de visibilité et le "⋯", qu'il maintient collés à droite.
  authorSlot: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  // ⚠️ PAS de `flex: 1` ici, contrairement au créneau qui l'entoure. La zone touchable qui ouvre le
  // profil doit s'arrêter au bout du pseudo et de la ligne date/lieu : étirée sur toute la largeur,
  // elle transformait le vide à droite du pseudo en bouton "voir le profil", et venait border le
  // "⋯" au point de lui voler des appuis. `flexShrink` (sans `flexGrow`) laisse le bloc à la taille
  // de son contenu, tout en le laissant se comprimer quand le pseudo est long.
  authorPressable: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerText: {
    flexShrink: 1,
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
  etapesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  etapeChip: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  etapeChipActive: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  etapeChipText: {
    ...typography.dateLocation,
    color: colors.textSecondary,
  },
  etapeChipTextActive: {
    color: '#fff',
  },
  etapeConsequence: {
    ...typography.dateLocation,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  visibilityBadge: {
    flexShrink: 0,
    maxWidth: 140,
    backgroundColor: colors.feedBackground,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  visibilityBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  muted: {
    color: colors.textSecondary,
  },
  contextLine: {
    marginBottom: 2,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: 6,
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
    marginBottom: 10,
  },
  // Le filet est porté par une vue à part : la rangée, elle, déborde latéralement pour offrir une
  // vraie surface au doigt, et un filet qui déborderait avec elle ne serait plus aligné sur la carte.
  engagementDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    // Écart visible = ce gap + les deux rembourrages horizontaux, soit 32 pt. Les 24 pt d'origine
    // avaient été choisis pour des icônes de 20 : à 24, ils resserraient le trio d'autant. Un doigt
    // qui vise Commenter et touche J'aime envoie un « j'aime » à quelqu'un, d'où la marge.
    gap: spacing.md,
    marginHorizontal: -spacing.sm,
  },
  engagementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: ENGAGEMENT_TOUCH_PADDING,
    paddingHorizontal: spacing.sm,
  },
  // Le « j'aime » est le seul des trois à porter deux actions distinctes. Les rembourrages
  // ci-dessous redécoupent ceux d'`engagementItem` : 8 pt à l'extérieur comme les autres boutons,
  // et la moitié des 6 pt intérieurs pour chacun, de sorte que la frontière tombe pile au milieu
  // de l'espace entre le cœur et le chiffre.
  likeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  likeHeart: {
    paddingVertical: ENGAGEMENT_TOUCH_PADDING,
    paddingLeft: spacing.sm,
    paddingRight: 3,
  },
  likeCountButton: {
    paddingVertical: ENGAGEMENT_TOUCH_PADDING,
    paddingLeft: 3,
    paddingRight: spacing.sm,
  },
  engagementCount: {
    fontSize: 14,
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
    paddingBottom: spacing.sm,
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
