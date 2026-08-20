import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/theme';
import type { IconProps } from './icons';

/** Rouge des actions destructrices, partagé par le libellé et son icône. */
const DESTRUCTIVE = '#C0392B';

export interface OverflowMenuItem {
  label: string;
  /** Composant d'icône (cf. `icons.tsx`) ; le menu impose taille et couleur, cette dernière
   *  passant au rouge sur une entrée destructrice pour s'accorder au libellé. */
  icon?: React.ComponentType<IconProps>;
  /** Style « attention » (rouge) pour les actions sensibles : bloquer, signaler, supprimer… */
  destructive?: boolean;
  onPress: () => void;
}

/** Position à l'écran du bouton « ⋯ » qui a ouvert le menu (via `measureInWindow`). Le panneau se
 * cale juste dessous, aligné à droite sur ce bouton. */
export interface OverflowAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SCREEN = Dimensions.get('window');
const SIDE_MARGIN = 12;
const MENU_WIDTH = 210;

/**
 * Petit panneau déroulant ancré juste sous le « ⋯ » qui l'a ouvert (façon menu contextuel discret),
 * plutôt qu'une grande feuille montant du bas. Il grandit depuis son coin haut-droite (fondu + léger
 * agrandissement), le contenu derrière reste bien lisible (voile très léger) et un tap en dehors
 * referme. Réutilisé partout où on propose Modifier/Supprimer ou Signaler/Bloquer (carte de main,
 * profil). Choisir une action ferme d'abord le menu PUIS déclenche l'action, pour éviter qu'une
 * modale ouverte par l'action se retrouve masquée par le menu resté au-dessus.
 */
export function OverflowMenu({
  visible,
  onClose,
  items,
  anchor,
}: {
  visible: boolean;
  onClose: () => void;
  items: OverflowMenuItem[];
  anchor?: OverflowAnchor | null;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  // Rester monté le temps de l'animation de fermeture (sinon le panneau disparaît d'un coup).
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) setRendered(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 150,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });
  }, [visible, anim]);

  if (!rendered) return null;

  // Aligné à droite sur le bouton, juste en dessous. Bornes de sécurité pour ne jamais déborder de
  // l'écran (si le bouton est près d'un bord ou si l'ancre manque, on retombe en haut à droite).
  const right = anchor
    ? Math.max(SIDE_MARGIN, SCREEN.width - (anchor.x + anchor.width))
    : SIDE_MARGIN;
  const top = anchor ? anchor.y + anchor.height + 4 : 60;

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] });
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [-6, 0] });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.card,
          {
            width: MENU_WIDTH,
            top,
            right,
            opacity: anim,
            transform: [{ translateY }, { scale }],
            transformOrigin: 'top right',
          } as any,
        ]}
      >
        {items.map((item, i) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={i}
              style={[styles.item, i > 0 && styles.itemBorder]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              <View style={styles.itemIcon}>
                {Icon && <Icon size={18} color={item.destructive ? DESTRUCTIVE : colors.textPrimary} />}
              </View>
              <Text style={[styles.itemLabel, item.destructive && styles.itemDestructive]}>{item.label}</Text>
            </Pressable>
          );
        })}
        <Pressable style={[styles.item, styles.itemBorder]} onPress={onClose}>
          <View style={styles.itemIcon} />
          <Text style={[styles.itemLabel, styles.cancelLabel]}>Annuler</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    // Voile très léger : effet « popover », le contenu doit rester bien lisible derrière.
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  card: {
    position: 'absolute',
    backgroundColor: colors.feedBackground,
    borderRadius: radius.lg,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22,35,61,0.12)',
  },
  itemIcon: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  itemDestructive: {
    color: DESTRUCTIVE,
  },
  cancelLabel: {
    color: colors.textSecondary,
  },
});
