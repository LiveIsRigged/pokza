import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './src/utils/errorMessage';
import { StatusBar } from 'expo-status-bar';
// Import par graisse, et non depuis la racine de `@expo-google-fonts/fraunces` : son index.js fait
// un `require()` des 18 graisses au niveau module, que Metro ne peut pas élaguer — importer quoi que
// ce soit depuis la racine embarquait donc 1,4 Mo de polices dont 1,2 Mo jamais utilisées.
import { useFonts } from 'expo-font';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import { ActivityIndicator, Animated, AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { installPwaMeta } from './src/web/installPwaMeta';
import { InstallPromptProvider } from './src/web/InstallPrompt';
import { registerPushServiceWorker } from './src/web/push';
import { PostCard } from './src/components/post/PostCard';
import { LiveHandCreator } from './src/creator/LiveHandCreator';
import { postToSeed } from './src/creator/rehydrate';
import type { Phase } from './src/creator/types';
import { createPost, deletePost, fetchFeed, fetchPost, FEED_PAGE_SIZE, setLiked, updatePost } from './src/data/posts';
import { colors } from './src/theme/theme';
import type { Post } from './src/types/poker';
import { DisplayUnitProvider } from './src/state/displayUnit';
import { AuthProvider, useAuth } from './src/state/auth';
import { useProfileStatus } from './src/state/profile';
import { AuthScreen } from './src/auth/AuthScreen';
import { PublicPostScreen } from './src/post/PublicPostScreen';
import { NewPasswordScreen } from './src/auth/NewPasswordScreen';
import { CompleteProfileScreen } from './src/profile/CompleteProfileScreen';
import { ProfileScreen } from './src/profile/ProfileScreen';
import { SearchScreen } from './src/search/SearchScreen';
import { NotificationsScreen } from './src/notifications/NotificationsScreen';
import { EditPostScreen, type EditPostScreenHandle } from './src/post/EditPostScreen';
import { PostScreen } from './src/post/PostScreen';
import { supabase } from './src/lib/supabase';
import { fetchUnreadNotificationCount } from './src/data/notifications';
import { SideMenu, useMenuEdgeSwipe } from './src/components/ui/SideMenu';
import {
  AuditIcon,
  ChartIcon,
  FriendsIcon,
  GearIcon,
  GroupTableIcon,
  MailIcon,
  ShieldIcon,
} from './src/components/ui/icons';

/** Intitulé de la section réservée au fondateur dans le menu latéral. */
const ADMIN_SECTION = 'Administration';
import { Screen } from './src/components/ui/Screen';
import { PullToRefresh } from './src/components/ui/PullToRefresh';
import { FeedHeader } from './src/components/ui/FeedHeader';
import { ScrollToTopButton } from './src/components/ui/ScrollToTopButton';
import { ConnectionErrorScreen } from './src/components/ui/ConnectionErrorScreen';
import { GroupsListScreen } from './src/groups/GroupsListScreen';
import { GroupScreen, type GroupScreenHandle } from './src/groups/GroupScreen';
import { createGroup, fetchMyGroups, fetchPendingGroupInvites, inviteToGroup, type Group } from './src/data/groups';
import { fetchPendingRequests } from './src/data/friends';
import { AddFriendsScreen } from './src/friends/AddFriendsScreen';
import { FriendsListScreen } from './src/friends/FriendsListScreen';
import { InvitationsScreen } from './src/invitations/InvitationsScreen';
import { StatsScreen } from './src/stats/StatsScreen';
import { BlockedListScreen } from './src/profile/BlockedListScreen';
import { SettingsScreen, type SettingsScreenHandle } from './src/settings/SettingsScreen';
import { AdminReportsScreen } from './src/admin/AdminReportsScreen';
import { AdminReportDetailScreen } from './src/admin/AdminReportDetailScreen';
import { AdminUserScreen } from './src/admin/AdminUserScreen';
import { AdminAuditScreen } from './src/admin/AdminAuditScreen';
import { clearDeepLinkFromUrl, readInitialDeepLink } from './src/navigation/deepLink';
import { initAnalytics, resetAnalytics, trackEvent } from './src/analytics';

export default function App() {
  // `SafeAreaProvider` mesure les zones sûres (encoche / Dynamic Island / barre système) et les
  // expose via `useSafeAreaInsets`. `initialMetrics` fournit ces valeurs dès le premier rendu natif,
  // sans le petit saut de mise en page qu'on aurait sinon le temps de la première mesure.
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <DisplayUnitProvider>
        <AuthProvider>
          <RootChrome>
            <AppContent />
          </RootChrome>
        </AuthProvider>
      </DisplayUnitProvider>
    </SafeAreaProvider>
  );
}

/**
 * Habillage racine commun à tous les écrans : sert surtout à monter le bandeau d'installation
 * (`InstallPrompt`) par-dessus n'importe quel écran (web only). La barre d'état reste la bande
 * système classique (bande blanche, heure noire) pour la bêta — le dégagement du haut est géré par
 * chaque écran (feed via `insets`, écrans empilés via leur propre padding).
 */
function RootChrome({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.rootChrome}>
      <InstallPromptProvider>{children}</InstallPromptProvider>
    </View>
  );
}

function AppContent() {
  const [fontsLoaded] = useFonts({ Fraunces_400Regular, Fraunces_600SemiBold });
  const { session, loading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const {
    hasProfile,
    displayName,
    avatarUrl: myAvatarUrl,
    formatFavori: myFormatFavori,
    varianteFavorite: myVarianteFavorite,
    isAdmin,
    loading: profileLoading,
    error: profileError,
    refetch: refetchProfile,
  } = useProfileStatus(session?.user.id);

  // Délai de grâce avant d'avouer l'échec. `useProfileStatus` réessaie déjà tout seul et un
  // incident passager (jeton en cours de rafraîchissement) se règle en quelques centaines de
  // millisecondes : afficher l'erreur tout de suite ferait clignoter l'écran à chaque hoquet.
  // Au-delà, c'est une vraie coupure et un écran blanc muet serait pire que le message.
  const [profileErrorVisible, setProfileErrorVisible] = useState(false);
  // Dépendance sur la PRÉSENCE d'une erreur, pas sur son texte : sinon un message qui changerait
  // d'une tentative à l'autre relancerait le délai sans fin, et l'écran ne s'afficherait jamais.
  const profileHasError = Boolean(profileError);
  useEffect(() => {
    if (!profileHasError) {
      setProfileErrorVisible(false);
      return;
    }
    const timer = setTimeout(() => setProfileErrorVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [profileHasError]);
  const [mode, setMode] = useState<
    | 'feed'
    | 'create'
    | 'edit'
    | 'correct'
    | 'duplicate'
    | 'profile'
    | 'groups'
    | 'group'
    | 'inviteToGroup'
    | 'post'
    | 'addFriends'
    | 'myFriends'
    | 'invitations'
    | 'stats'
    | 'blocked'
    | 'settings'
    | 'adminReports'
    | 'adminReportDetail'
    | 'adminUser'
    | 'adminAudit'
  >('feed');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  // Où revenir une fois l'édition terminée : le feed, le profil, la page du groupe ou la page de la
  // main d'où l'édition a été ouverte.
  const [editReturnMode, setEditReturnMode] = useState<'feed' | 'profile' | 'group' | 'post'>('feed');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [viewingPostId, setViewingPostId] = useState<string | null>(null);
  const [viewingPostComments, setViewingPostComments] = useState(false);
  const [editingPostFallback, setEditingPostFallback] = useState<Post | null>(null);
  // « Corriger la main » : on garde le POST ENTIER et pas son id. Le créateur a besoin de `hand`,
  // et la main peut très bien ne pas être dans `posts` (ouverte depuis un profil ou un groupe) —
  // d'où la relecture en base quand elle manque, plutôt qu'un bouton qui ne fait rien.
  const [correctingPost, setCorrectingPost] = useState<Post | null>(null);
  const [correctReturnMode, setCorrectReturnMode] = useState<'feed' | 'profile' | 'group' | 'post'>('feed');
  // L'étape désignée dans la feuille de confirmation, avant même d'ouvrir le créateur.
  const [correctFromPhase, setCorrectFromPhase] = useState<Phase | undefined>(undefined);
  // « Dupliquer la main » : même besoin que la correction — le POST ENTIER, parce que la copie
  // republie `hand`, et une relecture en base quand la main n'est pas dans `posts`.
  const [duplicatingPost, setDuplicatingPost] = useState<Post | null>(null);
  const [duplicateReturnMode, setDuplicateReturnMode] = useState<'feed' | 'profile' | 'group' | 'post'>('feed');
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  // Permet au glissement de bord (`Screen`) de refermer d'abord un panneau local de `GroupScreen`
  // (Modifier le groupe / Liste de membres / Exclure un membre) au lieu de sauter directement à
  // « Mes groupes privés » — cf. `GroupScreenHandle`.
  const groupScreenRef = useRef<GroupScreenHandle>(null);
  const settingsScreenRef = useRef<SettingsScreenHandle>(null);
  // Même relais que `groupScreenRef` : le sélecteur de groupe ouvert par-dessus la modification
  // d'une main est un overlay local, invisible du glissement de bord attaché ici.
  const editPostScreenRef = useRef<EditPostScreenHandle>(null);
  // Groupes créés depuis l'étape « Publier » du créateur (cf. `onCreateGroup`). Ils n'ont qu'un
  // membre : leur auteur. Publier dedans revient à publier devant personne tant qu'il n'a invité
  // personne — d'où l'atterrissage sur la page du groupe plutôt que sur le feed, juste après.
  // Une `ref` et non un état : ça ne change rien à l'affichage, seulement la destination du retour.
  const groupsCreatedInCreator = useRef<Set<string>>(new Set());
  const [showPublishedNotice, setShowPublishedNotice] = useState(false);
  const [invitingGroupId, setInvitingGroupId] = useState<string | null>(null);
  // Back-office admin : signalement/compte en cours d'examen, + clé pour rafraîchir la file au retour.
  const [adminReportId, setAdminReportId] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [adminReportsReloadKey, setAdminReportsReloadKey] = useState(0);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Verrou synchrone du chargement automatique (cf. `handleFeedScroll`).
  const loadingMoreRef = useRef(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  // Notifications et Recherche s'ouvrent en bottom-sheet PAR-DESSUS le feed (le feed reste monté
  // derrière), pas en page plein écran : d'où de simples booléens plutôt qu'un `mode`.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Le menu s'ouvre en glissant du bord gauche vers le centre (plus de bouton dans la barre du
  // haut) ; désactivé pendant qu'il est ouvert, où c'est le geste inverse qui a la main.
  const menuEdgeSwipe = useMenuEdgeSwipe(() => setMenuOpen(true), !menuOpen);
  const [myGroups, setMyGroups] = useState<Group[]>([]);

  // Barre d'actions fixe : 0 = déployée (haut du feed), 1 = compacte (feed défilé). On n'anime que
  // lorsqu'on franchit le petit seuil, pas à chaque événement de scroll.
  const headerCompact = useRef(new Animated.Value(0)).current;
  const headerIsCompact = useRef(false);
  // Bouton « remonter en haut » : la ref sert à sauter au sommet, le booléen à l'afficher. Le miroir
  // en ref évite un `setState` à chaque événement de scroll (16 ms), comme pour la barre.
  const feedScrollRef = useRef<ScrollView>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollTopIsShown = useRef(false);
  // Distance au bas du feed à partir de laquelle la page suivante part toute seule. Une carte de
  // main fait environ 940 px de haut : à 800 px, le chargement démarre quand il reste moins d'une
  // main à faire défiler — assez tôt pour que la suite soit là avant qu'on l'atteigne.
  const FEED_LOAD_MORE_THRESHOLD = 800;
  // Défilement, en écrans, au-delà duquel le bouton « remonter en haut » apparaît. Valeur décidée
  // avec Victor le 20/08 : elle était d'abord à 1,5 écran, soit à peine deux mains — remonter n'a
  // aucun intérêt à ce moment-là, un coup de pouce suffit. Trois fois plus loin, on est à environ
  // 3 200 px sur un iPhone, soit trois à quatre mains : là, le retour en haut est un vrai trajet.
  const SCROLL_TOP_SCREENS = 4.5;

  const handleFeedScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;

    // Le bas du feed approche : on charge sans attendre un tap. `loadingMoreRef` plutôt que l'état
    // `loadingMore` — l'état ne devient vrai qu'au rendu suivant, et un défilement continu émet
    // plusieurs événements d'ici là, donc plusieurs requêtes pour la même page.
    const distanceToBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    if (
      distanceToBottom < FEED_LOAD_MORE_THRESHOLD &&
      hasMorePosts &&
      !loadingMoreRef.current &&
      !postsLoading &&
      posts.length > 0
    ) {
      void handleLoadMore();
    }

    // Le bouton « remonter en haut » n'apparaît qu'une fois qu'il y a vraiment de quoi remonter.
    // En écrans et non en pixels : le trajet à refaire au pouce se compte en écrans, et un petit
    // téléphone doit voir le bouton au même moment du parcours qu'un grand.
    const showTop = contentOffset.y > layoutMeasurement.height * SCROLL_TOP_SCREENS;
    if (showTop !== scrollTopIsShown.current) {
      scrollTopIsShown.current = showTop;
      setShowScrollTop(showTop);
    }

    const compact = contentOffset.y > 8;
    if (compact === headerIsCompact.current) return;
    headerIsCompact.current = compact;
    Animated.timing(headerCompact, { toValue: compact ? 1 : 0, duration: 150, useNativeDriver: false }).start();
  };

  // Saut SEC et non défilement animé : sur un feed infini de plusieurs milliers de pixels, le
  // défilement « doux » de Safari met plusieurs secondes et donne l'impression que l'app rame.
  //
  // On remonte D'ABORD, on rafraîchit ENSUITE : le spinner s'ouvre en haut du feed, là où le regard
  // vient d'arriver. Le rafraîchissement ne jette pas les pages déjà déroulées (cf. `refreshFeed`),
  // il ne fait qu'ajouter les mains parues depuis — redescendre reste possible sans tout recharger.
  const handleScrollToTop = () => {
    feedScrollRef.current?.scrollTo({ y: 0, animated: false });
    if (refreshing) return; // un tirer-pour-rafraîchir est déjà en cours : pas de seconde requête
    void handlePullToRefresh();
  };

  // Analytics : init une fois (dormant tant qu'aucune clé PostHog), puis on lie/délie l'identité au
  // fil de la session (identify à la connexion, reset à la déconnexion — volet client du §9.5).
  useEffect(() => {
    initAnalytics();
  }, []);

  // Balises PWA (manifest, icône d'accueil, nom, plein écran) — web uniquement, no-op sur mobile.
  useEffect(() => {
    installPwaMeta();
    // Service worker Web Push : enregistré au démarrage pour pouvoir recevoir les notifs (l'abonnement
    // lui-même reste déclenché par le bouton « Activer les notifications »).
    registerPushServiceWorker();
  }, []);
  // La mesure d'audience n'identifie PLUS l'utilisateur. On envoyait auparavant
  // `identifyUser(session.user.id)` — l'identifiant Supabase du compte, donc la clé primaire de
  // `profiles`. Chaque évènement portait ainsi de quoi le rattacher nominativement à un compte, ce
  // qui rendait fausses deux affirmations de la politique de confidentialité (« données
  // anonymisées », « absence de recoupement avec d'autres traitements ») et faisait tomber
  // l'exemption de consentement de la CNIL. Constaté le 22/08/2026 en lisant les propriétés d'un
  // vrai évènement dans PostHog, pas le code.
  //
  // Il reste `resetAnalytics()` à la déconnexion : PostHog garde un identifiant aléatoire, et on
  // veut qu'il change quand on quitte un compte — sinon deux personnes sur le même appareil
  // partageraient le même. Ne PAS réintroduire d'identification sans bandeau de consentement.
  useEffect(() => {
    if (!session?.user?.id) resetAnalytics();
  }, [session?.user?.id]);

  useEffect(() => {
    if (!hasProfile) return;
    let cancelled = false;
    fetchFeed(0, session?.user?.id)
      .then((data) => {
        if (cancelled) return;
        setPosts(data);
        setHasMorePosts(data.length === FEED_PAGE_SIZE);
        setPostsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setPostsError(errorMessage(err));
        setPostsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hasProfile]);

  const refreshUnreadNotificationCount = () => {
    if (!session) return;
    fetchUnreadNotificationCount()
      .then(setUnreadNotificationCount)
      .catch(() => {});
  };

  // Demandes d'ami + invitations de groupe en attente, pour le badge "Mes invitations" du menu
  // latéral — même duo de requêtes que celles utilisées par l'écran lui-même, juste réduites à un
  // compte total ici.
  const refreshPendingInvitationsCount = () => {
    if (!session) return;
    Promise.all([fetchPendingRequests(session.user.id), fetchPendingGroupInvites(session.user.id)])
      .then(([requests, invites]) => setPendingInvitationsCount(requests.length + invites.length))
      .catch(() => {});
  };

  useEffect(() => {
    if (!hasProfile) return;
    refreshUnreadNotificationCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile]);

  useEffect(() => {
    if (!hasProfile) return;
    refreshPendingInvitationsCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile]);

  const refreshMyGroups = () => {
    if (!session) return;
    fetchMyGroups()
      .then(setMyGroups)
      .catch(() => {});
  };

  useEffect(() => {
    if (!hasProfile) return;
    refreshMyGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile]);

  // Le bandeau d'arrivée annonce une publication qui vient d'avoir lieu, ce n'est pas un état du
  // groupe : il ne survit pas à la sortie de la page, par quelque chemin qu'on la quitte (retour,
  // « Inviter », profil d'un membre, modification d'une main). Le faire ici plutôt que dans chacun
  // de ces départs, sinon il en resterait un.
  useEffect(() => {
    if (mode !== 'group') setShowPublishedNotice(false);
  }, [mode]);

  const openCorrection = async (
    postId: string,
    retour: 'feed' | 'profile' | 'group' | 'post',
    depuis: Phase
  ) => {
    const local = posts.find((p) => p.id === postId) ?? (editingPostFallback?.id === postId ? editingPostFallback : null);
    try {
      const post = local ?? (await fetchPost(postId));
      if (!post) {
        setPostsError("Cette main n'est plus disponible.");
        return;
      }
      setCorrectingPost(post);
      setCorrectReturnMode(retour);
      setCorrectFromPhase(depuis);
      setMode('correct');
    } catch (err) {
      setPostsError(errorMessage(err));
    }
  };

  /**
   * « Modifier le post ». Passe par la MÊME relecture que la correction et la duplication, et pas
   * par un simple `setEditingPostId` : `editingPost` se résout dans `posts`, c'est-à-dire dans le
   * FEED. Une main absente du feed — une main privée, ou une vieille main d'un profil au-delà des
   * pages déjà chargées — laissait donc `editingPost` à `undefined`, et l'écran d'édition ne
   * s'affichait pas du tout : on retombait sur le feed sans le moindre message. C'est ce que
   * Victor a rencontré le 22/08 en modifiant un brouillon depuis son profil.
   */
  const openEdition = async (postId: string, retour: 'feed' | 'profile' | 'group' | 'post') => {
    const local = posts.find((p) => p.id === postId) ?? (editingPostFallback?.id === postId ? editingPostFallback : null);
    try {
      const post = local ?? (await fetchPost(postId));
      if (!post) {
        setPostsError("Cette main n'est plus disponible.");
        return;
      }
      // Renseigner le repli MÊME quand la main vient du feed : c'est lui que `editingPost`
      // consultera si la liste change sous les pieds de l'écran d'édition.
      setEditingPostFallback(post);
      setEditingPostId(postId);
      setEditReturnMode(retour);
      setMode('edit');
    } catch (err) {
      setPostsError(errorMessage(err));
    }
  };

  // Même relecture que `openCorrection`, et pour la même raison : la main peut être affichée depuis
  // un profil ou un groupe sans être dans `posts`, et une copie a besoin de `hand`.
  const openDuplication = async (postId: string, retour: 'feed' | 'profile' | 'group' | 'post') => {
    const local = posts.find((p) => p.id === postId) ?? (editingPostFallback?.id === postId ? editingPostFallback : null);
    try {
      const post = local ?? (await fetchPost(postId));
      if (!post) {
        setPostsError("Cette main n'est plus disponible.");
        return;
      }
      setDuplicatingPost(post);
      setDuplicateReturnMode(retour);
      setMode('duplicate');
    } catch (err) {
      setPostsError(errorMessage(err));
    }
  };

  // En revenant d'un profil consulté, le feed peut être périmé (like/suppression faits là-bas) —
  // on le recharge plutôt que de laisser un état obsolète affiché.
  const refreshFeed = async () => {
    try {
      const fresh = await fetchFeed(0, session?.user?.id);
      setPosts((current) => {
        if (current.length <= fresh.length) return fresh;
        // L'utilisateur avait déjà chargé plusieurs pages : on remet à jour celles du haut sans
        // jeter les suivantes, sinon un simple retour sur l'app le renverrait en haut du feed
        // avec les mains qu'il avait déroulées disparues sous ses yeux.
        const freshIds = new Set(fresh.map((p) => p.id));
        return [...fresh, ...current.filter((p) => !freshIds.has(p.id))];
      });
      setPostsError(null);
    } catch (err) {
      setPostsError(errorMessage(err));
    }
  };

  const handlePullToRefresh = async () => {
    setRefreshing(true);
    await refreshFeed();
    setRefreshing(false);
  };

  const handleLoadMore = async () => {
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const older = await fetchFeed(posts.length, session?.user?.id);
      setPosts((current) => {
        // Une main publiée entre deux pages décale la fenêtre et peut renvoyer une main déjà
        // affichée — deux cartes identiques feraient planter le rendu (clés React en double).
        const seen = new Set(current.map((p) => p.id));
        return [...current, ...older.filter((p) => !seen.has(p.id))];
      });
      setHasMorePosts(older.length === FEED_PAGE_SIZE);
    } catch (err) {
      setPostsError(errorMessage(err));
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  // Sur le web, `RefreshControl` est un composant vide : react-native-web ignore `onRefresh`, donc
  // le geste "tirer pour rafraîchir" n'existe que sur téléphone. Recharger quand l'onglet ou l'app
  // redevient visible couvre les deux plateformes, et c'est le seul moyen sur navigateur de voir
  // les mains publiées par les autres sans recharger la page entière.
  useEffect(() => {
    if (!hasProfile) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshFeed();
        refreshUnreadNotificationCount();
        refreshPendingInvitationsCount();
      }
    });
    return () => subscription?.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile]);

  // Lien ouvert de l'extérieur (partage / QR / invitation) : dès que le profil est prêt, on lit
  // l'URL une seule fois puis on la nettoie. `/invite/:id` amène sur le profil de la personne (avec
  // le bouton "Ajouter en ami"), `/post/:id` ouvre la main partagée. Ignoré sur mobile natif.
  // Lu UNE FOIS au montage, avant toute garde de session : l'effet de lien profond ci-dessous
  // attend d'être connecté ET d'avoir un profil, ce qui arrive bien trop tard pour un visiteur sans
  // compte. `useState` avec initialiseur paresseux plutôt qu'un effet : la valeur doit être connue
  // dès le premier rendu, sinon l'écran de connexion s'affiche une fraction de seconde avant la
  // main partagée.
  const [publicPostId] = useState(() => {
    const route = readInitialDeepLink();
    return route?.type === 'post' ? route.postId : null;
  });
  // Lien `/s/:token` : une main que son auteur a explicitement rendue partageable. Lu au montage
  // comme ci-dessus, et pour la même raison. Modifiable, lui, parce qu'un visiteur DÉJÀ connecté
  // doit pouvoir refermer cette page et retrouver son app.
  const [shareToken, setShareToken] = useState(() => {
    const route = readInitialDeepLink();
    return route?.type === 'share' ? route.token : null;
  });
  // Passe outre l'aperçu public quand le visiteur clique « Créer un compte » — sans quoi il
  // resterait bloqué sur la main, l'URL n'ayant pas changé.
  const [veutSeConnecter, setVeutSeConnecter] = useState(false);

  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  useEffect(() => {
    if (!hasProfile || deepLinkHandled || !session) return;
    const route = readInitialDeepLink();
    if (route) {
      if (route.type === 'invite') {
        // Son propre lien d'invitation ne mène nulle part d'utile : on retombe sur le feed.
        if (route.userId !== session.user.id) {
          setViewingProfileId(route.userId);
          setMode('profile');
        }
      } else if (route.type === 'post') {
        setViewingPostId(route.postId);
        setViewingPostComments(false);
        setMode('post');
      }
      // `share` n'est pas traité ici : la page de partage s'affiche avant même la garde de
      // session, plus bas. Un membre connecté qui suit un lien de partage n'a d'ailleurs aucune
      // raison de pouvoir ouvrir la main dans l'app — il n'y a peut-être pas accès.
      clearDeepLinkFromUrl();
    }
    setDeepLinkHandled(true);
  }, [hasProfile, deepLinkHandled, session]);

  const handleDelete = async (postId: string) => {
    const previous = posts;
    setPosts((p) => p.filter((post) => post.id !== postId));
    try {
      await deletePost(postId);
    } catch (err) {
      // Restaure la liste si la suppression échoue côté serveur (ex: coupure réseau) — l'utilisateur
      // ne doit pas croire le post supprimé alors qu'il existe toujours réellement.
      setPosts(previous);
      setPostsError(errorMessage(err));
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!session) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;
    const nextLiked = !post.likedByMe;
    // Optimiste : le like doit réagir instantanément, on ne restaure que si l'appel échoue vraiment.
    setPosts((p) =>
      p.map((post) =>
        post.id === postId
          ? { ...post, likedByMe: nextLiked, likeCount: post.likeCount + (nextLiked ? 1 : -1) }
          : post
      )
    );
    try {
      await setLiked(postId, session.user.id, nextLiked);
    } catch (err) {
      setPosts((p) =>
        p.map((post) =>
          post.id === postId
            ? { ...post, likedByMe: !nextLiked, likeCount: post.likeCount + (nextLiked ? -1 : 1) }
            : post
        )
      );
      setPostsError(errorMessage(err));
    }
  };

  // Bloquer un auteur depuis le menu ⋯ d'une main : le blocage est déjà fait en base par `PostCard`,
  // il ne reste qu'à retirer localement ses mains du feed (la RLS les masque déjà côté serveur, mais
  // l'état chargé les contient encore).
  const handleBlockAuthorInFeed = (authorId: string) => {
    setPosts((p) => p.filter((post) => post.authorId !== authorId));
  };

  // Le feed reste la source normale du post à éditer, mais il n'est chargé qu'une fois : une main à
  // soi publiée depuis un autre appareil après ce chargement n'y figure pas. La page d'une main,
  // elle, a toujours sa version fraîche — elle la fournit en repli plutôt que de laisser l'écran
  // d'édition sans post et l'app retomber silencieusement sur le feed.
  const editingPost = posts.find((p) => p.id === editingPostId) ?? editingPostFallback;

  if (!fontsLoaded || loading) {
    return <View style={styles.container} />;
  }

  // Lien de partage : la MÊME page pour tout le monde, connecté ou non. C'est voulu — le jeton
  // ouvre une main qui n'est pas publique, donc une main que le visiteur, même membre de Pokza,
  // n'a en général pas le droit de voir dans l'app. Lui montrer autre chose selon qu'il est
  // connecté supposerait un accès qu'il n'a pas.
  if (shareToken && !veutSeConnecter) {
    return (
      <View style={styles.container}>
        <PublicPostScreen
          shareToken={shareToken}
          dejaConnecte={Boolean(session)}
          onJoin={() => {
            if (session) {
              clearDeepLinkFromUrl();
              setShareToken(null);
            } else {
              setVeutSeConnecter(true);
            }
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!session) {
    // Un lien vers une main PUBLIQUE s'ouvre sans compte (décision produit du 16/08). Le visiteur
    // voit la main et son déroulé, jamais l'auteur ni la couche sociale — cf. `PublicPostScreen`.
    // L'URL n'est volontairement PAS nettoyée ici : elle reste intacte pour l'effet de lien profond
    // plus haut, qui rouvrira la main tout seul une fois le compte créé et le profil rempli.
    if (publicPostId && !veutSeConnecter) {
      return (
        <View style={styles.container}>
          <PublicPostScreen postId={publicPostId} onJoin={() => setVeutSeConnecter(true)} />
          <StatusBar style="dark" />
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <AuthScreen />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (passwordRecovery) {
    return (
      <View style={styles.container}>
        <NewPasswordScreen onDone={clearPasswordRecovery} onCancel={clearPasswordRecovery} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (profileLoading || hasProfile === null) {
    // L'état du profil n'est pas encore connu. Si c'est parce qu'on n'ARRIVE pas à le savoir et que
    // ça dure, on le dit — plutôt qu'un écran blanc muet. `hasProfile` n'est jamais passé à `false`
    // sur une erreur : c'est ce qui produisait le faux « Complète ton profil ».
    if (profileErrorVisible && profileError) {
      return (
        <View style={styles.container}>
          <ConnectionErrorScreen message={profileError} onRetry={refetchProfile} />
          <StatusBar style="dark" />
        </View>
      );
    }
    return <View style={styles.container} />;
  }

  if (!hasProfile) {
    return (
      <View style={styles.container}>
        <CompleteProfileScreen onComplete={refetchProfile} onBack={() => supabase.auth.signOut()} />
        <StatusBar style="dark" />
      </View>
    );
  }

  // Création d'un groupe sans quitter l'écran courant — créateur de main comme modification d'une
  // main. Sortir vers « Mes groupes » démonterait l'écran appelant et jetterait la saisie en cours.
  // On ajoute le groupe à la liste locale au lieu de la relire : `refreshMyGroups` la remplacera
  // par la version en base au prochain passage sur l'écran des groupes.
  const createGroupInPlace = async (name: string): Promise<string> => {
    const groupId = await createGroup(name);
    setMyGroups((prev) => [
      ...prev,
      { id: groupId, name, ownerId: session.user.id, createdAt: new Date().toISOString() },
    ]);
    return groupId;
  };

  if (mode === 'create') {
    return (
      <View style={styles.container}>
        <LiveHandCreator
          authorId={session.user.id}
          authorName={displayName ?? 'Joueur'}
          formatFavori={myFormatFavori}
          varianteFavorite={myVarianteFavorite}
          groups={myGroups}
          // Le groupe créé ici est retenu à part : c'est lui qui détourne l'atterrissage après
          // publication vers la page du groupe (cf. `onCreated`).
          onCreateGroup={async (name) => {
            const groupId = await createGroupInPlace(name);
            groupsCreatedInCreator.current.add(groupId);
            return groupId;
          }}
          onCancel={() => {
            // Main abandonnée : le groupe créé reste, mais il ne doit plus détourner l'atterrissage
            // d'une publication ultérieure — d'ici là il aura peut-être des membres.
            groupsCreatedInCreator.current.clear();
            setMode('feed');
          }}
          onCreated={async (draftPost) => {
            try {
              const saved = await createPost(
                {
                  authorId: draftPost.authorId,
                  location: draftPost.location,
                  buyIn: draftPost.buyIn,
                  level: draftPost.level,
                  title: draftPost.title,
                  description: draftPost.description,
                  hand: draftPost.hand,
                  voteQuestion: draftPost.voteQuestion,
                  voteOptions: draftPost.voteOptions,
                  visibility: draftPost.visibility,
                  groupId: draftPost.groupId,
                },
                draftPost.authorName,
                myAvatarUrl
              );
              setPosts((p) => [saved, ...p]);
              trackEvent('hand_created', { variant: saved.hand.variant, game_type: saved.hand.gameType });
              // Main publiée dans un groupe créé à l'instant : on ouvre le groupe au lieu du feed.
              // C'est le seul endroit où le bouton « Inviter » est à portée, et le seul moment où
              // l'auteur a une raison d'y penser. Dans tous les autres cas, retour au feed.
              const landsInNewGroup =
                saved.visibility === 'group' && !!saved.groupId && groupsCreatedInCreator.current.has(saved.groupId);
              groupsCreatedInCreator.current.clear();
              if (landsInNewGroup) {
                setViewingGroupId(saved.groupId!);
                setShowPublishedNotice(true);
                setMode('group');
              } else {
                setMode('feed');
              }
            } catch (err) {
              setPostsError(errorMessage(err));
            }
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'edit' && editingPost) {
    const onBack = () => {
      setEditingPostId(null);
      setMode(editReturnMode);
    };
    const onSwipeBack = () => {
      if (editPostScreenRef.current?.handleBack()) return;
      onBack();
    };
    return (
      <Screen onBack={onSwipeBack}>
        <EditPostScreen
          ref={editPostScreenRef}
          post={editingPost}
          groups={myGroups}
          onCreateGroup={createGroupInPlace}
          onCancel={onBack}
          onSave={async (edits) => {
            const postId = editingPost.id;
            try {
              // `editedAt` vient de la base et non de l'horloge du téléphone : c'est le trigger
              // qui décide si le contenu a réellement changé (réenregistrer à l'identique ne
              // marque rien), et lui seul a le droit d'écrire cette colonne.
              const editedAt = await updatePost(postId, edits);
              setPosts((p) =>
                p.map((post) =>
                  post.id === postId ? { ...post, ...edits, editedAt: editedAt ?? undefined } : post
                )
              );
              setEditingPostId(null);
              setMode(editReturnMode);
            } catch (err) {
              setPostsError(errorMessage(err));
            }
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'correct' && correctingPost) {
    const onBack = () => {
      setCorrectingPost(null);
      setMode(correctReturnMode);
    };
    const ancien = correctingPost;
    return (
      <View style={styles.container}>
        <LiveHandCreator
          authorId={session.user.id}
          authorName={displayName ?? 'Joueur'}
          formatFavori={myFormatFavori}
          varianteFavorite={myVarianteFavorite}
          groups={myGroups}
          initial={postToSeed(ancien)}
          initialPhase={correctFromPhase}
          onCreateGroup={async (name) => {
            const groupId = await createGroup(name);
            setMyGroups((prev) => [
              ...prev,
              { id: groupId, name, ownerId: session.user.id, createdAt: new Date().toISOString() },
            ]);
            return groupId;
          }}
          onCreated={async (draftPost) => {
            // ORDRE NON NÉGOCIABLE : publier D'ABORD, supprimer ENSUITE. L'inverse perdrait la main
            // pour de bon si la publication échouait (réseau coupé, session expirée). Ici, le pire
            // cas laisse deux exemplaires — visible, et réparable d'un geste par l'auteur.
            const saved = await createPost(
              {
                authorId: draftPost.authorId,
                location: draftPost.location,
                buyIn: draftPost.buyIn,
                level: draftPost.level,
                title: draftPost.title,
                description: draftPost.description,
                hand: draftPost.hand,
                voteQuestion: draftPost.voteQuestion,
                voteOptions: draftPost.voteOptions,
                visibility: draftPost.visibility,
                groupId: draftPost.groupId,
              },
              draftPost.authorName,
              myAvatarUrl
            );
            try {
              await deletePost(ancien.id);
            } catch (err) {
              // La correction EST publiée : on ne la présente pas comme un échec. On dit seulement
              // que l'ancienne version est encore là, ce que l'auteur peut corriger lui-même.
              setPostsError(
                "La main corrigée est publiée, mais l'ancienne version n'a pas pu être supprimée — retire-la depuis son menu ⋯."
              );
            }
            setPosts((p) => [saved, ...p.filter((x) => x.id !== ancien.id)]);
            trackEvent('hand_corrected', { variant: saved.hand.variant, game_type: saved.hand.gameType });
            setCorrectingPost(null);
            // Retour au feed et pas à l'écran d'origine : la main corrigée a un nouvel id, donc la
            // page de l'ancienne n'existe plus, et la liste d'un profil ou d'un groupe déjà chargée
            // montrerait encore la version supprimée.
            setMode('feed');
          }}
          onCancel={onBack}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  // « Dupliquer la main » — la sortie de secours du verrou d'audience. L'originale n'est PAS
  // supprimée : c'est ce qui distingue ce geste de « Corriger la main », qui republie et remplace.
  // Une main de groupe privé peut ainsi être rejouée en public sans emmener avec elle les
  // commentaires écrits devant le groupe, qui restent là où ils ont été écrits.
  if (mode === 'duplicate' && duplicatingPost) {
    const onBack = () => {
      setDuplicatingPost(null);
      setMode(duplicateReturnMode);
    };
    const onSwipeBack = () => {
      if (editPostScreenRef.current?.handleBack()) return;
      onBack();
    };
    const original = duplicatingPost;
    return (
      <Screen onBack={onSwipeBack}>
        <EditPostScreen
          ref={editPostScreenRef}
          post={original}
          mode="duplicate"
          groups={myGroups}
          onCreateGroup={createGroupInPlace}
          onCancel={onBack}
          onSave={async (edits) => {
            try {
              // `hand` vient de l'originale et n'a jamais transité par le formulaire : la copie a
              // exactement le même déroulé, aucun chemin ne permet de le retoucher au passage.
              const saved = await createPost(
                {
                  authorId: session.user.id,
                  location: edits.location,
                  buyIn: edits.buyIn,
                  level: edits.level,
                  title: edits.title,
                  description: edits.description,
                  hand: original.hand,
                  voteQuestion: edits.voteQuestion,
                  voteOptions: edits.voteOptions,
                  visibility: edits.visibility,
                  groupId: edits.groupId,
                },
                displayName ?? 'Joueur',
                myAvatarUrl
              );
              setPosts((p) => [saved, ...p]);
              trackEvent('hand_duplicated', { visibility: saved.visibility });
              setDuplicatingPost(null);
              // Retour au feed : la copie y est en tête, ce qui montre qu'elle existe VRAIMENT.
              // Revenir sur la page d'origine afficherait l'ancienne main inchangée, et laisserait
              // croire que le geste n'a rien fait.
              setMode('feed');
            } catch (err) {
              setPostsError(errorMessage(err));
            }
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'invitations') {
    const onBack = () => {
      setMode('feed');
      refreshPendingInvitationsCount();
    };
    return (
      <Screen onBack={onBack}>
        <InvitationsScreen
          currentUserId={session.user.id}
          onBack={onBack}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
          onInvitationHandled={refreshPendingInvitationsCount}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'post' && viewingPostId) {
    const onBack = () => {
      setViewingPostId(null);
      // Retour au feed : la main s'ouvre soit depuis un lien de partage, soit depuis la feuille de
      // notifications (elle-même au-dessus du feed) — dans les deux cas on retombe sur le feed.
      setMode('feed');
      refreshFeed();
    };
    return (
      <Screen onBack={onBack}>
        <PostScreen
          postId={viewingPostId}
          currentUserId={session.user.id}
          currentUserName={displayName ?? 'Joueur'}
          openComments={viewingPostComments}
          onBack={onBack}
          onEditPost={(postId) => void openEdition(postId, 'post')}
          onCorrectPost={(postId, depuis) => void openCorrection(postId, 'post', depuis)}
          onDuplicatePost={(postId) => void openDuplication(postId, 'post')}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
          onLoaded={setEditingPostFallback}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'profile' && viewingProfileId) {
    const onBack = () => {
      setViewingProfileId(null);
      setMode('feed');
      refreshFeed();
      refreshUnreadNotificationCount();
    };
    return (
      <Screen onBack={onBack}>
        <ProfileScreen
          profileId={viewingProfileId}
          currentUserId={session.user.id}
          currentUserName={displayName ?? 'Joueur'}
          onProfileChanged={refetchProfile}
          onCreateHand={() => setMode('create')}
          onBack={onBack}
          onEditPost={(postId) => void openEdition(postId, 'profile')}
          onCorrectPost={(postId, depuis) => void openCorrection(postId, 'profile', depuis)}
          onDuplicatePost={(postId) => void openDuplication(postId, 'profile')}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
          onOpenGroup={(groupId) => {
            setViewingGroupId(groupId);
            setMode('group');
          }}
          onOpenFriends={() => setMode('myFriends')}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'myFriends') {
    const onBack = () => setMode('profile');
    return (
      <Screen onBack={onBack}>
        <FriendsListScreen
          userId={session.user.id}
          onBack={onBack}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'groups') {
    const onBack = () => {
      setMode('feed');
      refreshMyGroups();
    };
    return (
      <Screen onBack={onBack}>
        <GroupsListScreen
          currentUserId={session.user.id}
          onBack={onBack}
          onSelectGroup={(groupId) => {
            setViewingGroupId(groupId);
            setMode('group');
            refreshMyGroups();
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'group' && viewingGroupId) {
    const onBack = () => {
      setViewingGroupId(null);
      setMode('groups');
      refreshFeed();
      refreshMyGroups();
    };
    // Le glissement de bord (`Screen`) doit d'abord laisser `GroupScreen` refermer un panneau local
    // ouvert (Modifier le groupe / Liste de membres / Exclure un membre) s'il y en a un — sinon ce
    // geste, attaché ici et non conscient de ces panneaux internes, saute directement à « Mes
    // groupes privés ». La flèche ‹ de `GroupScreen` n'a pas besoin de ce détour : masquée derrière
    // ces mêmes panneaux, c'est leur propre flèche qui agit, déjà correctement liée en local.
    const onSwipeBack = () => {
      if (groupScreenRef.current?.handleBack()) return;
      onBack();
    };
    return (
      <Screen onBack={onSwipeBack}>
        <GroupScreen
          ref={groupScreenRef}
          groupId={viewingGroupId}
          currentUserId={session.user.id}
          currentUserName={displayName ?? 'Joueur'}
          showPublishedNotice={showPublishedNotice}
          onCreateHand={() => setMode('create')}
          onBack={onBack}
          onEditPost={(postId) => void openEdition(postId, 'group')}
          onCorrectPost={(postId, depuis) => void openCorrection(postId, 'group', depuis)}
          onDuplicatePost={(postId) => void openDuplication(postId, 'group')}
          onInviteMembers={(groupId) => {
            setInvitingGroupId(groupId);
            setMode('inviteToGroup');
          }}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'inviteToGroup' && invitingGroupId) {
    const onBack = () => setMode('group');
    return (
      <Screen onBack={onBack}>
        <SearchScreen
          onBack={onBack}
          onSelectProfile={() => {}}
          inviteMode
          currentUserId={session.user.id}
          excludeGroupId={invitingGroupId}
          onInvite={async (profileId) => {
            // On reste sur l'écran d'invitation pour pouvoir en inviter plusieurs d'affilée ;
            // la personne invitée disparaît de la liste (géré côté SearchScreen).
            try {
              await inviteToGroup(invitingGroupId, profileId, session.user.id);
            } catch (err) {
              setPostsError(errorMessage(err));
            }
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'addFriends') {
    const onBack = () => setMode('feed');
    return (
      <Screen onBack={onBack}>
        <AddFriendsScreen
          currentUserId={session.user.id}
          onBack={onBack}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'blocked') {
    // On y arrive depuis Réglages (menu latéral) → on y revient.
    const onBack = () => setMode('settings');
    return (
      <Screen onBack={onBack}>
        <BlockedListScreen
          currentUserId={session.user.id}
          onBack={onBack}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'settings') {
    const onBack = () => setMode('feed');
    // Même relais que `groupScreenRef` : le document légal ouvert par-dessus Réglages est un
    // overlay local, invisible du glissement de bord attaché ici — sans ça, ce geste sautait
    // directement au feed au lieu de refermer d'abord le document.
    const onSwipeBack = () => {
      if (settingsScreenRef.current?.handleBack()) return;
      onBack();
    };
    return (
      <Screen onBack={onSwipeBack}>
        <SettingsScreen
          ref={settingsScreenRef}
          userId={session.user.id}
          onBack={onBack}
          onOpenBlocked={() => setMode('blocked')}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  // Réservé aux admins. Double garde : l'entrée de menu n'apparaît que pour un admin, et même en
  // forçant ce mode la fonction SQL `get_admin_stats` refuse un non-admin.
  if (mode === 'stats' && isAdmin) {
    const onBack = () => setMode('feed');
    return (
      <Screen onBack={onBack}>
        <StatsScreen onBack={onBack} />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  // Back-office modération. Même double garde que Stats : entrée de menu réservée aux admins et
  // chaque RPC re-vérifie `is_admin()` côté base — forcer le mode ne donne accès à rien.
  if (mode === 'adminReports' && isAdmin) {
    const onBack = () => setMode('feed');
    return (
      <Screen onBack={onBack}>
        <AdminReportsScreen
          reloadKey={adminReportsReloadKey}
          onBack={onBack}
          onOpenReport={(reportId) => {
            setAdminReportId(reportId);
            setMode('adminReportDetail');
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'adminReportDetail' && isAdmin && adminReportId) {
    const onBack = () => {
      // Une action a pu changer le statut du signalement → forcer un rechargement de la file.
      setAdminReportsReloadKey((k) => k + 1);
      setMode('adminReports');
    };
    return (
      <Screen onBack={onBack}>
        <AdminReportDetailScreen
          reportId={adminReportId}
          onBack={onBack}
          onOpenUser={(userId) => {
            setAdminUserId(userId);
            setMode('adminUser');
          }}
        />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'adminUser' && isAdmin && adminUserId) {
    const onBack = () => setMode(adminReportId ? 'adminReportDetail' : 'adminReports');
    return (
      <Screen onBack={onBack}>
        <AdminUserScreen userId={adminUserId} onBack={onBack} />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  if (mode === 'adminAudit' && isAdmin) {
    const onBack = () => setMode('feed');
    return (
      <Screen onBack={onBack}>
        <AdminAuditScreen onBack={onBack} />
        <StatusBar style="dark" />
      </Screen>
    );
  }

  return (
    <View style={styles.container} {...menuEdgeSwipe.panHandlers}>
      <FeedHeader
        compact={headerCompact}
        onOpenMenu={() => setMenuOpen(true)}
        onCreate={() => setMode('create')}
        onSearch={() => setSearchOpen(true)}
        onNotifications={() => setNotificationsOpen(true)}
        unreadCount={unreadNotificationCount}
      />
      <PullToRefresh
        ref={feedScrollRef}
        style={styles.feedScroll}
        contentContainerStyle={styles.scrollContent}
        refreshing={refreshing}
        onRefresh={handlePullToRefresh}
        onScroll={handleFeedScroll}
        scrollEventThrottle={16}
      >
        {postsError && <Text style={styles.statusText}>{postsError}</Text>}
        {postsLoading ? (
          <Text style={styles.statusText}>Chargement des mains…</Text>
        ) : posts.length === 0 ? (
          <Text style={styles.statusText}>Aucune main partagée pour l'instant.</Text>
        ) : (
          posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={session.user.id}
              currentUserName={displayName ?? 'Joueur'}
              isOwnPost={post.authorId === session.user.id}
              onDelete={() => handleDelete(post.id)}
              onEdit={() => void openEdition(post.id, 'feed')}
              onCorrect={(depuis) => void openCorrection(post.id, 'feed', depuis)}
              onDuplicate={() => void openDuplication(post.id, 'feed')}
              onToggleLike={() => handleToggleLike(post.id)}
              onPressAuthor={() => {
                setViewingProfileId(post.authorId);
                setMode('profile');
              }}
              onSelectProfile={(profileId) => {
                setViewingProfileId(profileId);
                setMode('profile');
              }}
              onOpenGroup={(groupId) => {
                setViewingGroupId(groupId);
                setMode('group');
              }}
              onBlockAuthor={handleBlockAuthorInFeed}
            />
          ))
        )}
        {/* Le feed charge la suite tout seul (cf. `handleFeedScroll`) : il ne reste qu'à occuper la
            place pendant la requête. Le bouton « Charger plus de mains » demandait un tap toutes
            les dix mains, ce que ne fait aucun feed social. */}
        {!postsLoading && posts.length > 0 && hasMorePosts && (
          <View style={styles.loadMoreSpinner}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        )}
      </PullToRefresh>
      <ScrollToTopButton visible={showScrollTop} onPress={handleScrollToTop} />
      <SideMenu
        visible={menuOpen}
        displayName={displayName ?? 'Joueur'}
        avatarUrl={myAvatarUrl}
        items={[
          {
            label: 'Mes invitations',
            icon: MailIcon,
            badge: pendingInvitationsCount,
            onPress: () => {
              setMenuOpen(false);
              setMode('invitations');
            },
          },
          {
            label: 'Ajouter des amis',
            icon: FriendsIcon,
            onPress: () => {
              setMenuOpen(false);
              setMode('addFriends');
            },
          },
          {
            label: 'Mes groupes privés',
            icon: GroupTableIcon,
            // Total des mains non vues, tous groupes confondus — même pastille que « Mes
            // invitations » juste au-dessus.
            badge: myGroups.reduce((total, group) => total + (group.unseenCount ?? 0), 0),
            onPress: () => {
              setMenuOpen(false);
              setMode('groups');
            },
          },
          // « Comptes bloqués », « Supprimer mon compte » et « Informations légales » ne sont PAS
          // ici : ce sont des réglages, rangés dans « Réglages » plutôt qu'au premier niveau du menu.
          {
            label: 'Réglages',
            icon: GearIcon,
            onPress: () => {
              setMenuOpen(false);
              setMode('settings');
            },
          },
          // Uniquement pour le compte admin (fondateur). `section` insère un filet et un intitulé
          // au-dessus de la première : les outils d'administration ne doivent pas se lire comme la
          // suite des fonctions sociales.
          ...(isAdmin
            ? [
                {
                  label: 'Statistiques',
                  section: ADMIN_SECTION,
                  icon: ChartIcon,
                  onPress: () => {
                    setMenuOpen(false);
                    setMode('stats');
                  },
                },
                {
                  label: 'Modération',
                  section: ADMIN_SECTION,
                  icon: ShieldIcon,
                  onPress: () => {
                    setMenuOpen(false);
                    setAdminReportId(null);
                    setMode('adminReports');
                  },
                },
                {
                  label: "Journal d'audit",
                  section: ADMIN_SECTION,
                  icon: AuditIcon,
                  onPress: () => {
                    setMenuOpen(false);
                    setMode('adminAudit');
                  },
                },
              ]
            : []),
        ]}
        onClose={() => setMenuOpen(false)}
        onOpenProfile={() => {
          setMenuOpen(false);
          setViewingProfileId(session.user.id);
          setMode('profile');
        }}
        onSignOut={() => {
          setMenuOpen(false);
          supabase.auth.signOut();
        }}
      />
      <NotificationsScreen
        visible={notificationsOpen}
        currentUserId={session.user.id}
        onClose={() => {
          setNotificationsOpen(false);
          refreshUnreadNotificationCount();
        }}
        onSelectProfile={(profileId) => {
          setNotificationsOpen(false);
          setViewingProfileId(profileId);
          setMode('profile');
        }}
        onOpenGroup={(groupId) => {
          setNotificationsOpen(false);
          setViewingGroupId(groupId);
          setMode('group');
        }}
        onOpenPost={(postId, openComments) => {
          setNotificationsOpen(false);
          setViewingPostId(postId);
          setViewingPostComments(openComments);
          setMode('post');
        }}
      />
      <SearchScreen
        variant="sheet"
        visible={searchOpen}
        onBack={() => setSearchOpen(false)}
        onClose={() => setSearchOpen(false)}
        onSelectProfile={(profileId) => {
          setSearchOpen(false);
          setViewingProfileId(profileId);
          setMode('profile');
        }}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootChrome: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  feedScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  statusText: {
    marginHorizontal: 14,
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loadMoreSpinner: {
    marginHorizontal: 14,
    marginTop: 6,
    paddingVertical: 14,
    alignItems: 'center',
  },
});
