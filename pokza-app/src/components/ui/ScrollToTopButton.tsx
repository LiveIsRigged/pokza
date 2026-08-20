import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from './Pressable';
import { borders, colors, iconMuted, radius } from '../../theme/theme';
import { ArrowUpIcon } from './icons';

interface ScrollToTopButtonProps {
  /** Piloté par la distance déjà parcourue dans le feed (cf. `handleFeedScroll` dans App). */
  visible: boolean;
  onPress: () => void;
}

/**
 * « Remonter en haut » du feed. En BAS À DROITE et non en haut : c'est là que le pouce est posé sur
 * un téléphone, et le haut de l'écran est déjà occupé par la barre d'actions fixe — une pastille
 * juste en dessous ferait une seconde bande dont on ne saurait pas si elle appartient à la barre ou
 * au feed. La flèche dit où l'on va, sa position dit où est le doigt.
 *
 * Volontairement discret : même beige que le feed, contour fin, flèche estompée. Il ne doit pas
 * concurrencer « + Créer une main », qui reste la seule couleur d'action de l'écran.
 *
 * Il remonte ET rafraîchit (cf. `handleScrollToTop`) : quand on revient en haut d'un feed, c'est
 * pour voir ce qui est arrivé depuis.
 *
 * Toujours monté, seule l'opacité bouge — sinon la disparition serait sèche. D'où le
 * `pointerEvents` : à opacité nulle, une vue continue d'attraper les appuis, et un bouton invisible
 * mangerait le coin de la dernière main affichée.
 */
export function ScrollToTopButton({ visible, onPress }: ScrollToTopButtonProps) {
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: false,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      style={[styles.wrapper, { opacity, bottom: insets.bottom + 16 }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Pressable style={styles.button} onPress={onPress} accessibilityLabel="Remonter en haut du feed et rafraîchir">
        <ArrowUpIcon size={18} color={iconMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    // Aligné sur la marge horizontale des cartes du feed (14), pour ne pas flotter de travers.
    right: 14,
  },
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.feedBackground,
    borderWidth: 1,
    borderColor: borders.default,
    // Ombre plus légère que celle des menus (0,18) : ce bouton se pose sur le feed, il ne s'en
    // détache pas comme une fenêtre. Sans elle, un rond beige sur fond beige disparaîtrait.
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
