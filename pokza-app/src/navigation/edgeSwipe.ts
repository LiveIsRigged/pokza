import { useMemo, useRef } from 'react';
import {
  PanResponder,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';

/** Largeur de la bande, collée au bord gauche de l'écran, où le glissement doit commencer : assez
 * large pour un pouce, assez étroite pour ne pas confisquer les gestes du contenu (défilement,
 * boutons). Valeur partagée par l'ouverture du menu (feed) et le retour arrière (autres écrans). */
export const EDGE_ZONE = 36;
/** Distance horizontale à parcourir pour déclencher — ou moins si le geste est vif (vélocité). */
export const TRIGGER_DISTANCE = 56;
export const FLICK_VELOCITY = 0.3;
/** Course horizontale minimale avant de confisquer le geste : en dessous, un simple tremblement de
 * pouce au début d'un défilement suffirait à voler le mouvement au contenu (qui ne le récupère plus). */
export const CLAIM_DISTANCE = 12;

/** Un geste est « horizontal » s'il avance deux fois plus en X qu'en Y — sinon c'est un défilement. */
export function isHorizontal(g: PanResponderGestureState) {
  return Math.abs(g.dx) > Math.abs(g.dy) * 2;
}

/** Abscisse du doigt, robuste multi-plateformes (même problème que `touchPageY` dans PullToRefresh) :
 * sur react-native-web `nativeEvent` est l'événement DOM brut, où `pageX` n'existe qu'au niveau de
 * chaque Touch, alors que RN natif le pose directement sur `nativeEvent`. En dernier recours on
 * renvoie l'infini : une position inconnue ne doit jamais passer pour un départ au bord de l'écran. */
export function touchPageX(e: GestureResponderEvent): number {
  const ne = e.nativeEvent as any;
  if (typeof ne.pageX === 'number') return ne.pageX;
  const t = ne.changedTouches?.[0] ?? ne.touches?.[0];
  return t ? t.pageX : Number.POSITIVE_INFINITY;
}

/**
 * Détecteur de glissement du bord gauche vers la droite. Sert à deux gestes symétriques et
 * mutuellement exclusifs selon l'écran : ouvrir le menu latéral (sur le feed) et revenir en arrière
 * (sur les écrans empilés, où il double la flèche ‹ Retour). À poser sur le conteneur de l'écran :
 * `<View {...useLeftEdgeSwipe(onTrigger).panHandlers}>`.
 *
 * Le test se fait en phase de CAPTURE (donc avant qu'un contenu défilable, qui occupe tout l'écran,
 * ne s'empare du mouvement), mais on ne confisque le geste que si le doigt part vraiment du bord ET
 * file vers la droite : un défilement vertical, même démarré au bord, continue d'aller au contenu.
 */
export function useLeftEdgeSwipe(onTrigger: () => void, enabled = true) {
  const onTriggerRef = useRef(onTrigger);
  onTriggerRef.current = onTrigger;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const fired = useRef(false);
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
          fired.current = false;
        },
        // On déclenche dès le seuil franchi, sans attendre le relâchement : sur le menu le panneau se
        // met à glisser pendant que le doigt continue, sur un écran empilé le retour part aussitôt.
        onPanResponderMove: (_e, g) => {
          if (fired.current) return;
          if (g.dx >= TRIGGER_DISTANCE || (g.dx > 24 && g.vx >= FLICK_VELOCITY)) {
            fired.current = true;
            onTriggerRef.current();
          }
        },
        // Le geste nous appartient : le contenu ne doit pas pouvoir le reprendre en cours de route.
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
}
