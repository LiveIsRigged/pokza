import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/theme';
import { Avatar } from './Avatar';

const PANEL_WIDTH = 288;

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

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
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
