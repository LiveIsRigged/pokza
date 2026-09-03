import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing, tints, typography } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import { NewGroupForm } from './NewGroupForm';
import type { Group } from '../data/groups';

interface GroupPickerScreenProps {
  /** Déjà ordonnés, le plus récemment utilisé en tête. */
  groups: Group[];
  selectedId?: string;
  onSelect: (groupId: string) => void;
  onCreateGroup: (name: string) => Promise<string>;
  onBack: () => void;
}

/**
 * Sélecteur plein écran, ouvert depuis « Choisir un autre groupe » quand la rangée de chips est
 * repliée. Overlay LOCAL à l'écran appelant, jamais un écran de `App.tsx` : le créateur n'existe
 * que le temps de la saisie, en sortir détruirait la main en cours.
 *
 * En `FlatList` et non en `ScrollView` : à cent groupes, un `ScrollView` monterait les cent lignes
 * et leurs cent avatars d'un coup. Le champ de recherche est posé AU-DESSUS de la liste et non en
 * en-tête de celle-ci, sinon il perd le focus à chaque frappe quand la liste se re-rend.
 */
export function GroupPickerScreen({ groups, selectedId, onSelect, onCreateGroup, onBack }: GroupPickerScreenProps) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  return (
    <View style={styles.overlay}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Choisir un groupe privé</Text>
      </View>

      <TextInput
        autoComplete="off"
        style={styles.search}
        placeholder="Rechercher un groupe"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />

      <FlatList
        data={filtered}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>Aucun groupe ne porte ce nom.</Text>}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.groupRow, item.id === selectedId && styles.groupRowSelected]}
            onPress={() => onSelect(item.id)}
          >
            <Avatar url={item.avatarUrl} name={item.name} size={40} shape="square" />
            <Text style={styles.groupName} numberOfLines={1}>
              {item.name}
            </Text>
            {item.id === selectedId && <Text style={styles.selectedMark}>✓</Text>}
          </Pressable>
        )}
        ListFooterComponent={
          creating ? (
            <NewGroupForm
              onCreate={async (name) => {
                const groupId = await onCreateGroup(name);
                onSelect(groupId);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : (
            <Pressable style={styles.createButton} onPress={() => setCreating(true)}>
              <Text style={styles.createButtonText}>+ Créer un groupe privé</Text>
            </Pressable>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  search: {
    marginHorizontal: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  groupRowSelected: {
    backgroundColor: tints.light,
  },
  groupName: {
    ...typography.authorName,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  selectedMark: {
    marginLeft: 'auto',
    fontSize: 16,
    fontWeight: '700',
    color: colors.action,
  },
  emptyText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  createButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
