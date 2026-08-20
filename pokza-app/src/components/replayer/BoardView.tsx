import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Card, GameType } from '../../types/poker';
import { colors } from '../../theme/theme';
import { boardCardSize } from '../../engine/layout';
import { CardView } from './CardView';
import { ChipsView } from './ChipsView';

interface BoardViewProps {
  cards: Card[];
  /** Second board (double board bomb pot) — affiché sous le premier. Absent = un seul board. */
  cards2?: Card[];
  pot: number;
  /** Une part de pot qui file vers un vainqueur : sa position (relative au centre de la table) et son
   * MONTANT explicite. Tableau vide tant que la main n'est pas résolue (la pastille reste alors
   * immobile, montant complet). Les montants sont fournis tels quels (plutôt que recalculés en parts
   * égales) car un double board partage rarement à égalité — ex : un board gagné seul (0,5 du pot) +
   * un board partagé (0,25 chacun). */
  winnerShares: { x: number; y: number; amount: number }[];
  gameType?: GameType;
  /** Largeur de la table : sert à dimensionner les cartes pour qu'elles ne débordent jamais sur les sièges. */
  tableWidth?: number;
  /** Main terminée sans vainqueur déterminable (Hero couché et cartes adverses non saisies) : la
   *  relecture s'arrêtait alors sur un pot figé au centre, sans rien dire — ce qui ressemble à un
   *  chargement bloqué plutôt qu'à un état normal. */
  unresolved?: boolean;
  /** Décalage vertical (cf. `boardVerticalOffset`) pour recentrer le bloc board+pot entre BB et Hero. */
  verticalOffset?: number;
  bb: number;
  useBB?: boolean;
}

const CARD_GAP = 4;

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

/** Une rangée de 5 emplacements de board (cartes révélées ou trous vides). */
function BoardRow({
  cards,
  cardWidth,
  cardHeight,
  style,
}: {
  cards: Card[];
  cardWidth: number;
  cardHeight: number;
  style?: object;
}) {
  return (
    <View style={[styles.cardsRow, { gap: CARD_GAP }, style]}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={{ width: cardWidth, height: cardHeight }}>
          {cards[i] ? <CardView card={cards[i]} width={cardWidth} height={cardHeight} /> : null}
        </View>
      ))}
    </View>
  );
}

export function BoardView({
  cards,
  cards2,
  pot,
  winnerShares,
  unresolved = false,
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
  const doubleBoard = Boolean(cards2);

  return (
    <View style={[styles.wrapper, { transform: [{ translateY: verticalOffset }] }]} pointerEvents="none">
      <View style={styles.chipsFloat}>
        {winnerShares.length === 0 ? (
          <ChipsView amount={pot} gameType={gameType} isWinning={false} bb={bb} useBB={useBB} />
        ) : (
          winnerShares.map((share, i) => (
            <PotShare
              key={i}
              amount={share.amount}
              gameType={gameType}
              bb={bb}
              useBB={useBB}
              target={{ x: share.x, y: share.y }}
            />
          ))
        )}
      </View>

      <BoardRow cards={cards} cardWidth={cardWidth} cardHeight={cardHeight} />
      {doubleBoard && (
        <BoardRow cards={cards2!} cardWidth={cardWidth} cardHeight={cardHeight} style={styles.secondBoard} />
      )}

      {unresolved && (
        <View style={styles.noteFloat}>
          <Text style={styles.noteText}>Mains non révélées</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  // Flottant comme la pastille de pot, en miroir sous le board : la note ne doit rien pousser, la
  // hauteur d'une carte de main est déjà comptée au pixel près.
  noteFloat: {
    position: 'absolute',
    top: '100%',
    width: '100%',
    alignItems: 'center',
    marginTop: 6,
  },
  noteText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: colors.textOnFeltMuted,
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
  // Le second board se pose juste sous le premier, avec un petit écart pour bien les distinguer.
  secondBoard: {
    marginTop: 6,
  },
});
