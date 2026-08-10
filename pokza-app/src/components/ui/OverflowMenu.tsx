import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/theme';

export interface OverflowMenuItem {
  label: string;
  icon?: string;
  /** Style « attention » (rouge) pour les actions sensibles : bloquer, signaler… */
  destructive?: boolean;
  onPress: () => void;
}

/**
 * Petit menu contextuel en feuille basse (façon action sheet iOS), ouvert depuis un « ⋯ ». Réutilisé
 * partout où on propose Signaler / Bloquer (carte de main, commentaire, profil). Choisir une action
 * ferme d'abord le menu PUIS déclenche l'action, pour éviter qu'une modale ouverte par l'action se
 * retrouve masquée par le menu resté au-dessus.
 */
export function OverflowMenu({
  visible,
  onClose,
  items,
}: {
  visible: boolean;
  onClose: () => void;
  items: OverflowMenuItem[];
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {items.map((item, i) => (
            <Pressable
              key={i}
              style={[styles.item, i > 0 && styles.itemBorder]}
              onPress={() => {
                onClose();
                item.onPress();
              }}
            >
              {item.icon != null && <Text style={styles.itemIcon}>{item.icon}</Text>}
              <Text style={[styles.itemLabel, item.destructive && styles.itemDestructive]}>{item.label}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>Annuler</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.xs,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(22,35,61,0.12)',
  },
  itemIcon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
  },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  itemDestructive: {
    color: '#C0392B',
  },
  cancel: {
    marginTop: spacing.xs,
    marginHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textSecondary,
  },
});
