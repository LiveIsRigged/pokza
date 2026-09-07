import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { borders, colors, radius, spacing } from '../theme/theme';

/**
 * ⚠️⚠️ SONDE TEMPORAIRE — À SUPPRIMER, ELLE N'EST PAS UNE FONCTIONNALITÉ.
 * ════════════════════════════════════════════════════════════════════
 * Elle cherche ce qui fait taire la barre de remplissage de Safari (carte bancaire / contact),
 * signalée par Victor le 06/09/2026 sur iOS 26.5.2.
 *
 * POURQUOI ELLE EST *DANS* L'APP, après trois manches ratées sur une page à part :
 *   1. sonde en `http://<ip>:8081`         → rien. Safari coupe le remplissage hors origine sûre :
 *                                            la manche ne mesurait rien du tout ;
 *   2. la même, en mode autonome           → rien, pour la même raison ;
 *   3. la même sur `https://pokza.app`     → rien, alors que l'app au même endroit, elle, propose.
 *
 * La troisième manche est celle qui tranche : même origine, même https, même mode autonome, et
 * pourtant l'une propose et l'autre non. **Ce n'est donc pas le champ, c'est la PAGE.** Un banc
 * doit reproduire le contexte, pas seulement le contenu — et le seul moyen sûr de reproduire le
 * contexte de Pokza, c'est d'être Pokza.
 *
 * D'où ces champs-ci : de vrais `TextInput` de react-native-web, dans un vrai écran de l'app,
 * rendus avec tout ce que RNW ajoute (`dir="auto"`, `enterkeyhint`, `rows`,
 * `virtualkeyboardpolicy`, ses classes) — et que ma page à la main ne reproduisait pas.
 *
 * ⚠️ LES TÉMOINS SONT LES Nº 1, 5 ET 8 : ils portent EXACTEMENT ce que l'app a aujourd'hui. S'ils
 * ne reproduisent pas le bug, c'est encore l'instrument qu'il faut corriger, pas les candidats.
 */

/** `name` et `<form>` ne sont pas exprimables par un `TextInput` RNW : ils ne pouvaient donc de
 *  toute façon pas être la solution retenue, et sont écartés de la liste. */
const CAS: { n: number; quoi: string; props: React.ComponentProps<typeof TextInput> }[] = [
  { n: 1, quoi: 'off — TÉMOIN, l’état actuel', props: { autoComplete: 'off' } },
  { n: 2, quoi: 'aucune prop (RNW pose « on »)', props: {} },
  { n: 3, quoi: 'one-time-code', props: { autoComplete: 'one-time-code' } },
  { n: 4, quoi: 'nickname', props: { autoComplete: 'nickname' } },

  { n: 5, quoi: 'off + pavé numérique — TÉMOIN', props: { autoComplete: 'off', inputMode: 'decimal' } },
  { n: 6, quoi: 'one-time-code + pavé numérique', props: { autoComplete: 'one-time-code', inputMode: 'decimal' } },
  { n: 7, quoi: 'transaction-amount + pavé', props: { autoComplete: 'transaction-amount' as never, inputMode: 'decimal' } },

  { n: 8, quoi: 'off + multiligne — TÉMOIN', props: { autoComplete: 'off', multiline: true } },
  { n: 9, quoi: 'one-time-code + multiligne', props: { autoComplete: 'one-time-code', multiline: true } },
];

export function SondeAutoFill() {
  return (
    <View style={styles.bloc}>
      <Text style={styles.titre}>Sonde AutoFill — temporaire</Text>
      <Text style={styles.mode}>
        Tape dans chacun, regarde la barre au-dessus du clavier. Ne tape rien dedans.
        Les nº 1, 5 et 8 sont les témoins : ils doivent reproduire le bug.
      </Text>
      {CAS.map((cas) => (
        <View key={cas.n} style={styles.ligne}>
          <Text style={styles.etiquette}>
            {String(cas.n).padStart(2, '0')} · {cas.quoi}
          </Text>
          <TextInput
            {...cas.props}
            style={[styles.champ, cas.props.multiline ? styles.champMulti : null]}
            placeholder="tape ici"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={`Sonde ${cas.n}`}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { marginTop: spacing.md, gap: spacing.sm },
  titre: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  mode: { fontSize: 13, color: colors.textSecondary },
  ligne: { gap: 4 },
  etiquette: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  champ: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    // 16px : la règle du thème, et elle vaut aussi pour une sonde.
    fontSize: 16,
    color: colors.textPrimary,
  },
  champMulti: { minHeight: 60, textAlignVertical: 'top' },
});
