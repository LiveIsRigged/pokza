import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from './Pressable';
import { borders, colors, radius, spacing } from '../../theme/theme';
import { listeDesPays, flagEmoji, type Country } from '../../data/countries';
import { useLangue, useT } from '../../i18n';
import { fold } from '../../utils/recherche';
import { LARGEUR_MAX } from './Colonne';

interface CountryPickerProps {
  visible: boolean;
  /** Code du pays actuellement choisi (surligné dans la liste), ou null si aucun. */
  selectedCode?: string | null;
  /** Appelé avec le code choisi, ou null pour « ne pas indiquer ». Referme la feuille. */
  onSelect: (code: string | null) => void;
  onClose: () => void;
  /** Affiche la ligne « Ne pas indiquer » (choix null). Désactivé quand le pays est obligatoire. */
  allowClear?: boolean;
}

/**
 * Feuille de sélection d'un pays : champ de recherche + liste complète (drapeau + nom), plus une
 * ligne « Ne pas indiquer » pour effacer le choix. Le pays n'est qu'un code ISO ; le drapeau est
 * dérivé à l'affichage (cf. `flagEmoji`).
 */
export function CountryPicker({ visible, selectedCode, onSelect, onClose, allowClear = true }: CountryPickerProps) {
  const t = useT();
  // La liste dépend de la langue : les noms viennent d'`Intl` et le TRI change (« Allemagne » en A,
  // « Germany » en G). C'est aussi ce qui redessine le sélecteur quand on change de langue.
  const { langue } = useLangue();
  const [query, setQuery] = useState('');

  // Repartir d'une recherche vierge à chaque ouverture.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const filtered = useMemo(() => {
    const pays = listeDesPays();
    const q = fold(query.trim());
    if (!q) return pays;
    return pays.filter((c: Country) => fold(c.name).includes(q) || c.code.toLowerCase().includes(q));
  }, [query, langue]);

  const renderItem = ({ item }: { item: Country }) => {
    const selected = item.code === selectedCode;
    return (
      <Pressable
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => onSelect(item.code)}
      >
        <Text style={styles.flag}>{flagEmoji(item.code)}</Text>
        <Text style={[styles.name, selected && styles.nameSelected]}>{item.name}</Text>
        {selected && <Text style={styles.check}>✓</Text>}
      </Pressable>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{t('pays.titre')}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.searchWrap}>
            <TextInput
              autoComplete="off"
              style={styles.search}
              placeholder={t('pays.rechercher')}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.code}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            style={styles.list}
            ListHeaderComponent={
              allowClear ? (
                <Pressable style={styles.clearRow} onPress={() => onSelect(null)}>
                  <Text style={styles.clearText}>{t('pays.ne_pas_indiquer')}</Text>
                  {!selectedCode && <Text style={styles.check}>✓</Text>}
                </Pressable>
              ) : null
            }
            ListEmptyComponent={<Text style={styles.emptyText}>Aucun pays trouvé.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    // LA COLONNE, pour une feuille du bas (cf. `Colonne`) : sur ordinateur elle se centre au lieu
    // de s'étirer sur toute la fenêtre. `width: '100%'` est nécessaire — `alignSelf: 'center'`
    // seul ferait rétrécir la feuille à la taille de son contenu.
    maxWidth: LARGEUR_MAX,
    width: '100%',
    alignSelf: 'center',
    height: '85%',
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  closeButton: {
    fontSize: 18,
    color: colors.textSecondary,
    padding: 4,
  },
  searchWrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  search: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowSelected: {
    backgroundColor: 'rgba(232,87,31,0.08)',
  },
  flag: {
    fontSize: 22,
    width: 30,
  },
  name: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  nameSelected: {
    fontWeight: '700',
  },
  check: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.action,
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.subtle,
  },
  clearText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    padding: spacing.lg,
  },
});
