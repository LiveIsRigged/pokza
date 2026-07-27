import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { Card, GameType } from '../../types/poker';
import { colors } from '../../theme/theme';
import { boardCardSize } from '../../engine/layout';
import { CardView } from './CardView';
import { ChipsView } from './ChipsView';

interface BoardViewProps {
  cards: Card[];
  pot: number;
  /** Coordonnées (relatives au centre de la table) d'un vainqueur, une entrée par vainqueur —
   * tableau vide si la main n'est pas encore résolue (la pastille reste alors immobile, montant
   * complet). Plusieurs entrées = split pot : le montant se répartit à parts égales (le reste va
   * aux premiers vainqueurs de la liste) entre autant de pastilles, chacune filant vers SON
   * vainqueur plutôt qu'une seule pastille vers un seul gagnant arbitraire. */
  winnerTargets: { x: number; y: number }[];
  gameType?: GameType;
  /** Largeur de la table : sert à dimensionner les cartes pour qu'elles ne débordent jamais sur les sièges. */
  tableWidth?: number;
  /** Décalage vertical (cf. `boardVerticalOffset`) pour recentrer le bloc board+pot entre BB et Hero. */
  verticalOffset?: number;
  bb: number;
  useBB?: boolean;
}

const CARD_GAP = 4;

/** Répartit `pot` en `n` parts dont la somme vaut exactement `pot` (le reste va aux premières
 * parts) — un vrai split pot ne perd jamais d'unité par arrondi. En cash game l'unité est le
 * centime (montant réel, potentiellement fractionnaire) ; en tournoi c'est le jeton entier. */
function potShares(pot: number, n: number, gameType: GameType): number[] {
  if (n <= 0) return [];
  const unit = gameType === 'cash' ? 100 : 1;
  const totalUnits = Math.round(pot * unit);
  const baseUnits = Math.floor(totalUnits / n);
  const remainderUnits = totalUnits - baseUnits * n;
  return Array.from({ length: n }, (_, i) => (baseUnits + (i < remainderUnits ? 1 : 0)) / unit);
}

// Une part du pot qui file vers UN vainqueur. Composant à part (plutôt qu'une boucle de hooks dans
// `BoardView`) car chaque part a besoin de ses propres valeurs animées indépendantes — le nombre de
// parts varie d'une main à l'autre, impossible à connaître à l'avance pour des hooks au top-level.
function PotShare({
  amount,
  gameType,
  bb,
  useBB,
  target,
}: {
  amount: number;
  gameType: GameType;
  bb: number;
  useBB: boolean;
  target: { x: number; y: number };
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: target.x, duration: 800, useNativeDriver: false }),
      Animated.timing(translateY, { toValue: target.y, duration: 800, useNativeDriver: false }),
      Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: false }),
    ]).start();
    // Une part ne change jamais de cible après coup (la main est déjà résolue) : anime une seule
    // fois au montage, pas besoin de dépendre de `target`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[styles.potShareWrapper, { transform: [{ translateX }, { translateY }], opacity }]}>
      <ChipsView amount={amount} gameType={gameType} isWinning bb={bb} useBB={useBB} />
    </Animated.View>
  );
}

export function BoardView({
  cards,
  pot,
  winnerTargets,
  gameType = 'cash',
  tableWidth = 0,
  verticalOffset = 0,
  bb,
  useBB = false,
}: BoardViewProps) {
  // Les 5 cartes ne doivent jamais déborder sur les badges des sièges latéraux : on les
  // dimensionne à partir de la largeur réelle de la table plutôt qu'une taille fixe (même formule
  // que `SeatView`, via `boardCardSize`, pour que les deux calculs restent synchronisés).
  const { width: cardWidth, height: cardHeight } = boardCardSize(tableWidth);
  const shares = potShares(pot, winnerTargets.length, gameType);

  return (
    <View style={[styles.wrapper, { transform: [{ translateY: verticalOffset }] }]} pointerEvents="none">
      <View style={styles.chipsFloat}>
        {winnerTargets.length === 0 ? (
          <ChipsView amount={pot} gameType={gameType} isWinning={false} bb={bb} useBB={useBB} />
        ) : (
          winnerTargets.map((target, i) => (
            <PotShare key={i} amount={shares[i]} gameType={gameType} bb={bb} useBB={useBB} target={target} />
          ))
        )}
      </View>

      <View style={[styles.cardsRow, { gap: CARD_GAP }]}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ width: cardWidth, height: cardHeight }}>
            {cards[i] ? <CardView card={cards[i]} width={cardWidth} height={cardHeight} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  chipsFloat: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 0,
    width: '100%',
    alignItems: 'center',
    zIndex: 10,
  },
  // Chaque part démarre superposée aux autres, pile à l'emplacement normal de la pastille — le
  // positionnement absolu (plutôt que des frères en flux normal, qui s'empileraient verticalement
  // au repos) garantit qu'elles partent bien toutes du MÊME point avant de diverger.
  potShareWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cardsRow: {
    flexDirection: 'row',
  },
});
