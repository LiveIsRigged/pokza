import React, { useRef, useState } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { colors, radius } from '../theme/theme';
import { webOrigin } from '../navigation/deepLink';
import { passwordError } from './passwordRules';

type Mode = 'signIn' | 'signUp' | 'forgotPassword';

// `onSubmitEditing` seul ne suffit pas : sur web, react-native-web ne le déclenche pas de façon
// fiable sur la touche Entrée (contrairement au clavier natif iOS/Android, où c'est la touche
// "retour" du clavier virtuel). `onKeyPress` capte l'Entrée du clavier physique dans les deux
// mondes — les deux gestionnaires coexistent sans conflit, chacun couvrant sa plateforme.
function onEnterKey(handler: () => void) {
  return (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Enter') handler();
  };
}

// Messages Supabase Auth en anglais, non traduits nulle part côté serveur — mappés vers le
// français comme le reste des erreurs de l'app (cf. codes 23505/23514 dans CompleteProfileScreen).
// Comparaison insensible à la casse : Supabase ne garantit pas la casse exacte d'une version à l'autre.
const AUTH_ERROR_TRANSLATIONS: [string, string][] = [
  ['invalid login credentials', 'Email ou mot de passe incorrect.'],
  ['user already registered', 'Un compte existe déjà avec cet email.'],
  ['password should be at least', 'Le mot de passe doit contenir au moins 6 caractères.'],
  ['unable to validate email address', "Format d'email invalide."],
  ['email not confirmed', "Confirme d'abord ton email avant de te connecter."],
];

function translateAuthError(message: string): string {
  const lower = message.toLowerCase();
  const match = AUTH_ERROR_TRANSLATIONS.find(([needle]) => lower.includes(needle));
  return match ? match[1] : message;
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signUpMessage, setSignUpMessage] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const resetFormState = () => {
    setError(null);
    setSignUpMessage(null);
    setResetSent(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetFormState();
  };

  const handleSubmit = async () => {
    setError(null);
    setSignUpMessage(null);

    if (mode === 'signUp') {
      const pwError = passwordError(password, confirmPassword);
      if (pwError) {
        setError(pwError);
        return;
      }
    }

    setSubmitting(true);
    const { error: authError } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setSubmitting(false);

    if (authError) {
      setError(translateAuthError(authError.message));
      return;
    }
    // En signUp, si la confirmation par email est activée côté projet, il n'y a pas encore de
    // session à ce stade (AuthProvider ne bascule donc pas tout seul vers le feed) : on l'explique.
    if (mode === 'signUp') {
      setSignUpMessage('Compte créé. Si la confirmation par email est activée sur le projet, vérifie ta boîte mail avant de te connecter.');
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setSubmitting(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${webOrigin()}/reset-password`,
    });
    setSubmitting(false);
    if (authError) {
      setError(translateAuthError(authError.message));
      return;
    }
    setResetSent(true);
  };

  if (mode === 'forgotPassword') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pokza</Text>
        <Text style={styles.subtitle}>Mot de passe oublié</Text>

        {resetSent ? (
          <Text style={styles.info}>
            Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé —
            vérifie ta boîte mail.
          </Text>
        ) : (
          <>
            <Text style={styles.helper}>On t'envoie un lien par email pour choisir un nouveau mot de passe.</Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="go"
              onSubmitEditing={handleForgotPassword}
              onKeyPress={onEnterKey(handleForgotPassword)}
              value={email}
              onChangeText={setEmail}
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={[styles.submitButton, (submitting || !email) && styles.submitButtonDisabled]}
              onPress={handleForgotPassword}
              disabled={submitting || !email}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Envoyer le lien</Text>}
            </Pressable>
          </>
        )}

        <Pressable onPress={() => switchMode('signIn')} hitSlop={8}>
          <Text style={styles.toggleText}>← Retour à la connexion</Text>
        </Pressable>
      </View>
    );
  }

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
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        onKeyPress={onEnterKey(() => passwordRef.current?.focus())}
        blurOnSubmit={false}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        ref={passwordRef}
        style={styles.input}
        placeholder="Mot de passe"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
        textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
        returnKeyType={mode === 'signUp' ? 'next' : 'go'}
        onSubmitEditing={() => (mode === 'signUp' ? confirmPasswordRef.current?.focus() : handleSubmit())}
        onKeyPress={onEnterKey(() => (mode === 'signUp' ? confirmPasswordRef.current?.focus() : handleSubmit()))}
        blurOnSubmit={mode !== 'signUp'}
        value={password}
        onChangeText={setPassword}
      />
      {mode === 'signUp' && (
        <TextInput
          ref={confirmPasswordRef}
          style={styles.input}
          placeholder="Confirme le mot de passe"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={handleSubmit}
          onKeyPress={onEnterKey(handleSubmit)}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
      )}

      {mode === 'signIn' && (
        <Pressable onPress={() => switchMode('forgotPassword')} hitSlop={8}>
          <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
        </Pressable>
      )}

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

      <Pressable onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')} hitSlop={8}>
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
  helper: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
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
  forgotPasswordText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 16,
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
