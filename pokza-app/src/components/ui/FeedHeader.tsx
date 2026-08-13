import React from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../theme/theme';
import { ChipStackIcon } from './ChipStackIcon';

interface FeedHeaderProps {
  /** 0 = déployé (haut du feed), 1 = compact (feed défilé). Piloté par le scroll dans App. */
  compact: Animated.Value;
  onOpenMenu: () => void;
  onCreate: () => void;
  onSearch: () => void;
  onNotifications: () => void;
  unreadCount: number;
}

/**
 * Barre d'actions FIXE en haut du feed (créer · recherche · notifications) : elle ne défile plus
 * avec le contenu, donc reste accessible en permanence. Au défilement, elle se "compacte"
 * légèrement — on resserre seulement les marges verticales de la barre, le design des boutons ne
 * change pas (« + Créer une main » garde son libellé). Un fin séparateur apparaît une fois défilé
 * pour détacher la barre du feed.
 *
 * Le menu latéral s'ouvre de DEUX façons : le bouton ☰ ci-dessous (repli visible, indispensable sur
 * desktop) et le glissement du bord gauche vers le centre (cf. `useMenuEdgeSwipe` dans SideMenu),
 * plus naturel sur mobile.
 */
export function FeedHeader({ compact, onOpenMenu, onCreate, onSearch, onNotifications, unreadCount }: FeedHeaderProps) {
  // On décolle la barre de la zone système avec l'inset réel (0 sur le web / la PWA en bande blanche,
  // > 0 en natif), plus un petit confort visuel (22 déployé, 14 une fois défilé).
  const insets = useSafeAreaInsets();
  const paddingTop = compact.interpolate({ inputRange: [0, 1], outputRange: [insets.top + 22, insets.top + 14] });
  const paddingBottom = compact.interpolate({ inputRange: [0, 1], outputRange: [12, 8] });
  const dividerOpacity = compact.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  return (
    <Animated.View style={[styles.header, { paddingTop, paddingBottom }]}>
      <View style={styles.row}>
        <Pressable style={styles.menuButton} onPress={onOpenMenu} hitSlop={8}>
          <ChipStackIcon />
        </Pressable>
        <Pressable style={styles.createButton} onPress={onCreate}>
          <Text style={styles.createButtonText}>+ Créer une main</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onSearch} hitSlop={8}>
          <Text style={styles.iconButtonText}>🔍</Text>
        </Pressable>
        <Pressable style={styles.iconButton} onPress={onNotifications} hitSlop={8}>
          <Text style={styles.iconButtonText}>🔔</Text>
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>
      <Animated.View style={[styles.divider, { opacity: dividerOpacity }]} pointerEvents="none" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 14,
    backgroundColor: colors.feedBackground,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createButton: {
    flex: 1,
    backgroundColor: colors.action,
    borderRadius: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  iconButton: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    position: 'relative',
  },
  iconButtonText: {
    fontSize: 15,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  menuButton: {
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(22,35,61,0.14)',
  },
});
