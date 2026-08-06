import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './src/utils/errorMessage';
import { StatusBar } from 'expo-status-bar';
// Import par graisse, et non depuis la racine de `@expo-google-fonts/fraunces` : son index.js fait
// un `require()` des 18 graisses au niveau module, que Metro ne peut pas élaguer — importer quoi que
// ce soit depuis la racine embarquait donc 1,4 Mo de polices dont 1,2 Mo jamais utilisées.
import { useFonts } from 'expo-font';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { ActivityIndicator, Animated, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { PostCard } from './src/components/post/PostCard';
import { LiveHandCreator } from './src/creator/LiveHandCreator';
import { createPost, deletePost, fetchFeed, FEED_PAGE_SIZE, setLiked, updatePost } from './src/data/posts';
import { colors } from './src/theme/theme';
import type { Post } from './src/types/poker';
import { DisplayUnitProvider } from './src/state/displayUnit';
import { AuthProvider, useAuth } from './src/state/auth';
import { useProfileStatus } from './src/state/profile';
import { AuthScreen } from './src/auth/AuthScreen';
import { NewPasswordScreen } from './src/auth/NewPasswordScreen';
import { CompleteProfileScreen } from './src/profile/CompleteProfileScreen';
import { ProfileScreen } from './src/profile/ProfileScreen';
import { SearchScreen } from './src/search/SearchScreen';
import { NotificationsScreen } from './src/notifications/NotificationsScreen';
import { EditPostScreen } from './src/post/EditPostScreen';
import { PostScreen } from './src/post/PostScreen';
import { supabase } from './src/lib/supabase';
import { fetchUnreadNotificationCount } from './src/data/notifications';
import { SideMenu } from './src/components/ui/SideMenu';
import { PullToRefresh } from './src/components/ui/PullToRefresh';
import { FeedHeader } from './src/components/ui/FeedHeader';
import { GroupsListScreen } from './src/groups/GroupsListScreen';
import { GroupScreen } from './src/groups/GroupScreen';
import { fetchMyGroups, fetchPendingGroupInvites, inviteToGroup, type Group } from './src/data/groups';
import { fetchPendingRequests } from './src/data/friends';
import { AddFriendsScreen } from './src/friends/AddFriendsScreen';
import { FriendsListScreen } from './src/friends/FriendsListScreen';
import { InvitationsScreen } from './src/invitations/InvitationsScreen';
import { StatsScreen } from './src/stats/StatsScreen';
import { clearDeepLinkFromUrl, readInitialDeepLink } from './src/navigation/deepLink';

export default function App() {
  return (
    <DisplayUnitProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </DisplayUnitProvider>
  );
}

function AppContent() {
  const [fontsLoaded] = useFonts({ Fraunces_400Regular, Fraunces_600SemiBold });
  const { session, loading, passwordRecovery, clearPasswordRecovery } = useAuth();
  const {
    hasProfile,
    displayName,
    avatarUrl: myAvatarUrl,
    isAdmin,
    loading: profileLoading,
    refetch: refetchProfile,
  } = useProfileStatus(session?.user.id);
  const [mode, setMode] = useState<
    | 'feed'
    | 'create'
    | 'edit'
    | 'search'
    | 'profile'
    | 'notifications'
    | 'groups'
    | 'group'
    | 'inviteToGroup'
    | 'post'
    | 'addFriends'
    | 'myFriends'
    | 'invitations'
    | 'stats'
  >('feed');
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  // Où revenir une fois l'édition terminée : le feed, le profil, la page du groupe ou la page de la
  // main d'où l'édition a été ouverte.
  const [editReturnMode, setEditReturnMode] = useState<'feed' | 'profile' | 'group' | 'post'>('feed');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [viewingPostId, setViewingPostId] = useState<string | null>(null);
  const [viewingPostComments, setViewingPostComments] = useState(false);
  // Où revenir en fermant la page d'une main : les notifications (d'où on l'ouvre normalement) ou
  // le feed (quand on y arrive par un lien de partage externe).
  const [postReturnMode, setPostReturnMode] = useState<'feed' | 'notifications'>('notifications');
  const [editingPostFallback, setEditingPostFallback] = useState<Post | null>(null);
  const [viewingGroupId, setViewingGroupId] = useState<string | null>(null);
  const [invitingGroupId, setInvitingGroupId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(true);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [pendingInvitationsCount, setPendingInvitationsCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [myGroups, setMyGroups] = useState<Group[]>([]);

  // Barre d'actions fixe : 0 = déployée (haut du feed), 1 = compacte (feed défilé). On n'anime que
  // lorsqu'on franchit le petit seuil, pas à chaque événement de scroll.
  const headerCompact = useRef(new Animated.Value(0)).current;
  const headerIsCompact = useRef(false);
  const handleFeedScroll = (e: { nativeEvent: { contentOffset: { y: number } } }) => {
    const compact = e.nativeEvent.contentOffset.y > 8;
    if (compact === headerIsCompact.current) return;
    headerIsCompact.current = compact;
    Animated.timing(headerCompact, { toValue: compact ? 1 : 0, duration: 150, useNativeDriver: false }).start();
  };

  useEffect(() => {
    if (!hasProfile) return;
    let cancelled = false;
    fetchFeed()
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
    fetchMyGroups(session.user.id)
      .then(setMyGroups)
      .catch(() => {});
  };

  useEffect(() => {
    if (!hasProfile) return;
    refreshMyGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasProfile]);

  // En revenant d'un profil consulté, le feed peut être périmé (like/suppression faits là-bas) —
  // on le recharge plutôt que de laisser un état obsolète affiché.
  const refreshFeed = async () => {
    try {
      const fresh = await fetchFeed();
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
    setLoadingMore(true);
    try {
      const older = await fetchFeed(posts.length);
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
        setPostReturnMode('feed');
        setMode('post');
      }
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

  // Le feed reste la source normale du post à éditer, mais il n'est chargé qu'une fois : une main à
  // soi publiée depuis un autre appareil après ce chargement n'y figure pas. La page d'une main,
  // elle, a toujours sa version fraîche — elle la fournit en repli plutôt que de laisser l'écran
  // d'édition sans post et l'app retomber silencieusement sur le feed.
  const editingPost = posts.find((p) => p.id === editingPostId) ?? editingPostFallback;

  if (!fontsLoaded || loading) {
    return <View style={styles.container} />;
  }

  if (!session) {
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
    return <View style={styles.container} />;
  }

  if (!hasProfile) {
    return (
      <View style={styles.container}>
        <CompleteProfileScreen onComplete={refetchProfile} />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'create') {
    return (
      <View style={styles.container}>
        <LiveHandCreator
          authorId={session.user.id}
          authorName={displayName ?? 'Joueur'}
          groups={myGroups}
          onCancel={() => setMode('feed')}
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
              setMode('feed');
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
    return (
      <View style={styles.container}>
        <EditPostScreen
          post={editingPost}
          groups={myGroups}
          onCancel={() => {
            setEditingPostId(null);
            setMode(editReturnMode);
          }}
          onSave={async (edits) => {
            const postId = editingPost.id;
            try {
              await updatePost(postId, edits);
              setPosts((p) => p.map((post) => (post.id === postId ? { ...post, ...edits } : post)));
              setEditingPostId(null);
              setMode(editReturnMode);
            } catch (err) {
              setPostsError(errorMessage(err));
            }
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'search') {
    return (
      <View style={styles.container}>
        <SearchScreen
          onBack={() => setMode('feed')}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'notifications') {
    return (
      <View style={styles.container}>
        <NotificationsScreen
          currentUserId={session.user.id}
          onBack={() => {
            setMode('feed');
            refreshUnreadNotificationCount();
          }}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
          onOpenGroup={(groupId) => {
            setViewingGroupId(groupId);
            setMode('group');
          }}
          onOpenPost={(postId, openComments) => {
            setViewingPostId(postId);
            setViewingPostComments(openComments);
            setPostReturnMode('notifications');
            setMode('post');
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'invitations') {
    return (
      <View style={styles.container}>
        <InvitationsScreen
          currentUserId={session.user.id}
          onBack={() => {
            setMode('feed');
            refreshPendingInvitationsCount();
          }}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
          onInvitationHandled={refreshPendingInvitationsCount}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'post' && viewingPostId) {
    return (
      <View style={styles.container}>
        <PostScreen
          postId={viewingPostId}
          currentUserId={session.user.id}
          currentUserName={displayName ?? 'Joueur'}
          openComments={viewingPostComments}
          onBack={() => {
            setViewingPostId(null);
            // On revient d'où l'on vient : les notifications si la main a été ouverte depuis là,
            // le feed si on y est arrivé par un lien de partage externe.
            setMode(postReturnMode);
            refreshFeed();
          }}
          onEditPost={(postId) => {
            setEditingPostId(postId);
            setEditReturnMode('post');
            setMode('edit');
          }}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
          onLoaded={setEditingPostFallback}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'profile' && viewingProfileId) {
    return (
      <View style={styles.container}>
        <ProfileScreen
          profileId={viewingProfileId}
          currentUserId={session.user.id}
          currentUserName={displayName ?? 'Joueur'}
          onProfileChanged={refetchProfile}
          onBack={() => {
            setViewingProfileId(null);
            setMode('feed');
            refreshFeed();
            refreshUnreadNotificationCount();
          }}
          onEditPost={(postId) => {
            setEditingPostId(postId);
            setEditReturnMode('profile');
            setMode('edit');
          }}
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
      </View>
    );
  }

  if (mode === 'myFriends') {
    return (
      <View style={styles.container}>
        <FriendsListScreen
          userId={session.user.id}
          onBack={() => setMode('profile')}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'groups') {
    return (
      <View style={styles.container}>
        <GroupsListScreen
          currentUserId={session.user.id}
          onBack={() => {
            setMode('feed');
            refreshMyGroups();
          }}
          onSelectGroup={(groupId) => {
            setViewingGroupId(groupId);
            setMode('group');
            refreshMyGroups();
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'group' && viewingGroupId) {
    return (
      <View style={styles.container}>
        <GroupScreen
          groupId={viewingGroupId}
          currentUserId={session.user.id}
          currentUserName={displayName ?? 'Joueur'}
          onBack={() => {
            setViewingGroupId(null);
            setMode('groups');
            refreshFeed();
            refreshMyGroups();
          }}
          onEditPost={(postId) => {
            setEditingPostId(postId);
            setEditReturnMode('group');
            setMode('edit');
          }}
          onInviteMembers={(groupId) => {
            setInvitingGroupId(groupId);
            setMode('inviteToGroup');
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (mode === 'inviteToGroup' && invitingGroupId) {
    return (
      <View style={styles.container}>
        <SearchScreen
          onBack={() => setMode('group')}
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
      </View>
    );
  }

  if (mode === 'addFriends') {
    return (
      <View style={styles.container}>
        <AddFriendsScreen
          currentUserId={session.user.id}
          onBack={() => setMode('feed')}
          onSelectProfile={(profileId) => {
            setViewingProfileId(profileId);
            setMode('profile');
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  // Réservé aux admins. Double garde : l'entrée de menu n'apparaît que pour un admin, et même en
  // forçant ce mode la fonction SQL `get_admin_stats` refuse un non-admin.
  if (mode === 'stats' && isAdmin) {
    return (
      <View style={styles.container}>
        <StatsScreen onBack={() => setMode('feed')} />
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FeedHeader
        compact={headerCompact}
        onOpenMenu={() => setMenuOpen(true)}
        onCreate={() => setMode('create')}
        onSearch={() => setMode('search')}
        onNotifications={() => setMode('notifications')}
        unreadCount={unreadNotificationCount}
      />
      <PullToRefresh
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
              onEdit={() => {
                setEditingPostId(post.id);
                setEditReturnMode('feed');
                setMode('edit');
              }}
              onToggleLike={() => handleToggleLike(post.id)}
              onPressAuthor={() => {
                setViewingProfileId(post.authorId);
                setMode('profile');
              }}
              onOpenGroup={(groupId) => {
                setViewingGroupId(groupId);
                setMode('group');
              }}
            />
          ))
        )}
        {!postsLoading && posts.length > 0 && hasMorePosts && (
          <Pressable style={styles.loadMoreButton} onPress={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Text style={styles.loadMoreText}>Charger plus de mains</Text>
            )}
          </Pressable>
        )}
      </PullToRefresh>
      <SideMenu
        visible={menuOpen}
        displayName={displayName ?? 'Joueur'}
        avatarUrl={myAvatarUrl}
        items={[
          {
            label: 'Mes invitations',
            icon: '✉️',
            badge: pendingInvitationsCount,
            onPress: () => {
              setMenuOpen(false);
              setMode('invitations');
            },
          },
          {
            label: 'Ajouter des amis',
            icon: '🤝',
            onPress: () => {
              setMenuOpen(false);
              setMode('addFriends');
            },
          },
          {
            label: 'Mes groupes privés',
            icon: '👥',
            onPress: () => {
              setMenuOpen(false);
              setMode('groups');
            },
          },
          // Uniquement pour le compte admin (fondateur).
          ...(isAdmin
            ? [
                {
                  label: 'Statistiques',
                  icon: '📊',
                  onPress: () => {
                    setMenuOpen(false);
                    setMode('stats');
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
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
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
  loadMoreButton: {
    marginHorizontal: 14,
    marginTop: 6,
    paddingVertical: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    alignItems: 'center',
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
