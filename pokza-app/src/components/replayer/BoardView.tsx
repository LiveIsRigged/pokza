import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import type { Card, GameType } from '../../types/poker';
import { colors } from '../../theme/theme';
import { boardCardSize, GABARIT_FEED, type Gabarit } from '../../engine/layout';
import { CardView } from './CardView';
import { Pressable } from '../ui/Pressable';
import { ChipsView } from './ChipsView';
import type { CodeDevise } from '../../utils/currency';

interface BoardViewProps {
  /**
   * Les cartes du board, dans l'ordre. Un TROU (`undefined`) dans la longueur fournie est une carte
   * ATTENDUE : elle se dessine en pointillés, à sa place. C'est ce qui permet au créateur de
   * montrer « il manque le turn » sur le feutre plutôt que dans un formulaire sous la table.
   * Le replayer, lui, ne passe que des cartes déjà révélées : il n'a jamais de trou, et les
   * emplacements au-delà de la longueur restent vides comme avant.
   */
  cards: (Card | undefined)[];
  /** Second board (double board bomb pot) — affiché sous le premier. Absent = un seul board. */
  cards2?: (Card | undefined)[];
  pot: number;
  /** Une part de pot qui file vers un vainqueur : sa position (relative au centre de la table) et son
   * MONTANT explicite. Tableau vide tant que la main n'est pas résolue (la pastille reste alors
   * immobile, montant complet). Les montants sont fournis tels quels (plutôt que recalculés en parts
   * égales) car un double board partage rarement à égalité — ex : un board gagné seul (0,5 du pot) +
   * un board partagé (0,25 chacun). */
  winnerShares: { x: number; y: number; amount: number }[];
  gameType?: GameType;
  /** Devise de la main (cf. `DEVISES`) ; absente = euro. Sans effet en tournoi. */
  currency?: CodeDevise;
  /** Largeur de la table : sert à dimensionner les cartes pour qu'elles ne débordent jamais sur les sièges. */
  tableWidth?: number;
  /** Ce que dit la pastille de fin quand la relecture s'achève sans vainqueur — sans elle, le pot
   *  restait figé au centre sans un mot, ce qui ressemble à un chargement bloqué plutôt qu'à un
   *  état normal. Deux fins tombent dans ce cas et ne disent pas la même chose : la main est allée
   *  à son terme mais personne n'a montré, ou son auteur l'a arrêtée avant. Le texte est donc
   *  calculé par `HandReplayer`, qui a la main sous les yeux ; ici on ne fait que l'afficher.
   *  `null`/absent = la relecture n'est pas dans cet état. */
  unresolvedNote?: string | null;
  /** Décalage vertical (cf. `boardVerticalOffset`) pour recentrer le bloc board+pot entre BB et Hero. */
  verticalOffset?: number;
  bb: number;
  useBB?: boolean;
  /** Taille des cartes du board (cf. `Gabarit`). Absent = le gabarit du feed, inchangé. */
  gabarit?: Gabarit;
  /**
   * Pas de rangée de board du tout — ni cartes, ni emplacements vides. Sert aux étapes de RÉGLAGE
   * du créateur, où la main n'a pas commencé : réserver cinq emplacements pour des cartes qui ne
   * seront distribuées qu'à l'écran suivant coûterait 53 px de hauteur pour ne rien montrer.
   */
  sansCartes?: boolean;
  /**
   * Toucher UNE carte du board (index dans la rangée). Fourni, chaque emplacement en jeu devient
   * une cible — carte posée comme trou en attente. Absent (le feed), la rangée reste inerte et ne
   * paye aucun nœud supplémentaire.
   */
  onCartePress?: (index: number) => void;
  /** Idem pour la SECONDE rangée (double board du bomb pot). Chaque board a ses propres
   *  emplacements et son propre sélecteur : une carte choisie va dans le board qu'on a touché. */
  onCartePress2?: (index: number) => void;
}

const CARD_GAP = 4;

// Une part du pot qui file vers UN vainqueur. Composant à part (plutôt qu'une boucle de hooks dans
// `BoardView`) car chaque part a besoin de ses propres valeurs animées indépendantes — le nombre de
// parts varie d'une main à l'autre, impossible à connaître à l'avance pour des hooks au top-level.
function PotShare({
  amount,
  gameType,
  currency,
  bb,
  useBB,
  target,
}: {
  amount: number;
  gameType: GameType;
  currency?: CodeDevise;
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
      <ChipsView amount={amount} gameType={gameType} currency={currency} isWinning bb={bb} useBB={useBB} />
    </Animated.View>
  );
}

/**
 * Une rangée de 5 emplacements de board. Trois états par emplacement :
 *   • une carte posée ;
 *   • un TROU EN ATTENTE (dans la longueur fournie, mais pas encore choisi) — pointillés ;
 *   • rien du tout (au-delà de la longueur fournie) — l'emplacement garde sa place, invisible.
 */
function BoardRow({
  cards,
  cardWidth,
  cardHeight,
  style,
  onCartePress,
}: {
  cards: (Card | undefined)[];
  cardWidth: number;
  cardHeight: number;
  style?: object;
  onCartePress?: (index: number) => void;
}) {
  return (
    <View style={[styles.cardsRow, { gap: CARD_GAP }, style]}>
      {[0, 1, 2, 3, 4].map((i) => {
        const enJeu = i < cards.length;
        const contenu = cards[i] ? (
          <CardView card={cards[i]} width={cardWidth} height={cardHeight} />
        ) : enJeu ? (
          <View style={[styles.emplacementAttendu, { width: cardWidth, height: cardHeight }]} />
        ) : null;
        return (
          <View key={i} style={{ width: cardWidth, height: cardHeight }}>
            {/* Enveloppe tactile seulement là où elle sert (cf. `onCartePress`). */}
            {onCartePress && enJeu ? (
              <Pressable onPress={() => onCartePress(i)}>{contenu}</Pressable>
            ) : (
              contenu
            )}
          </View>
        );
      })}
    </View>
  );
}

export function BoardView({
  cards,
  cards2,
  pot,
  winnerShares,
  unresolvedNote,
  gameType = 'cash',
  currency,
  tableWidth = 0,
  verticalOffset = 0,
  bb,
  useBB = false,
  gabarit = GABARIT_FEED,
  sansCartes = false,
  onCartePress,
  onCartePress2,
}: BoardViewProps) {
  // Les 5 cartes ne doivent jamais déborder sur les badges des sièges latéraux : on les
  // dimensionne à partir de la largeur réelle de la table plutôt qu'une taille fixe (même formule
  // que `SeatView`, via `boardCardSize`, pour que les deux calculs restent synchronisés).
  const { width: cardWidth, height: cardHeight } = boardCardSize(tableWidth, gabarit);
  const doubleBoard = Boolean(cards2);

  return (
    <View
      style={[styles.wrapper, { transform: [{ translateY: verticalOffset }] }]}
      pointerEvents={onCartePress || onCartePress2 ? 'box-none' : 'none'}
    >
      <View style={styles.chipsFloat}>
        {winnerShares.length === 0 ? (
          <ChipsView amount={pot} gameType={gameType} currency={currency} isWinning={false} bb={bb} useBB={useBB} />
        ) : (
          winnerShares.map((share, i) => (
            <PotShare
              key={i}
              amount={share.amount}
              gameType={gameType}
              currency={currency}
              bb={bb}
              useBB={useBB}
              target={{ x: share.x, y: share.y }}
            />
          ))
        )}
      </View>

      {!sansCartes && (
        <BoardRow
          cards={cards}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          onCartePress={onCartePress}
        />
      )}
      {doubleBoard && !sansCartes && (
        <BoardRow
          cards={cards2!}
          cardWidth={cardWidth}
          cardHeight={cardHeight}
          style={styles.secondBoard}
          onCartePress={onCartePress2}
        />
      )}

      {unresolvedNote && (
        <View style={styles.noteFloat}>
          <Text style={styles.noteText}>{unresolvedNote}</Text>
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
  // La carte qu'on attend. Elle se dessine SUR LE FEUTRE, pas sur le parchemin : les pointillés du
  // sélecteur (gris sur fond clair) y seraient invisibles. Assez présente pour dire « il manque ça
  // ici », assez discrète pour ne pas se faire prendre pour une carte posée.
  emplacementAttendu: {
    borderRadius: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.38)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  // Le second board se pose juste sous le premier, avec un petit écart pour bien les distinguer.
  secondBoard: {
    marginTop: 6,
  },
});
