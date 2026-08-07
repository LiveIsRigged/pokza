import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { Avatar } from './Avatar';

const PANEL_WIDTH = 288;
/** Largeur de la bande, collée au bord gauche de l'écran, où le glissement d'ouverture doit
 * commencer : assez large pour un pouce, assez étroite pour ne pas confisquer les gestes du feed. */
const EDGE_ZONE = 36;
/** Distance horizontale à parcourir pour ouvrir/fermer — ou moins si le geste est vif (vélocité). */
const TRIGGER_DISTANCE = 56;
const FLICK_VELOCITY = 0.3;

/** Course horizontale minimale avant de confisquer le geste : en dessous, un simple tremblement de
 * pouce au début d'un défilement suffirait à voler le mouvement au feed (qui ne le récupère plus). */
const CLAIM_DISTANCE = 12;
/** Un geste est « horizontal » s'il avance deux fois plus en X qu'en Y — sinon c'est un défilement. */
function isHorizontal(g: PanResponderGestureState) {
  return Math.abs(g.dx) > Math.abs(g.dy) * 2;
}

/** Abscisse du doigt, robuste multi-plateformes (même problème que `touchPageY` dans PullToRefresh) :
 * sur react-native-web `nativeEvent` est l'événement DOM brut, où `pageX` n'existe qu'au niveau de
 * chaque Touch, alors que RN natif le pose directement sur `nativeEvent`. En dernier recours on
 * renvoie l'infini : une position inconnue ne doit jamais passer pour un départ au bord de l'écran. */
function touchPageX(e: GestureResponderEvent): number {
  const ne = e.nativeEvent as any;
  if (typeof ne.pageX === 'number') return ne.pageX;
  const t = ne.changedTouches?.[0] ?? ne.touches?.[0];
  return t ? t.pageX : Number.POSITIVE_INFINITY;
}

/**
 * Ouverture du menu en glissant du bord gauche vers le centre. À poser sur le conteneur de l'écran :
 * `<View {...useMenuEdgeSwipe(open, !menuOpen).panHandlers}>`.
 *
 * Le test se fait en phase de CAPTURE (donc avant que le feed, qui occupe tout l'écran, ne s'empare
 * du mouvement), mais on ne confisque le geste que si le doigt part vraiment du bord ET file vers la
 * droite : un défilement vertical, même démarré au bord, continue d'aller au feed.
 */
export function useMenuEdgeSwipe(onOpen: () => void, enabled = true) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const opened = useRef(false);
  const startX = useRef(Number.POSITIVE_INFINITY);

  return useMemo(
    () =>
      PanResponder.create({
        // `gestureState.x0` n'est renseigné qu'au moment où l'on s'empare du geste (il vaut 0 avant),
        // il ne dit donc PAS d'où part le doigt : on note l'abscisse de départ nous-mêmes ici. Ce
        // test ne confisque rien — il renvoie toujours false, les taps restent intacts.
        onStartShouldSetPanResponderCapture: (e) => {
          startX.current = touchPageX(e);
          return false;
        },
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          enabledRef.current && startX.current <= EDGE_ZONE && g.dx > CLAIM_DISTANCE && isHorizontal(g),
        onPanResponderGrant: () => {
          opened.current = false;
        },
        // On ouvre dès le seuil franchi, sans attendre le relâchement : le panneau se met à glisser
        // pendant que le doigt continue, ce qui donne la sensation de le tirer.
        onPanResponderMove: (_e, g) => {
          if (opened.current) return;
          if (g.dx >= TRIGGER_DISTANCE || (g.dx > 24 && g.vx >= FLICK_VELOCITY)) {
            opened.current = true;
            onOpenRef.current();
          }
        },
        // Le geste nous appartient : le feed ne doit pas pouvoir le reprendre en cours de route.
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
}

export interface SideMenuItem {
  label: string;
  icon: string;
  onPress: () => void;
  /** Pastille de comptage affichée à droite (invitations en attente, etc.). */
  badge?: number;
}

interface SideMenuProps {
  visible: boolean;
  displayName: string;
  avatarUrl?: string;
  /** Entrées additionnelles ("Mes groupes"…) — le menu est fait pour accueillir tout ce qui ne
   * mérite pas une place permanente dans la barre du haut. */
  items?: SideMenuItem[];
  onClose: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
}

export function SideMenu({
  visible,
  displayName,
  avatarUrl,
  items = [],
  onClose,
  onOpenProfile,
  onSignOut,
}: SideMenuProps) {
  const anim = useRef(new Animated.Value(0)).current;
  // Le panneau doit rester monté pendant l'animation de fermeture, sinon il disparaît d'un coup
  // au lieu de glisser vers la gauche.
  const [rendered, setRendered] = useState(visible);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  // Pendant de l'ouverture au doigt : glisser le panneau vers la gauche le referme. Rien n'est posé
  // sur `onStart…`, donc les entrées du menu restent cliquables comme avant.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => g.dx < -CLAIM_DISTANCE && isHorizontal(g),
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -TRIGGER_DISTANCE || g.vx <= -FLICK_VELOCITY) onCloseRef.current();
        },
      }),
    [],
  );

  useEffect(() => {
    if (visible) setRendered(true);
    // Rouvrir le menu doit toujours retomber sur l'entrée normale, pas sur une confirmation
    // laissée ouverte lors d'une fermeture précédente (tap en dehors du menu, par exemple).
    if (!visible) setConfirmingSignOut(false);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });
  }, [visible, anim]);

  if (!rendered) return null;

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [-PANEL_WIDTH, 0],
  });

  return (
    <View style={StyleSheet.absoluteFill as any} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]} {...closeSwipe.panHandlers}>
        <Pressable style={styles.profileCard} onPress={onOpenProfile}>
          <Avatar url={avatarUrl} name={displayName} size={44} />
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.profileHint}>Voir mon profil</Text>
          </View>
        </Pressable>

        {items.map((item) => (
          <Pressable key={item.label} style={styles.row} onPress={item.onPress}>
            <Text style={styles.rowIcon}>{item.icon}</Text>
            <Text style={styles.rowLabel}>{item.label}</Text>
            {item.badge != null && item.badge > 0 && (
              <View style={styles.rowBadge}>
                <Text style={styles.rowBadgeText}>{item.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}

        <View style={styles.spacer} />

        {!confirmingSignOut ? (
          <Pressable style={styles.row} onPress={() => setConfirmingSignOut(true)}>
            <Text style={styles.rowIcon}>⏻</Text>
            <Text style={styles.rowLabelMuted}>Déconnexion</Text>
          </Pressable>
        ) : (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmText}>Se déconnecter ?</Text>
            <View style={styles.confirmButtonsRow}>
              <Pressable onPress={() => setConfirmingSignOut(false)} hitSlop={8}>
                <Text style={styles.confirmCancel}>Non</Text>
              </Pressable>
              <Pressable onPress={onSignOut} hitSlop={8}>
                <Text style={styles.confirmConfirm}>Oui, déconnecter</Text>
              </Pressable>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(14,24,48,0.4)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: PANEL_WIDTH,
    backgroundColor: '#FFFFFF',
    paddingTop: 50,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(22,35,61,0.08)',
    marginBottom: spacing.sm,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    ...typography.authorName,
    color: colors.textPrimary,
  },
  profileHint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  rowIcon: {
    fontSize: 17,
    width: 24,
    textAlign: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowLabelMuted: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  rowBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  spacer: {
    flex: 1,
  },
  confirmRow: {
    paddingVertical: 14,
    paddingHorizontal: spacing.xs,
    gap: spacing.sm,
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: spacing.md,
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
});
