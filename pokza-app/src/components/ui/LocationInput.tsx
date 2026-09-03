import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  /**
   * Prévenu quand la liste de suggestions s'ouvre et se ferme. N'existe que pour un écran qui
   * BOUGE pendant qu'on saisit : l'étape 1 du créateur replie sa table quand un champ prend le
   * focus, et la déplierait au moment précis où le doigt se pose sur une suggestion — la ligne
   * partirait alors 211 à 312 px plus bas entre le doigt qui se pose et celui qui se lève, et
   * l'appui serait annulé (signalé par Victor le 02/09/2026). L'écran garde donc sa forme tant
   * que la liste est là. Facultatif : un écran qui ne bouge pas n'a rien à en faire.
   */
  onListeOuverte?: (ouverte: boolean) => void;
}

/** Le sursis accordé à la liste après un `blur`, quand AUCUN doigt n'est posé dessus. */
const DELAI_FERMETURE_MS = 150;
/** Au-delà, on cesse de croire à un appui en cours (cf. `secours`). */
const DELAI_SECOURS_MS = 3000;

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
export function LocationInput({
  value,
  onChangeText,
  style,
  placeholder,
  onListeOuverte,
}: LocationInputProps) {
  // Ouverte seulement quand l'utilisateur est DANS le champ. Sans ça, l'écran de correction, dont
  // le champ arrive prérempli, s'ouvrirait sur une liste de suggestions que personne n'a demandée.
  const [actif, setActif] = useState(false);
  const fermeture = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * UN DOIGT EST-IL POSÉ SUR UNE SUGGESTION ?
   *
   * Le sursis de 150 ci-dessous ne mesure rien, c'est un PARI sur la durée d'un appui : un appui de
   * lecture — on regarde la ligne, on pose, on relit, on lève — le dépasse sans effort, et la liste
   * se démontait alors sous le doigt. Ce drapeau remplace le pari par un fait : tant qu'un appui
   * est en cours, rien ne se ferme, quelle qu'en soit la durée.
   *
   * Il ne valide RIEN. `onPressIn` dit seulement qu'un appui a commencé ; c'est toujours `onPress`
   * qui choisit, donc glisser le doigt hors de la ligne l'annule comme avant.
   */
  const appuiEnCours = useRef(false);
  /**
   * Le filet du filet. Si `onPressOut` ne venait jamais — un pointeur perdu, un geste avalé par un
   * autre composant — le drapeau resterait levé, la liste ne se fermerait plus et la table de
   * l'étape 1 ne se déplierait plus JAMAIS. Un appui réel ne dure pas trois secondes ; passé ce
   * délai on considère qu'il n'y en a plus, et l'écran retrouve son cours normal.
   */
  const secours = useRef<ReturnType<typeof setTimeout> | null>(null);

  const suggestions = useMemo(() => (actif ? chercherLieux(value) : []), [actif, value]);
  const listeOuverte = suggestions.length > 0;

  // Passé par une référence, pas par la liste de dépendances : l'appelant écrit presque toujours une
  // fonction à la volée, dont l'identité change à chaque rendu — l'effet partirait en boucle.
  const signaler = useRef(onListeOuverte);
  signaler.current = onListeOuverte;
  useEffect(() => {
    signaler.current?.(listeOuverte);
  }, [listeOuverte]);
  // Au démontage : l'écran ne doit pas rester bloqué sur « la liste est ouverte », et un minuteur
  // qui survit poserait un état sur un composant disparu.
  useEffect(
    () => () => {
      if (fermeture.current) clearTimeout(fermeture.current);
      if (secours.current) clearTimeout(secours.current);
      signaler.current?.(false);
    },
    []
  );

  const relacher = () => {
    appuiEnCours.current = false;
    if (secours.current) clearTimeout(secours.current);
    secours.current = null;
  };

  const armerFermeture = () => {
    if (fermeture.current) clearTimeout(fermeture.current);
    fermeture.current = setTimeout(() => {
      if (appuiEnCours.current) return;
      setActif(false);
    }, DELAI_FERMETURE_MS);
  };

  const choisir = (nom: string) => {
    if (fermeture.current) clearTimeout(fermeture.current);
    relacher();
    onChangeText(nom);
    setActif(false);
  };

  return (
    <>
      <TextInput
        autoComplete="off"
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
        //
        // Le drapeau `appuiEnCours` couvre le cas que le délai ne couvrait pas : un appui plus long
        // que 150 ms. On ne suppose RIEN de l'ordre entre ce `blur` et le `onPressIn` de la ligne —
        // celui-ci désarme aussi le minuteur de son côté, donc les deux ordres se valent.
        onBlur={() => {
          if (appuiEnCours.current) return;
          armerFermeture();
        }}
        autoCorrect={false}
      />
      {suggestions.length > 0 && (
        <View style={styles.liste}>
          {suggestions.map((lieu, i) => (
            <Pressable
              key={lieu.id}
              // Lève le drapeau ET désarme un minuteur que le `blur` aurait déjà pu armer : selon
              // le moteur, `pointerdown` passe avant ou après le déplacement du focus, et on ne
              // veut dépendre ni de l'un ni de l'autre.
              onPressIn={() => {
                appuiEnCours.current = true;
                if (fermeture.current) clearTimeout(fermeture.current);
                if (secours.current) clearTimeout(secours.current);
                secours.current = setTimeout(() => {
                  relacher();
                  armerFermeture();
                }, DELAI_SECOURS_MS);
              }}
              // Le doigt s'est levé — sur la ligne (`onPress` suit et annulera ce minuteur) ou à
              // côté (rien n'est choisi, la liste reprend son cours et se ferme).
              onPressOut={() => {
                relacher();
                armerFermeture();
              }}
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
