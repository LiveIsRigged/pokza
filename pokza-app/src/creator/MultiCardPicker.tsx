import React, { useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Card, Rank, Suit } from '../types/poker';
import { borders, colors, tints } from '../theme/theme';
import { CardView } from '../components/replayer/CardView';

const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS: { suit: Suit; symbol: string; red: boolean }[] = [
  { suit: 's', symbol: '♠', red: false },
  { suit: 'h', symbol: '♥', red: true },
  { suit: 'd', symbol: '♦', red: true },
  { suit: 'c', symbol: '♣', red: false },
];

const CARD_WIDTH = 44;
const CARD_HEIGHT = 58;
const CARD_GAP = 6;
/** Hauteur d'une rangée = la carte plus le talon bas de `suitRow` : sert à dimensionner le fondu. */
const ROW_HEIGHT = CARD_HEIGHT + CARD_GAP;
/** Largeur du fondu de bord : un peu moins qu'une carte, pour qu'on voie bien une carte s'estomper
 * plutôt qu'un bandeau plein posé par-dessus. */
const FADE_WIDTH = 34;
/** Largeur totale d'une ligne de 13 rangs : déterministe, donc jamais mesurée (cf. `SuitRow`). */
const CONTENT_WIDTH = RANKS.length * CARD_WIDTH + (RANKS.length - 1) * CARD_GAP;

interface MultiCardPickerProps {
  /** Nombre de cartes à choisir */
  count: number;
  /** Cartes choisies, dans l'ordre de sélection */
  selected: (Card | undefined)[];
  onChange: (cards: (Card | undefined)[]) => void;
  /** Cartes déjà utilisées ailleurs dans la main, à désactiver */
  disabledCards?: Card[];
  /**
   * Masque la rangée d'aperçu au-dessus du sélecteur. À n'activer que là où les cartes choisies
   * sont DÉJÀ visibles ailleurs à l'écran — la table du créateur les pose devant Hero à mesure
   * qu'on les choisit, et les revoir juste en dessous ne dit rien de plus. Ailleurs (abattage,
   * corrections), l'aperçu reste le seul endroit où on relit sa sélection : il ne bouge pas.
   */
  sansApercu?: boolean;
}

/** Deux cartes identiques ? Exporté : le créateur en a besoin pour replacer ce que ce sélecteur
 *  renvoie TASSÉ (il ignore les trous), aussi bien pour le board que pour une main d'adversaire. */
export function memeCarte(a: Card, b: Card) {
  return a.rank === b.rank && a.suit === b.suit;
}
const sameCard = memeCarte;

/**
 * Une couleur (♠ ♥ ♦ ♣) sur une seule ligne défilante, avec un fondu sur le bord droit tant qu'il
 * reste des cartes à droite.
 *
 * Sans ce fondu, la dernière carte visible s'arrête à ~89 % de sa largeur : elle passe pour une
 * carte entière posée au bord, et rien ne laisse deviner qu'il en reste 5 à 8 derrière (250 px sur
 * le plus grand iPhone, 360 px sur le plus petit — le contenu caché existe à TOUTES les tailles).
 * Le fondu se place tout seul au bord de la zone visible, quelle que soit la largeur de l'écran.
 *
 * Il disparaît une fois la ligne défilée jusqu'au bout — sinon il promettrait des cartes qui
 * n'existent plus — et ne s'affiche pas du tout si les 13 rangs tiennent déjà (écran large).
 */
function SuitRow({
  suit,
  symbol,
  red,
  chosen,
  count,
  disabledCards,
  onToggle,
}: {
  suit: Suit;
  symbol: string;
  red: boolean;
  chosen: Card[];
  count: number;
  disabledCards: Card[];
  onToggle: (card: Card) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  // Position et largeur visible viennent de l'événement de défilement lui-même : `onLayout` et
  // `onContentSizeChange` ne se déclenchent JAMAIS sous react-native-web (même piège que dans
  // `InstallPrompt.tsx` et `Turnstile.tsx`, où il a fallu passer par un vrai nœud DOM). Ici on n'a
  // pas besoin de mesurer : la largeur du contenu est déterministe, et tant qu'on n'a pas défilé,
  // la largeur de la fenêtre majore toujours celle de la rangée — au pire le fondu s'abstient sur
  // un écran très large, il ne promet jamais des cartes qui n'existent pas.
  // Tant qu'on n'a pas défilé, on se rabat sur la largeur de la fenêtre : elle majore toujours
  // celle de la rangée, donc le fondu s'abstient sur un écran large et n'y promet jamais des cartes
  // inexistantes. Dès le premier défilement, l'événement fournit la largeur visible exacte.
  //
  // ⚠️ Limite mesurée, pas supposée : après une ROTATION, ni `useWindowDimensions` ni `onLayout` ne
  // se rafraîchissent sous react-native-web (vérifié — la fenêtre passait à 390 pendant que le hook
  // annonçait encore 900 ; même piège que dans `InstallPrompt.tsx` et `Turnstile.tsx`). Une rangée
  // qui cesse de déborder en paysage peut donc garder son fondu jusqu'au défilement suivant. Un
  // garde-fou comparant la largeur de fenêtre a été essayé puis retiré : il comparait deux valeurs
  // périmées identiques et ne servait à rien.
  const [visibleWidth, setVisibleWidth] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  // Marge d'un pixel : au bout de la course, les arrondis laissent parfois un résidu fractionnaire
  // qui ferait clignoter le fondu.
  const remaining = CONTENT_WIDTH - (visibleWidth || windowWidth) - offsetX > 1;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setOffsetX(e.nativeEvent.contentOffset.x);
    setVisibleWidth(e.nativeEvent.layoutMeasurement.width);
  };

  return (
    <View style={styles.rowWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.suitRow}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {RANKS.map((rank) => {
          const card: Card = { rank, suit };
          const isSelected = chosen.some((c) => sameCard(c, card));
          const isUsed = disabledCards.some((c) => sameCard(c, card));
          const isFull = chosen.length >= count && !isSelected;
          const isDisabled = isUsed || isFull;
          return (
            <Pressable
              key={rank}
              disabled={isUsed}
              onPress={() => onToggle(card)}
              style={[styles.card, isSelected && styles.cardSelected, isDisabled && styles.cardDisabled]}
            >
              <Text style={[styles.rank, { color: red ? colors.cardTextRed : colors.cardTextBlack }]}>{rank}</Text>
              <Text style={[styles.suit, { color: red ? colors.cardTextRed : colors.cardTextBlack }]}>{symbol}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {remaining && (
        <View style={styles.fade} pointerEvents="none">
          <Svg width={FADE_WIDTH} height={ROW_HEIGHT}>
            <Defs>
              {/* Un identifiant par couleur : quatre rangées coexistent, et des `id` identiques se
                  télescoperaient (le web les résout globalement dans le document). */}
              <LinearGradient id={`fade-${suit}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={colors.feedBackground} stopOpacity="0" />
                <Stop offset="1" stopColor={colors.feedBackground} stopOpacity="1" />
              </LinearGradient>
            </Defs>
            <Rect width={FADE_WIDTH} height={ROW_HEIGHT} fill={`url(#fade-${suit})`} />
          </Svg>
        </View>
      )}
    </View>
  );
}

export function MultiCardPicker({
  count,
  selected,
  onChange,
  disabledCards = [],
  sansApercu = false,
}: MultiCardPickerProps) {
  const chosen = selected.filter(Boolean) as Card[];

  const toggle = (card: Card) => {
    const idx = chosen.findIndex((c) => sameCard(c, card));
    if (idx !== -1) {
      // déjà choisie → on la retire
      onChange(chosen.filter((_, i) => i !== idx));
      return;
    }
    if (chosen.length >= count) return; // déjà complet
    onChange([...chosen, card]);
  };

  return (
    <View>
      {!sansApercu && (
        <View style={styles.slots}>
          {Array.from({ length: count }).map((_, i) => (
            <Pressable
              key={i}
              onPress={() => chosen[i] && onChange(chosen.filter((_, j) => j !== i))}
              style={styles.slot}
            >
              {chosen[i] ? <CardView card={chosen[i]} size="medium" /> : <View style={styles.emptySlot} />}
            </Pressable>
          ))}
        </View>
      )}

      {SUITS.map(({ suit, symbol, red }) => (
        <SuitRow
          key={suit}
          suit={suit}
          symbol={symbol}
          red={red}
          chosen={chosen}
          count={count}
          disabledCards={disabledCards}
          onToggle={toggle}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  slots: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  slot: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  emptySlot: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 8,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: borders.strong,
    backgroundColor: tints.faint,
  },
  // Repère du fondu, qui se pose en absolu sur le bord droit de la zone visible.
  rowWrap: {
    position: 'relative',
  },
  fade: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: FADE_WIDTH,
    height: ROW_HEIGHT,
  },
  suitRow: {
    flexDirection: 'row',
    gap: CARD_GAP,
    paddingBottom: CARD_GAP,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardFace,
    borderWidth: 1.5,
    borderColor: '#D8D4C8',
  },
  cardSelected: {
    borderColor: colors.gold,
    backgroundColor: '#FBF3DC',
  },
  cardDisabled: {
    opacity: 0.2,
  },
  rank: {
    fontSize: 17,
    fontWeight: '700',
  },
  suit: {
    fontSize: 16,
    marginTop: 1,
  },
});
