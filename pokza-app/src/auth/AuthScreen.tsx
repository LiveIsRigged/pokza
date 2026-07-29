import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, radius } from '../theme/theme';

type Mode = 'signIn' | 'signUp';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signUpMessage, setSignUpMessage] = useState<string | null>(null);

  const switchMode = () => {
    setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
    setError(null);
    setSignUpMessage(null);
  };

  const handleSubmit = async () => {
    setError(null);
    setSignUpMessage(null);
    setSubmitting(true);
    const { error: authError } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setSubmitting(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    // En signUp, si la confirmation par email est activée côté projet, il n'y a pas encore de
    // session à ce stade (AuthProvider ne bascule donc pas tout seul vers le feed) : on l'explique.
    if (mode === 'signUp') {
      setSignUpMessage('Compte créé. Si la confirmation par email est activée sur le projet, vérifie ta boîte mail avant de te connecter.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pokza</Text>
      <Text style={styles.subtitle}>{mode === 'signIn' ? 'Connecte-toi' : 'Crée un compte'}</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error && <Text style={styles.error}>{error}</Text>}
      {signUpMessage && <Text style={styles.info}>{signUpMessage}</Text>}

      <Pressable
        style={[styles.submitButton, (submitting || !email || !password) && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting || !email || !password}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{mode === 'signIn' ? 'Se connecter' : "S'inscrire"}</Text>
        )}
      </Pressable>

      <Pressable onPress={switchMode} hitSlop={8}>
        <Text style={styles.toggleText}>
          {mode === 'signIn' ? "Pas de compte ? Crée-en un" : 'Déjà un compte ? Connecte-toi'}
        </Text>
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
    borderColor: 'rgba(22,35,61,0.25)',
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
  info: {
    color: colors.textSecondary,
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
  toggleText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
  },
});
