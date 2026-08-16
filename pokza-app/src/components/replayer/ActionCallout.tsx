import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/theme';

interface ActionCalloutProps {
  text: string | null;
  stepKey: number;
  /** Bulle en rouge plutôt qu'en navy — utilisé pour signaler un tapis (all-in). */
  danger?: boolean;
}

export function ActionCallout({ text, stepKey, danger = false }: ActionCalloutProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useEffect(() => {
    // La bulle reste MONTÉE en permanence (cf. le bloc ci-dessous) : sur un step sans texte il faut
    // donc la remettre explicitement à zéro, sinon une opacité laissée à 1 par le step précédent
    // (fondu pas encore terminé au moment du changement) laisserait une pastille navy vide à l'écran.
    if (!text) {
      opacity.setValue(0);
      return;
    }
    opacity.setValue(1);
    translateY.setValue(0);
    const timeout = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
    }, 1400);
    return () => clearTimeout(timeout);
  }, [stepKey, text, opacity, translateY]);

  return (
    <View style={styles.slot}>
      {/*
        ⚠️ NE JAMAIS conditionner ce rendu sur `text`. C'était le cas avant (`{text && …}`), et la
        barre de commande juste en dessous remontait de quelques pixels à chaque step sans texte —
        premier frame, révélation de chaque street, retournement des mains, step final. Le slot avait
        beau réserver une hauteur minimale, elle était plus petite que la bulle réellement rendue, et
        ce genre de valeur en dur ne peut pas suivre les métriques de police d'un appareil donné.
        En gardant la bulle montée avec une espace insécable pour tenir la ligne, la hauteur du slot
        devient constante PAR CONSTRUCTION : c'est la même boîte dans les deux états, seule l'opacité
        change. L'espace est insécable (` `) parce qu'une espace ordinaire est fusionnée par le
        moteur de rendu web et ne produirait aucune ligne.
      */}
      <Animated.View style={[styles.pill, danger && styles.pillDanger, { opacity, transform: [{ translateY }] }]}>
        <Text style={[styles.text, danger && styles.textDanger]} numberOfLines={1}>
          {text ?? ' '}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    // Pas de `minHeight` ici : il y en avait un (34), plus petit que la bulle réellement rendue
    // (~37,5 px), et c'est exactement ce qui produisait le décalage. La hauteur vient désormais de
    // la bulle elle-même, toujours montée — inutile de la dupliquer en dur, et dangereux de le faire.
    paddingVertical: 4,
  },
  pill: {
    backgroundColor: colors.tableFelt,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    maxWidth: '92%',
  },
  pillDanger: {
    backgroundColor: colors.cardTextRed,
  },
  text: {
    color: colors.textOnFelt,
    fontSize: 13,
    fontWeight: '600',
  },
  textDanger: {
    color: '#fff',
  },
});
