import React, { useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { updateGroupDescription } from '../data/groups';

import { GROUP_DESCRIPTION_MAX_LENGTH as DESCRIPTION_MAX_LENGTH } from '../constants/limits';

interface EditGroupScreenProps {
  groupId: string;
  initialDescription?: string;
  onCancel: () => void;
  onSaved: (description: string) => void;
}

/** Overlay au-dessus de `GroupScreen`, même mécanique que `EditProfileScreen` — seule la
 * description est modifiable ici (le nom pourrait l'être, la policy le permet déjà, mais n'a pas
 * été demandé). */
export function EditGroupScreen({ groupId, initialDescription, onCancel, onSaved }: EditGroupScreenProps) {
  const [description, setDescription] = useState(initialDescription ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await updateGroupDescription(groupId, description);
      onSaved(description.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onCancel} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
        </View>

        <Text style={styles.title}>Modifier le groupe privé</Text>

        <View style={styles.labelRow}>
          <Text style={styles.label}>Description</Text>
          <Text style={styles.counter}>
            {description.length}/{DESCRIPTION_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={(text) => setDescription(text.slice(0, DESCRIPTION_MAX_LENGTH))}
          placeholder="À quoi sert ce groupe ?"
          multiline
          maxLength={DESCRIPTION_MAX_LENGTH}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={styles.submitButton} onPress={handleSave} disabled={submitting}>
          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Enregistrer</Text>}
        </Pressable>
      </ScrollView>
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
    zIndex: 10,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 60,
  },
  topRow: {
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.tableFelt,
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  counter: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  error: {
    color: '#C0392B',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
