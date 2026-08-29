import React from 'react';
import { FlatList, Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { borders, colors, radius, spacing } from '../../theme/theme';
import { DEVISES, type CodeDevise, type Devise } from '../../utils/currency';

interface CurrencyPickerProps {
  visible: boolean;
  /** Devise actuellement choisie (surlignée dans la liste). Jamais nulle : il y en a toujours une. */
  selectedCode: CodeDevise;
  /** Appelé avec la devise choisie. Referme la feuille. */
  onSelect: (code: CodeDevise) => void;
  onClose: () => void;
}

/**
 * Feuille de sélection de la devise : la liste complète, dans l'ordre du tableau — classée par
 * importance pour le poker, pas par alphabet. Pas de champ de recherche : trente lignes se
 * parcourent d'un geste, et les trois premières couvrent la quasi-totalité des mains. Trier par nom
 * détruirait justement ce qui rend la liste utilisable.
 *
 * Aucune ligne « ne pas indiquer », contrairement au pays : une main a toujours une devise.
 */
export function CurrencyPicker({ visible, selectedCode, onSelect, onClose }: CurrencyPickerProps) {
  const renderItem = ({ item }: { item: Devise }) => {
    const selected = item.code === selectedCode;
    return (
      <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={() => onSelect(item.code)}>
        <Text style={styles.sigle}>{item.sigle}</Text>
        <Text style={[styles.nom, selected && styles.nomSelected]}>{item.nom}</Text>
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
            <Text style={styles.headerTitle}>Choisir une devise</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.closeButton}>✕</Text>
            </Pressable>
          </View>
          <FlatList
            data={DEVISES}
            keyExtractor={(item) => item.code}
            renderItem={renderItem}
            initialNumToRender={20}
            style={styles.list}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  backdropFill: { flex: 1 },
  sheet: {
    height: '75%',
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
  headerTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  closeButton: { fontSize: 18, color: colors.textSecondary, padding: 4 },
  list: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  rowSelected: { backgroundColor: 'rgba(232,87,31,0.08)' },
  // Largeur fixe pour que les noms s'alignent malgré des sigles d'une à trois lettres ("€", "CHF").
  sigle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, width: 44 },
  nom: { fontSize: 15, color: colors.textPrimary, flex: 1 },
  nomSelected: { fontWeight: '700' },
  check: { fontSize: 15, fontWeight: '700', color: colors.action },
});
