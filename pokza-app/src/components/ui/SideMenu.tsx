import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { borders, colors, radius, spacing, typography } from '../../theme/theme';
import {
  CLAIM_DISTANCE,
  isHorizontal,
  passesTriggerThreshold,
  useLeftEdgeSwipe,
} from '../../navigation/edgeSwipe';
import { Avatar } from './Avatar';
import { ConfirmSheet } from './ConfirmSheet';
import { PowerIcon, type IconProps } from './icons';

const PANEL_WIDTH = 288;
/** Taille commune des icônes de ligne, pour que le menu reste régulier. */
const ROW_ICON_SIZE = 21;

/**
 * Ouverture du menu en glissant du bord gauche vers le centre. À poser sur le conteneur du feed :
 * `<View {...useMenuEdgeSwipe(open, !menuOpen).panHandlers}>`. Alias du détecteur de bord partagé
 * (cf. `useLeftEdgeSwipe`), que le retour arrière des écrans empilés réutilise à l'identique.
 */
export const useMenuEdgeSwipe = useLeftEdgeSwipe;

export interface SideMenuItem {
  label: string;
  /** Composant d'icône (cf. `icons.tsx`), pas un emoji : c'est l'appelant qui choisit le dessin,
   *  le menu impose la taille et la couleur pour que toutes les lignes restent alignées. */
  icon: React.ComponentType<IconProps>;
  onPress: () => void;
  /** Pastille de comptage affichée à droite (invitations en attente, etc.). */
  badge?: number;
  /**
   * Intitulé de section : un filet et ce libellé s'insèrent AU-DESSUS de la première entrée qui le
   * porte. Sert à détacher les outils d'administration des fonctions sociales dans le menu du
   * fondateur — sans cela, « Modération » s'enchaînait à « Réglages » comme s'il s'agissait du même
   * registre. Les entrées sans section restent groupées en tête, sans en-tête ni filet.
   */
  section?: string;
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
        // Mêmes seuils que l'ouverture, en miroir : on passe les valeurs en positif. L'ancienne
        // règle refermait le menu sur la seule vitesse, sans distance minimale — un effleurement
        // vers la gauche suffisait.
        onPanResponderRelease: (_e, g) => {
          if (passesTriggerThreshold(-g.dx, -g.vx)) onCloseRef.current();
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
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: anim }]}
        {...closeSwipe.panHandlers}
      >
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]} {...closeSwipe.panHandlers}>
        <Text style={styles.brandTitle}>Pokza</Text>

        <Pressable style={styles.profileCard} onPress={onOpenProfile}>
          <Avatar url={avatarUrl} name={displayName} size={44} />
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.profileHint}>Voir mon profil</Text>
          </View>
        </Pressable>

        {items.map((item, i) => {
          const Icon = item.icon;
          // En-tête affiché seulement sur la PREMIÈRE entrée d'une section : les suivantes se
          // rattachent silencieusement à celle du dessus.
          const startsSection = item.section != null && item.section !== items[i - 1]?.section;
          return (
            <React.Fragment key={item.label}>
              {startsSection && (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionLabel}>{item.section}</Text>
                </View>
              )}
              <Pressable style={styles.row} onPress={item.onPress}>
                <View style={styles.rowIcon}>
                  <Icon size={ROW_ICON_SIZE} color={colors.textPrimary} />
                </View>
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.badge != null && item.badge > 0 && (
                  <View style={styles.rowBadge}>
                    <Text style={styles.rowBadgeText}>{item.badge}</Text>
                  </View>
                )}
              </Pressable>
            </React.Fragment>
          );
        })}

        <View style={styles.spacer} />

        <Pressable style={styles.row} onPress={() => setConfirmingSignOut(true)}>
          <View style={styles.rowIcon}>
            <PowerIcon size={ROW_ICON_SIZE} color={colors.textSecondary} />
          </View>
          <Text style={styles.rowLabelMuted}>Déconnexion</Text>
        </Pressable>
      </Animated.View>

      <ConfirmSheet
        visible={confirmingSignOut}
        icon={PowerIcon}
        title="Se déconnecter ?"
        confirmLabel="Déconnexion"
        destructive={false}
        onCancel={() => setConfirmingSignOut(false)}
        onConfirm={() => {
          setConfirmingSignOut(false);
          onSignOut();
        }}
      />
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
    backgroundColor: colors.feedBackground,
    paddingTop: 46,
    paddingHorizontal: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 4, height: 0 },
    elevation: 12,
  },
  brandTitle: {
    fontSize: 25,
    fontWeight: '700',
    color: colors.action,
    marginBottom: spacing.md,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: borders.subtle,
    borderBottomWidth: 1,
    borderBottomColor: borders.subtle,
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
  // Filet puis intitulé : même traitement que les intitulés de section de l'écran Réglages, pour
  // que « section » veuille dire la même chose partout dans l'app.
  sectionHeader: {
    borderTopWidth: 1,
    borderTopColor: borders.subtle,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // Gouttière fixe : les icônes n'ont pas toutes la même largeur apparente, une boîte commune garde
  // les libellés parfaitement alignés d'une ligne à l'autre.
  rowIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
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
});
