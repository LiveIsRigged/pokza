import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  RefreshControl,
  ScrollView,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
} from 'react-native';
import { colors } from '../../theme/theme';

const THRESHOLD = 68; // distance de tirage (px) au-delà de laquelle on déclenche le rafraîchissement
const MAX_PULL = 108; // tirage maximum, pour un effet élastique borné
const RESISTANCE = 0.5; // freine le tirage (le doigt bouge deux fois plus que l'entête)

// Position verticale du doigt, robuste multi-plateformes. Sur react-native-web, `nativeEvent` est le
// TouchEvent DOM brut : `pageY` n'y figure pas au niveau de l'event, seulement sur chaque Touch
// (`changedTouches[0].pageY`). Sur natif, RN pose directement `nativeEvent.pageY`.
function touchPageY(e: GestureResponderEvent): number {
  const ne = e.nativeEvent as any;
  if (typeof ne.pageY === 'number') return ne.pageY;
  const t = ne.changedTouches?.[0] ?? ne.touches?.[0];
  return t ? t.pageY : 0;
}

interface PullToRefreshProps extends ScrollViewProps {
  refreshing: boolean;
  onRefresh: () => void;
  children: React.ReactNode;
}

/**
 * "Tirer pour rafraîchir" façon réseau social. Sur mobile natif, `RefreshControl` fait déjà tout
 * (rubber-band + spinner système). Sur le WEB en revanche, react-native-web ignore complètement
 * `RefreshControl` — le geste n'existe donc pas dans le navigateur du téléphone, où tourne pokza.app.
 * On le réimplémente à la main pour le web : au sommet du feed, un tirage vers le bas révèle un
 * spinner et déclenche le rechargement une fois le seuil franchi.
 *
 * `forwardRef` : le feed pose une `ref` dessus pour remonter tout en haut d'un coup (bouton ↑). Elle
 * doit atteindre le ScrollView RÉEL, pas cette enveloppe — sinon `scrollTo` n'existe pas dessus.
 */
export const PullToRefresh = React.forwardRef<ScrollView, PullToRefreshProps>(function PullToRefresh(
  { refreshing, onRefresh, children, ...scrollProps },
  ref,
) {
  if (Platform.OS !== 'web') {
    return (
      <ScrollView
        ref={ref}
        {...scrollProps}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <WebPullToRefresh ref={ref} refreshing={refreshing} onRefresh={onRefresh} {...scrollProps}>
      {children}
    </WebPullToRefresh>
  );
});

const WebPullToRefresh = React.forwardRef<ScrollView, PullToRefreshProps>(function WebPullToRefresh(
  { refreshing, onRefresh, children, ...scrollProps },
  ref,
) {
  // Hauteur animée de l'entête qui pousse le contenu vers le bas et abrite le spinner.
  const height = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(0);
  const startY = useRef(0);
  const pulling = useRef(false); // un geste de tirage est-il en cours (démarré tout en haut) ?
  const armed = useRef(false); // le seuil est-il franchi (relâcher = rafraîchir) ?

  // Neutralise le pull-to-refresh NATIF du navigateur (qui recharge la page entière) pendant qu'on
  // est sur le feed — sinon les deux gestes se marcheraient dessus sur Chrome Android.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement.style as any;
    const previous = root.overscrollBehaviorY;
    root.overscrollBehaviorY = 'contain';
    return () => {
      root.overscrollBehaviorY = previous;
    };
  }, []);

  // L'entête suit `refreshing` dans LES DEUX SENS : elle s'ouvre quand un rafraîchissement démarre,
  // se referme en douceur quand il finit. Elle ne se contentait de se refermer que parce que seul le
  // doigt pouvait la déclencher (`endPull` l'ouvrait lui-même) ; le bouton « remonter en haut »
  // rafraîchit aussi, et sans cela il n'aurait affiché aucun signe de chargement sur le web.
  useEffect(() => {
    Animated.timing(height, {
      toValue: refreshing ? THRESHOLD : 0,
      duration: refreshing ? 150 : 220,
      useNativeDriver: false,
    }).start();
  }, [refreshing, height]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
    scrollProps.onScroll?.(e);
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    startY.current = touchPageY(e);
    // On n'arme un tirage que si on part réellement du sommet et qu'aucun refresh n'est en cours.
    pulling.current = scrollY.current <= 0 && !refreshing;
    armed.current = false;
  };

  const handleTouchMove = (e: GestureResponderEvent) => {
    if (!pulling.current) return;
    const dy = touchPageY(e) - startY.current;
    // Garde-fou : jamais de valeur non finie vers l'Animated (sinon opacity/height deviennent NaN).
    if (!Number.isFinite(dy) || dy <= 0) {
      height.setValue(0);
      armed.current = false;
      return;
    }
    const dist = Math.min(dy * RESISTANCE, MAX_PULL);
    height.setValue(dist);
    armed.current = dist >= THRESHOLD;
  };

  const endPull = () => {
    if (!pulling.current) return;
    pulling.current = false;
    if (armed.current && !refreshing) {
      armed.current = false;
      // On maintient l'entête ouverte au seuil pendant le chargement, puis l'effet ci-dessus la
      // referme quand `refreshing` retombe à false.
      Animated.timing(height, { toValue: THRESHOLD, duration: 150, useNativeDriver: false }).start();
      onRefresh();
    } else {
      Animated.timing(height, { toValue: 0, duration: 150, useNativeDriver: false }).start();
    }
  };

  return (
    <ScrollView
      ref={ref}
      {...scrollProps}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={endPull}
      onTouchCancel={endPull}
    >
      {/* L'entête grandit avec le tirage ; `overflow:hidden` révèle progressivement le spinner —
          pas besoin d'animer l'opacité (source d'un NaN transitoire au premier rendu). */}
      <Animated.View style={{ height, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <ActivityIndicator color={colors.action} />
      </Animated.View>
      {children}
    </ScrollView>
  );
});
