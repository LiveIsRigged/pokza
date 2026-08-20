import React, { useRef, useState } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { supabase } from '../lib/supabase';
import { borders, colors, radius } from '../theme/theme';
import { clearDeepLinkFromUrl } from '../navigation/deepLink';
import { passwordError } from './passwordRules';

// Même limite de `onSubmitEditing` sur web que dans AuthScreen — cf. sa fonction `onEnterKey`.
function onEnterKey(handler: () => void) {
  return (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Enter') handler();
  };
}

interface NewPasswordScreenProps {
  onDone: () => void;
  onCancel: () => void;
}

/** Affiché à la place du feed quand la session courante vient d'un lien "mot de passe oublié"
 * (cf. `passwordRecovery` dans state/auth) — c'est une session valide comme une autre, donc rien
 * d'autre ne forcerait ce détour sans ce garde-fou explicite dans App.tsx. */
export function NewPasswordScreen({ onDone, onCancel }: NewPasswordScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const handleSubmit = async () => {
    setError(null);
    const pwError = passwordError(password, confirmPassword);
    if (pwError) {
      setError(pwError);
      return;
    }
    setSubmitting(true);
    const { error: authError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (authError) {
      setError(authError.message);
      return;
    }
    clearDeepLinkFromUrl();
    onDone();
  };

  const handleCancel = () => {
    supabase.auth.signOut();
    onCancel();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pokza</Text>
      <Text style={styles.subtitle}>Choisis un nouveau mot de passe</Text>

      <TextInput
        style={styles.input}
        placeholder="Nouveau mot de passe"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        returnKeyType="next"
        onSubmitEditing={() => confirmPasswordRef.current?.focus()}
        onKeyPress={onEnterKey(() => confirmPasswordRef.current?.focus())}
        blurOnSubmit={false}
        value={password}
        onChangeText={setPassword}
      />
      <TextInput
        ref={confirmPasswordRef}
        style={styles.input}
        placeholder="Confirme le mot de passe"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={handleSubmit}
        onKeyPress={onEnterKey(handleSubmit)}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.submitButton, (submitting || !password || !confirmPassword) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting || !password || !confirmPassword}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Valider</Text>}
      </Pressable>

      <Pressable onPress={handleCancel} hitSlop={8}>
        <Text style={styles.cancelText}>Annuler</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: colors.feedBackground,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.tableFelt,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    color: colors.textPrimary,
  },
  error: {
    color: '#C0392B',
    fontSize: 13,
    marginBottom: 12,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});
