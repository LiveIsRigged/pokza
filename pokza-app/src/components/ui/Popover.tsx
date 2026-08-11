import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Pressable, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/theme';

interface PopoverProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Largeur de la carte (défaut : compacte, plafonnée à la largeur de l'écran moins les marges). */
  width?: number;
  /** Hauteur max avant que le contenu ne défile (défaut : ~70% de l'écran). */
  maxHeight?: number;
}

const SCREEN = Dimensions.get('window');
/** Sous la barre d'actions du feed (cf. `FeedHeader` : paddingTop 48 + boutons ~42 + marge). */
const TOP_OFFSET = 92;
const SIDE_MARGIN = 12;

/**
 * Petit panneau déroulant ancré en haut à droite, sous les boutons 🔍 / 🔔 de la barre du feed :
 * il « descend » du coin (fondu + léger agrandissement depuis le haut-droite) plutôt que de monter
 * du bas comme une bottom-sheet — c'est de là que part l'action. Le feed reste visible derrière
 * (voile très léger) et un tap en dehors referme.
 */
export function Popover({ visible, onClose, children, width, maxHeight }: PopoverProps) {
  const anim = useRef(new Animated.Value(0)).current;
  // Rester monté le temps de l'animation de fermeture (sinon le panneau disparaît d'un coup).
  const [rendered, setRendered] = useState(visible);

  useEffect(() => {
    if (visible) setRendered(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 160,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });
  }, [visible, anim]);

  if (!rendered) return null;

  const cardWidth = Math.min(width ?? 360, SCREEN.width - SIDE_MARGIN * 2);
  const cardMaxHeight = maxHeight ?? Math.min(SCREEN.height * 0.7, 460);
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
            width: cardWidth,
            maxHeight: cardMaxHeight,
            opacity: anim,
            transform: [{ translateY }, { scale }],
            // Le panneau grandit depuis le coin haut-droite, sous le bouton cliqué.
            transformOrigin: 'top right',
          } as any,
        ]}
      >
        {children}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    // Voile très léger : on veut un effet « popover », le feed doit rester bien lisible derrière.
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  card: {
    position: 'absolute',
    top: TOP_OFFSET,
    right: SIDE_MARGIN,
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
});
