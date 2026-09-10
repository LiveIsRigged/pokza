import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, spacing } from '../theme/theme';
import { useLangue, useT } from '../i18n';
import { LANGUES, type Langue } from '../i18n/langues';

interface LanguageSettingsScreenProps {
  onBack: () => void;
}

/**
 * Choix de la langue, ouvert depuis la ligne « Langue » de `SettingsScreen`.
 *
 * Le défaut est « langue de l'appareil » (décision du 10/09/2026) et il reste une entrée de la
 * liste plutôt qu'un simple état initial : sans elle, choisir une fois fige le choix à vie, et on
 * ne peut plus revenir au suivi automatique. La langue de chaque option est écrite DANS cette
 * langue (« English », pas « Anglais ») — c'est la seule façon pour quelqu'un tombé sur une langue
 * qu'il ne lit pas de retrouver la sienne.
 */
export function LanguageSettingsScreen({ onBack }: LanguageSettingsScreenProps) {
  const t = useT();
  const { preference, choisir } = useLangue();

  const options: { valeur: 'auto' | Langue; libelle: string }[] = [
    { valeur: 'auto', libelle: t('langue.automatique') },
    ...(Object.keys(LANGUES) as Langue[]).map((code) => ({ valeur: code, libelle: LANGUES[code] })),
  ];

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('langue.titre')}</Text>
        </View>

        {options.map((option) => (
          <Pressable key={option.valeur} style={styles.row} onPress={() => choisir(option.valeur)}>
            <Text style={styles.rowLabel}>{option.libelle}</Text>
            {preference === option.valeur && <Text style={styles.check}>✓</Text>}
          </Pressable>
        ))}

        <Text style={styles.hint}>{t('langue.contenu_non_traduit')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 60,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 20,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  check: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 16,
    lineHeight: 17,
  },
});
