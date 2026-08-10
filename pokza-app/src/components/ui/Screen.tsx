import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors } from '../../theme/theme';
import { useLeftEdgeSwipe } from '../../navigation/edgeSwipe';

interface ScreenProps {
  children: React.ReactNode;
  /**
   * Action de retour de l'écran. Quand elle est fournie, un glissement du bord gauche vers la droite
   * la déclenche — exactement comme le bouton ‹ Retour affiché dans l'écran (geste classique des
   * réseaux sociaux). Omise = pas de retour possible (le geste est inerte).
   */
  onBack?: () => void;
  style?: ViewStyle;
}

/**
 * Conteneur plein écran des écrans empilés (tout sauf le feed racine). Reprend le fond et le `flex`
 * du conteneur historique de `App.tsx`, en y ajoutant le retour au glissement. Le feed, lui, garde
 * son propre conteneur : le même geste y ouvre le menu latéral au lieu de revenir en arrière.
 */
export function Screen({ children, onBack, style }: ScreenProps) {
  const backSwipe = useLeftEdgeSwipe(onBack ?? (() => {}), !!onBack);
  return (
    <View style={[styles.container, style]} {...backSwipe.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
});
