import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextStyle } from 'react-native';
import { Pressable } from './Pressable';
import { borders, colors, radius, spacing } from '../../theme/theme';
import { chercherLieux, LIEU_MIN_CARACTERES } from '../../data/lieux';
import { LOCATION_MAX_LENGTH } from '../../constants/limits';

interface LocationInputProps {
  value: string;
  onChangeText: (texte: string) => void;
  /** Le style du champ vient de l'écran appelant, pour qu'il reste identique à ses voisins. */
  style?: StyleProp<TextStyle>;
  placeholder?: string;
}

/**
 * Le champ « Lieu » et ses suggestions — le seul point d'entrée de la banque de lieux
 * (cf. `data/lieux.ts`). Utilisé à la création d'une main comme à sa correction : deux écrans, un
 * seul comportement.
 *
 * LES SUGGESTIONS SONT DANS LE FLUX, pas en calque flottant. Ce n'est pas un choix esthétique :
 * les deux écrans rendent leurs enfants dans le `ScrollView` du `WizardScreen`, où un calque en
 * position absolue « défilerait avec le contenu et serait rogné » (leçon déjà payée, cf. le
 * commentaire de `EditPostScreen` sur le sélecteur de groupe). Dans le flux, la liste pousse la
 * suite vers le bas et le défilement l'amène naturellement au-dessus du clavier.
 *
 * ⚠️ CE QUI EST RETENU EST DU TEXTE, jamais un identifiant. Toucher une suggestion ne fait
 * qu'écrire son nom dans le champ : le lieu reste modifiable ensuite, et un lieu absent de la
 * banque se tape comme avant. La banque propose, elle ne valide rien.
 */
export function LocationInput({ value, onChangeText, style, placeholder }: LocationInputProps) {
  // Ouverte seulement quand l'utilisateur est DANS le champ. Sans ça, l'écran de correction, dont
  // le champ arrive prérempli, s'ouvrirait sur une liste de suggestions que personne n'a demandée.
  const [actif, setActif] = useState(false);
  const fermeture = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => (actif ? chercherLieux(value) : []), [actif, value]);

  const choisir = (nom: string) => {
    if (fermeture.current) clearTimeout(fermeture.current);
    onChangeText(nom);
    setActif(false);
  };

  return (
    <>
      <TextInput
        style={style}
        placeholder={placeholder}
        maxLength={LOCATION_MAX_LENGTH}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => {
          if (fermeture.current) clearTimeout(fermeture.current);
          setActif(true);
        }}
        // Le délai n'est PAS un confort, c'est MESURÉ : sur le web, un appui déclenche le `blur`
        // de l'ancien élément AVANT son propre `press`. Délai ramené à 0, la ligne quitte le DOM
        // entre le doigt qui se pose et celui qui se lève, et le champ reste sur ce qui était tapé
        // — le choix est perdu. Avec, il passe. `choisir` annule le minuteur, donc le cas normal
        // ne l'attend jamais.
        onBlur={() => {
          fermeture.current = setTimeout(() => setActif(false), 150);
        }}
        autoCorrect={false}
      />
      {suggestions.length > 0 && (
        <View style={styles.liste}>
          {suggestions.map((lieu, i) => (
            <Pressable
              key={lieu.id}
              onPress={() => choisir(lieu.nom)}
              style={[styles.ligne, i > 0 && styles.ligneSuivante]}
            >
              <Text style={styles.nom} numberOfLines={1}>
                {lieu.nom}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </>
  );
}

/** Le nombre de lettres à taper avant la première suggestion, dit à l'écran qui veut l'annoncer. */
export { LIEU_MIN_CARACTERES };

const styles = StyleSheet.create({
  liste: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: borders.hairline,
    borderRadius: radius.md,
    backgroundColor: colors.cardFace,
    overflow: 'hidden',
  },
  ligne: {
    // 44 px de haut au minimum : c'est la cible de touche sous laquelle on rate une ligne sur deux,
    // et cinq lignes empilées sont justement le pire endroit pour se tromper de voisine.
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  ligneSuivante: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
  },
  nom: {
    fontSize: 15,
    color: colors.textPrimary,
  },
});
