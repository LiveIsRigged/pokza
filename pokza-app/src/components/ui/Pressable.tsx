import React from 'react';
import {
  Pressable as RNPressable,
  type PressableProps,
  type PressableStateCallbackType,
  type StyleProp,
  type View,
  type ViewStyle,
} from 'react-native';

/**
 * `Pressable` de l'app — à importer d'ici, JAMAIS depuis `react-native` directement.
 *
 * Le `Pressable` de React Native ne donne AUCUN retour visuel au toucher, ni sur le web ni en
 * natif : son fichier source ne contient pas une seule fois le mot `opacity` (c'est l'ancien
 * `TouchableOpacity`, que l'app n'utilise nulle part, qui atténuait automatiquement). Résultat :
 * sur 193 éléments cliquables, un seul signalait qu'il avait été touché. Sur un réseau lent, rien
 * ne distingue « mon appui n'a pas été pris » de « l'écran met une seconde à s'ouvrir » — et le
 * réflexe est de rappuyer, donc de publier deux fois.
 *
 * Cette enveloppe donne le retour à tout le monde d'un coup, sans toucher aux 193 sites d'appel :
 * seule la ligne d'import change dans chaque fichier. C'est aussi le point unique où brancher
 * `android_ripple` le jour du passage en natif — sinon ce serait 193 endroits.
 */

/** Opacité pendant l'appui. Choisie avec Victor le 20/08 en comparant 0,8 / 0,6 / 0,5 : 0,6 reste
 *  perceptible en extérieur sans que les grandes surfaces (une carte de main entière) clignotent. */
export const PRESSED_OPACITY = 0.6;

// `forwardRef` obligatoire : plusieurs écrans posent une `ref` sur un Pressable pour ancrer un
// menu contextuel (bouton « ⋯ » d'une main, d'un profil, d'un groupe).
export const Pressable = React.forwardRef<View, PressableProps>(function Pressable(
  { style, ...props },
  ref,
) {
  // Un `style` passé sous forme de fonction signifie que l'appelant gère lui-même l'état pressé :
  // on le laisse faire plutôt que d'écraser son choix par le défaut.
  const handlesPressedItself = typeof style === 'function';

  return (
    <RNPressable
      ref={ref}
      {...props}
      style={(state: PressableStateCallbackType): StyleProp<ViewStyle> => {
        if (handlesPressedItself) {
          return (style as (s: PressableStateCallbackType) => StyleProp<ViewStyle>)(state);
        }
        return state.pressed ? [style, { opacity: PRESSED_OPACITY }] : style;
      }}
    />
  );
});
