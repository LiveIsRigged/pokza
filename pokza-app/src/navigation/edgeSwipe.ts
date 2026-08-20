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
/** Distance horizontale à parcourir pour déclencher : environ un quart de la largeur d'un iPhone,
 * assez pour que le geste soit délibéré. */
export const TRIGGER_DISTANCE = 90;
/** Raccourci pour un geste vif : plus court, mais il faut alors une vraie vitesse (`FLICK_VELOCITY`).
 * Les deux conditions vont ensemble — une vitesse seule, sans distance minimale, se déclenchait sur
 * un simple ajustement de prise. */
export const FLICK_DISTANCE = 56;
export const FLICK_VELOCITY = 0.5;
/** Course horizontale minimale avant de confisquer le geste : en dessous, un simple tremblement de
 * pouce au début d'un défilement suffirait à voler le mouvement au contenu (qui ne le récupère plus). */
export const CLAIM_DISTANCE = 12;

/** Un geste est « horizontal » s'il avance deux fois plus en X qu'en Y — sinon c'est un défilement. */
export function isHorizontal(g: PanResponderGestureState) {
  return Math.abs(g.dx) > Math.abs(g.dy) * 2;
}

/**
 * Le geste est-il assez franc pour déclencher ? Ample, ou plus court mais nettement vif. Les deux
 * valeurs sont exprimées en positif : un geste vers la gauche (fermeture du menu) passe ses
 * `-dx`/`-vx`, ce qui garde exactement le même ressenti dans les deux sens.
 */
export function passesTriggerThreshold(distance: number, velocity: number): boolean {
  return distance >= TRIGGER_DISTANCE || (distance >= FLICK_DISTANCE && velocity >= FLICK_VELOCITY);
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
        // On attend le RELÂCHEMENT du doigt, et non le franchissement du seuil en cours de geste.
        // Déclencher en plein mouvement rendait l'action irrévocable dès 56 px parcourus (voire 24 px
        // à peine rapides) : un ajustement de prise ou un défilement légèrement diagonal parti du bord
        // suffisait à naviguer, sans aucun moyen de se raviser. En jugeant au relâchement, ramener le
        // doigt en arrière avant de lever annule le geste — c'est aussi ce que fait déjà la fermeture
        // du menu latéral (cf. `SideMenu`).
        onPanResponderRelease: (_e, g) => {
          if (passesTriggerThreshold(g.dx, g.vx)) onTriggerRef.current();
        },
        // Le geste nous appartient : le contenu ne doit pas pouvoir le reprendre en cours de route.
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
}
