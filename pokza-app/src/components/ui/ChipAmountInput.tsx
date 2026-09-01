import React, { useEffect, useState } from 'react';
import { StyleProp, TextInput, TextStyle } from 'react-native';
import type { GameType } from '../../types/poker';
import { formatChipInput, parseChipAmount } from '../../utils/chipFormat';

/**
 * LES CHAMPS DE MONTANT EN JETONS — blindes, tapis, antes.
 * ────────────────────────────────────────────────────────
 * Sortis de `ContextStep` le 01/09/2026, sans une ligne changée : la fiche d'un joueur en a besoin
 * autant que le formulaire de table, et le seul autre chemin était d'importer un composant depuis
 * un écran d'étape.
 */

// Un TextInput contrôlé qui reflète `String(nombre)` se mord la queue dès qu'on tape une virgule
// ou un point : "0." → parseFloat → 0 → réaffiché "0", le "." tapé disparaît aussitôt, rendant
// tout nombre décimal (ex: blindes 0,25/0,5) impossible à saisir caractère par caractère. On garde
// donc le texte tapé comme état local propre à l'input, et on ne le resynchronise depuis la valeur
// numérique que si elle change de source EXTÉRIEURE (preset cliqué...), jamais en écho de sa propre frappe.
export function DecimalTextInput({
  value,
  onChangeValue,
  style,
  placeholder,
  gameType,
  onFocusChange,
}: {
  value: number;
  onChangeValue: (n: number) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  /** Sert au format abrégé rendu à la sortie du champ ; absent = pas d'abréviation. */
  gameType?: GameType;
  /** Suit l'entrée et la sortie du champ, pour qui veut attendre la fin d'une saisie. */
  onFocusChange?: (focused: boolean) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    const parsed = parseChipAmount(text);
    const isOwnEcho = parsed === value || (parsed === undefined && value === 0);
    if (!isOwnEcho) setText(gameType ? formatChipInput(value, gameType) : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      value={text}
      onChangeText={(t) => {
        setText(t);
        const parsed = parseChipAmount(t);
        onChangeValue(parsed ?? 0);
      }}
      // La réécriture abrégée attend la sortie du champ : la faire à chaque frappe ferait muter
      // "3000" en "3k" au milieu de la saisie de "30000", et la frappe suivante donnerait "3k0".
      onFocus={() => onFocusChange?.(true)}
      onBlur={() => {
        onFocusChange?.(false);
        if (!gameType) return;
        const parsed = parseChipAmount(text);
        if (parsed !== undefined) setText(formatChipInput(parsed, gameType));
      }}
    />
  );
}

// Variante pour un champ facultatif (le stack d'un siège précis, sinon le stack effectif par
// défaut s'applique) : un champ vidé revient à "pas de valeur" plutôt qu'à 0.
export function OptionalDecimalTextInput({
  value,
  onChangeValue,
  style,
  placeholder,
  gameType,
  editable,
}: {
  value: number | undefined;
  onChangeValue: (n: number | undefined) => void;
  style?: StyleProp<TextStyle>;
  placeholder?: string;
  /** Sert au format abrégé rendu à la sortie du champ ; absent = pas d'abréviation. */
  gameType?: GameType;
  editable?: boolean;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');

  useEffect(() => {
    const parsed = text.trim() === '' ? undefined : parseChipAmount(text);
    const isOwnEcho = parsed === value;
    if (!isOwnEcho) setText(value != null ? (gameType ? formatChipInput(value, gameType) : String(value)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <TextInput
      style={style}
      keyboardType="decimal-pad"
      placeholder={placeholder}
      editable={editable}
      value={text}
      onChangeText={(t) => {
        setText(t);
        if (t.trim() === '') {
          onChangeValue(undefined);
          return;
        }
        onChangeValue(parseChipAmount(t));
      }}
      // Même raison que dans `DecimalTextInput` : abréger pendant la frappe casserait la saisie.
      onBlur={() => {
        if (!gameType || text.trim() === '') return;
        const parsed = parseChipAmount(text);
        if (parsed !== undefined) setText(formatChipInput(parsed, gameType));
      }}
    />
  );
}

