import { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder } from 'react-native';

/** Course / vélocité au-delà desquelles on ferme plutôt que de revenir en place (façon bottom-sheet). */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 0.6;

/** À poser sur la zone de préhension : `userSelect:'none'` empêche la sélection de texte du navigateur
 * pendant qu'on tire la feuille vers le bas (sans effet sur mobile natif). Casté car absent des types
 * `ViewStyle` de React Native (prop web-only servie par react-native-web). */
export const sheetGrabStyle = { userSelect: 'none' } as any;

/**
 * Glisser-vers-le-bas pour fermer une bottom-sheet (Modal `animationType="slide"`). Câblage :
 *
 *   const { dragY, grabHandlers } = useSheetDismiss(visible, onClose);
 *   <Animated.View style={[styles.sheet, { transform: [{ translateY: dragY }] }]}>
 *     <View style={sheetGrabStyle} {...grabHandlers}>… poignée + titre + croix …</View>
 *     … contenu défilable …
 *   </Animated.View>
 *
 * La zone de préhension est le bandeau du haut ; le contenu défilable dessous garde son scroll. Le
 * geste ne se déclenche que sur un vrai glissement vers le bas — les taps (croix incluse) restent OK.
 */
export function useSheetDismiss(visible: boolean, onClose: () => void) {
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const grabHandlers = useMemo(
    () =>
      PanResponder.create({
        // Nécessaire pour que react-native-web installe le suivi en phase capture (sans lui, le
        // `...Capture` de MOVE ci-dessous n'est jamais consulté). false → ne vole aucun tap.
        onStartShouldSetPanResponderCapture: () => false,
        // Phase CAPTURE, sur MOVE seulement : on prend la main sur un vrai glissement vers le bas
        // AVANT que les `Text` du bandeau ne déclenchent une sélection de texte (artefact web).
        onMoveShouldSetPanResponderCapture: (_e, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => {
          if (g.dy > 0) dragY.setValue(g.dy);
        },
        onPanResponderRelease: (_e, g) => {
          if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
            // Glisse la feuille hors de l'écran puis démonte la modale (dont la sortie animée prend
            // le relais), et remet `dragY` à zéro pour une réouverture propre.
            Animated.timing(dragY, { toValue: 900, duration: 160, useNativeDriver: true }).start(() => {
              onCloseRef.current();
              dragY.setValue(0);
            });
          } else {
            Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
          }
        },
        onPanResponderTerminationRequest: () => false,
      }).panHandlers,
    [dragY],
  );

  // Réouverture toujours à la position ouverte, même si la fermeture précédente s'est faite au tap
  // sur la croix ou le fond (sans passer par l'animation de glissement ci-dessus).
  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible, dragY]);

  return { dragY, grabHandlers };
}
