import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, hitSlopPairLeft, hitSlopPairRight, radius, spacing } from '../theme/theme';
import { GROUP_NAME_MAX_LENGTH } from '../constants/limits';
import { errorMessage } from '../utils/errorMessage';

interface NewGroupFormProps {
  /** Doit lever en cas d'échec : le message est alors affiché ici et la saisie est conservée. */
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * Création d'un groupe sans quitter l'écran courant. Partagée entre l'étape « Publier » du
 * créateur, la modification d'une main et le sélecteur de groupe — trois endroits où sortir vers
 * « Mes groupes » ferait perdre la saisie en cours.
 */
export function NewGroupForm({ onCreate, onCancel }: NewGroupFormProps) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmed);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <TextInput
        style={styles.input}
        placeholder="Nom du groupe privé"
        value={name}
        onChangeText={(t) => setName(t.slice(0, GROUP_NAME_MAX_LENGTH))}
        maxLength={GROUP_NAME_MAX_LENGTH}
        autoFocus
      />
      <View style={styles.actions}>
        <Pressable style={styles.cancelButton} onPress={onCancel} hitSlop={hitSlopPairLeft}>
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </Pressable>
        <Pressable
          style={[styles.confirmButton, (!name.trim() || submitting) && styles.confirmButtonDisabled]}
          onPress={() => void submit()}
          disabled={!name.trim() || submitting}
          hitSlop={hitSlopPairRight}
        >
          <Text style={styles.confirmButtonText}>{submitting ? 'Création…' : 'Créer'}</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    marginTop: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
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
  error: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.error,
  },
});
