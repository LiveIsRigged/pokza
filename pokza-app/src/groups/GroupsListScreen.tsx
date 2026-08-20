import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { colors, radius, spacing, typography } from '../theme/theme';
import { createGroup, fetchMyGroups, type Group } from '../data/groups';
import { Avatar } from '../components/ui/Avatar';

import { GROUP_NAME_MAX_LENGTH } from '../constants/limits';

interface GroupsListScreenProps {
  currentUserId: string;
  onBack: () => void;
  onSelectGroup: (groupId: string) => void;
}

export function GroupsListScreen({ currentUserId, onBack, onSelectGroup }: GroupsListScreenProps) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMyGroups(currentUserId)
      .then((data) => {
        if (!cancelled) {
          setGroups(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSubmitting(true);
    try {
      const groupId = await createGroup(name);
      setCreating(false);
      setNewName('');
      onSelectGroup(groupId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Mes groupes privés</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>Chargement…</Text>
        ) : groups.length === 0 ? (
          <Text style={styles.statusText}>Aucun groupe privé pour l'instant.</Text>
        ) : (
          groups.map((g) => (
            <Pressable key={g.id} style={styles.groupRow} onPress={() => onSelectGroup(g.id)}>
              <Avatar url={g.avatarUrl} name={g.name} size={40} shape="square" />
              <Text style={styles.groupName}>{g.name}</Text>
            </Pressable>
          ))
        )}

        {creating ? (
          <View style={styles.createForm}>
            <TextInput
              style={styles.input}
              placeholder="Nom du groupe privé"
              value={newName}
              onChangeText={(text) => setNewName(text.slice(0, GROUP_NAME_MAX_LENGTH))}
              maxLength={GROUP_NAME_MAX_LENGTH}
              autoFocus
            />
            <View style={styles.createActions}>
              <Pressable
                style={styles.cancelButton}
                onPress={() => {
                  setCreating(false);
                  setNewName('');
                }}
                hitSlop={8}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, !newName.trim() && styles.confirmButtonDisabled]}
                onPress={handleCreate}
                disabled={!newName.trim() || submitting}
                hitSlop={8}
              >
                <Text style={styles.confirmButtonText}>Créer</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.createButton} onPress={() => setCreating(true)}>
            <Text style={styles.createButtonText}>+ Créer un groupe privé</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
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
  content: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  statusText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,35,61,0.15)',
  },
  groupName: {
    ...typography.authorName,
    color: colors.textPrimary,
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
  createForm: {
    marginTop: spacing.lg,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: '#fff',
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});
