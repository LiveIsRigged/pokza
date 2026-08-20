import React, { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius, spacing, typography } from '../theme/theme';
import { Chip } from '../creator/Chip';
import { Avatar } from '../components/ui/Avatar';
import { shareOrCopy, POKZA_WEB_ORIGIN } from '../utils/share';
import {
  acceptFriendRequest,
  deleteFriendRelation,
  fetchPendingRequests,
  fetchSuggestedFriends,
  type PendingRequest,
  type SuggestedFriend,
} from '../data/friends';

/** Préfixe qui identifie un QR code Pokza — sans lui, un QR scanné par erreur (un autre produit,
 * une pub…) serait traité comme si son contenu était un id de compte valide. */
const QR_PREFIX = 'pokza:friend:';

interface AddFriendsScreenProps {
  currentUserId: string;
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
}

type Tab = 'code' | 'scan' | 'suggestions';

export function AddFriendsScreen({ currentUserId, onBack, onSelectProfile }: AddFriendsScreenProps) {
  const [tab, setTab] = useState<Tab>('suggestions');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const handleShareInvite = async () => {
    const outcome = await shareOrCopy({
      title: 'Rejoins-moi sur Pokza',
      message: 'Ajoute-moi sur Pokza pour suivre mes mains et en discuter !',
      url: `${POKZA_WEB_ORIGIN}/invite/${currentUserId}`,
    });
    if (outcome === 'copied') setShareFeedback('Lien copié dans le presse-papiers !');
    else if (outcome === 'unavailable') setShareFeedback("Le partage n'est pas disponible ici.");
    if (outcome === 'copied' || outcome === 'unavailable') setTimeout(() => setShareFeedback(null), 2500);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Ajouter des amis</Text>
      </View>

      <View style={styles.tabsRow}>
        <Chip label="Suggestions" selected={tab === 'suggestions'} onPress={() => setTab('suggestions')} />
        <Chip label="Mon code" selected={tab === 'code'} onPress={() => setTab('code')} />
        <Chip label="Scanner" selected={tab === 'scan'} onPress={() => setTab('scan')} />
      </View>

      {tab === 'suggestions' ? (
        <SuggestionsTab currentUserId={currentUserId} onSelectProfile={onSelectProfile} />
      ) : tab === 'code' ? (
        <View style={styles.codeTab}>
          <View style={styles.qrWrapper}>
            <QRCode value={`${QR_PREFIX}${currentUserId}`} size={220} color={colors.textPrimary} backgroundColor="#fff" />
          </View>
          <Text style={styles.explainer}>
            Fais scanner ce code par un ami qui a Pokza ouvert pour l'ajouter instantanément — pas besoin de
            chercher son pseudo.
          </Text>
          <Pressable style={styles.actionButton} onPress={handleShareInvite}>
            <Text style={styles.actionButtonText}>Partager mon lien d'invitation</Text>
          </Pressable>
          {shareFeedback && <Text style={styles.feedback}>{shareFeedback}</Text>}
        </View>
      ) : (
        <ScannerTab currentUserId={currentUserId} onScannedProfile={onSelectProfile} />
      )}
    </View>
  );
}

function SuggestionsTab({
  currentUserId,
  onSelectProfile,
}: {
  currentUserId: string;
  onSelectProfile: (profileId: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<SuggestedFriend[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchSuggestedFriends(), fetchPendingRequests(currentUserId)])
      .then(([suggestionsData, pendingData]) => {
        if (!cancelled) {
          setSuggestions(suggestionsData);
          setPending(pendingData);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleAcceptPending = async (senderId: string) => {
    const previous = pending;
    setPending((r) => r.filter((req) => req.senderId !== senderId));
    try {
      await acceptFriendRequest(senderId, currentUserId);
    } catch (err) {
      setPending(previous);
      setError(errorMessage(err));
    }
  };

  const handleDeclinePending = async (senderId: string) => {
    const previous = pending;
    setPending((r) => r.filter((req) => req.senderId !== senderId));
    try {
      await deleteFriendRelation(currentUserId, senderId);
    } catch (err) {
      setPending(previous);
      setError(errorMessage(err));
    }
  };

  if (loading) {
    return <ActivityIndicator style={styles.loader} color={colors.action} />;
  }

  if (error) {
    return <Text style={styles.explainer}>{error}</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.suggestionsList}>
      {pending.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>Demandes reçues</Text>
          {pending.map((req) => (
            <View key={req.senderId} style={styles.suggestionRow}>
              <Pressable style={styles.pendingInfo} onPress={() => onSelectProfile(req.senderId)}>
                <Avatar url={req.senderAvatarUrl} name={req.senderPseudo} size={40} />
                <Text style={styles.suggestionPseudo}>{req.senderPseudo}</Text>
              </Pressable>
              <View style={styles.pendingActions}>
                <Pressable
                  style={styles.declinePill}
                  onPress={() => handleDeclinePending(req.senderId)}
                  hitSlop={8}
                >
                  <Text style={styles.declinePillText}>Refuser</Text>
                </Pressable>
                <Pressable
                  style={styles.acceptPill}
                  onPress={() => handleAcceptPending(req.senderId)}
                  hitSlop={8}
                >
                  <Text style={styles.acceptPillText}>Accepter</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {suggestions.length > 0 && <Text style={styles.sectionLabel}>Suggestions</Text>}
        </>
      )}

      {suggestions.length === 0 ? (
        pending.length === 0 ? (
          <Text style={styles.explainer}>
            Pas encore de suggestion — elles apparaissent à partir d'amis en commun avec les personnes que tu
            connais déjà.
          </Text>
        ) : null
      ) : (
        suggestions.map((s) => (
          <Pressable key={s.id} style={styles.suggestionRow} onPress={() => onSelectProfile(s.id)}>
            <Avatar url={s.avatarUrl} name={s.pseudo} size={40} />
            <View style={styles.suggestionInfo}>
              <Text style={styles.suggestionPseudo}>{s.pseudo}</Text>
              <Text style={styles.suggestionMutual}>
                {s.mutualCount} {s.mutualCount > 1 ? 'amis en commun' : 'ami en commun'}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function ScannerTab({
  currentUserId,
  onScannedProfile,
}: {
  currentUserId: string;
  onScannedProfile: (profileId: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<string | null>(null);
  // Un scan réussi navigue immédiatement (l'écran est démonté) — cette ref évite seulement de
  // déclencher deux fois pendant les quelques centaines de ms entre la détection et la navigation.
  const handledRef = useRef(false);

  /**
   * Incohérence constatée dans le code source d'`expo-camera` : sur web, le callback reçoit
   * `{ nativeEvent: { data } }` (vu dans `useWebBarcodeScanner.ts`), alors que la doc officielle
   * illustre un usage natif avec `{ data }` directement. Faute de pouvoir tester sur un vrai
   * appareil, on lit les deux formes plutôt que de parier sur une seule.
   */
  const handleBarcodeScanned = (event: { data?: string; nativeEvent?: { data?: string } }) => {
    if (handledRef.current) return;
    const data = event.data ?? event.nativeEvent?.data;
    if (!data || !data.startsWith(QR_PREFIX)) return;
    const profileId = data.slice(QR_PREFIX.length);
    if (!profileId) return;
    if (profileId === currentUserId) {
      setScanError('Ceci est ton propre code !');
      setTimeout(() => setScanError(null), 2500);
      return;
    }
    handledRef.current = true;
    onScannedProfile(profileId);
  };

  if (!permission) {
    return <ActivityIndicator style={styles.loader} color={colors.action} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.codeTab}>
        <Text style={styles.explainer}>Pokza a besoin d'accéder à la caméra pour scanner le code d'un ami.</Text>
        <Pressable style={styles.actionButton} onPress={requestPermission}>
          <Text style={styles.actionButtonText}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.cameraWrapper}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />
      {scanError && <Text style={styles.scanError}>{scanError}</Text>}
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  tabsRow: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: spacing.sm,
  },
  codeTab: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: spacing.lg,
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.12)',
    marginBottom: spacing.md,
  },
  explainer: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  actionButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  feedback: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  loader: {
    marginTop: spacing.lg,
  },
  cameraWrapper: {
    flex: 1,
    marginHorizontal: 14,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  camera: {
    flex: 1,
  },
  scanError: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    textAlign: 'center',
    color: '#fff',
    backgroundColor: 'rgba(22,35,61,0.85)',
    borderRadius: radius.md,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  suggestionsList: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  pendingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  declinePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  declinePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  acceptPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  acceptPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,35,61,0.15)',
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionPseudo: {
    ...typography.authorName,
    color: colors.textPrimary,
  },
  suggestionMutual: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
});
