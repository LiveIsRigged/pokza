import React, { useRef, useState } from 'react';
import type { NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../analytics';
import { colors, radius } from '../theme/theme';
import { webOrigin, readInitialDeepLink } from '../navigation/deepLink';
import { openPublicReport, type PublicReportTarget } from '../utils/publicReport';
import { passwordError } from './passwordRules';
import { errorMessage } from '../utils/errorMessage';
import { Turnstile, captchaEnabled, type TurnstileHandle } from './Turnstile';
import { LegalScreen } from '../legal/LegalScreen';
import type { LegalDocId } from '../legal/legalContent';
import {
  EyeIcon,
  EyeOffIcon,
  FeatureCardIcon,
  FeatureChatIcon,
  FeatureShareIcon,
  LockIcon,
  MailIcon,
  PokzaLogo,
} from '../components/ui/authIcons';

const ICON_MUTED = 'rgba(22,35,61,0.5)';

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
  if (match) return match[1];
  // Aucune des tournures Supabase connues. Le repli renvoyait alors le message BRUT — donc en
  // anglais : « Failed to fetch » s'affichait tel quel en rouge sous le formulaire, observé en
  // direct pendant l'audit. `errorMessage` reconnaît en plus les pannes réseau et les formule en
  // français ; pour tout le reste il rend le message d'origine, comme avant.
  return errorMessage(message);
}

/** Champ de saisie avec icône de tête (et éventuel bouton de fin, ex. l'œil du mot de passe). */
function InputRow({ icon, trailing, children }: { icon: React.ReactNode; trailing?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.inputWrap}>
      <View style={styles.inputIcon}>{icon}</View>
      {children}
      {trailing}
    </View>
  );
}

/** En-tête de marque : grand logo + « Pokza » + slogan + trio Crée/Partage/Débat en connexion ;
 *  version compacte (logo + « Pokza » en ligne, sans slogan ni pictos) en inscription, pour laisser
 *  respirer le formulaire plus long. */
function BrandHeader({ compact }: { compact: boolean }) {
  if (compact) {
    return (
      <View style={styles.brandRow}>
        <PokzaLogo size={34} />
        <Text style={styles.brandRowTitle}>Pokza</Text>
      </View>
    );
  }
  return (
    <>
      <View style={styles.logoWrap}>
        <PokzaLogo size={92} />
      </View>
      <Text style={styles.title}>Pokza</Text>
      <Text style={styles.tagline}>
        Le moyen le plus <Text style={styles.taglineAccent}>simple</Text>
        {'\n'}de <Text style={styles.taglineAccent}>partager</Text> ses mains de poker
      </Text>
      <View style={styles.featureRow}>
        <View style={styles.featureCol}>
          <FeatureCardIcon size={38} />
          <Text style={styles.featureLabel}>Crée</Text>
        </View>
        <View style={styles.featureDivider} />
        <View style={styles.featureCol}>
          <FeatureShareIcon size={32} />
          <Text style={styles.featureLabel}>Partage</Text>
        </View>
        <View style={styles.featureDivider} />
        <View style={styles.featureCol}>
          <FeatureChatIcon size={32} />
          <Text style={styles.featureLabel}>Débat</Text>
        </View>
      </View>
    </>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signUpMessage, setSignUpMessage] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  // Consentement obligatoire à l'inscription (18 ans + CGU + confidentialité) et lecture des textes.
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null);

  // Un visiteur qui ouvre un lien partagé (`/post/:id` ou `/invite/:id`) sans compte atterrit ici :
  // on lui offre un accès discret au signalement public (§5.2) pour la cible du lien, sans l'obliger
  // à s'inscrire. Lu une seule fois : l'URL est encore intacte tant qu'on n'est pas connecté.
  const pendingLink = useRef(readInitialDeepLink()).current;
  const reportTarget: PublicReportTarget | null =
    pendingLink?.type === 'post'
      ? { type: 'post', id: pendingLink.postId }
      : pendingLink?.type === 'invite'
        ? { type: 'user', id: pendingLink.userId }
        : null;

  const confirmEmailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  // Jeton anti-robot. `null` tant que le challenge n'est pas résolu — et de nouveau `null` après
  // chaque tentative, puisqu'un jeton Turnstile ne sert qu'une fois.
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  /** Brûle le jeton courant et relance un challenge : à appeler après CHAQUE appel Supabase. */
  const consumeCaptcha = () => {
    setCaptchaToken(null);
    turnstileRef.current?.reset();
  };

  const resetFormState = () => {
    setError(null);
    setSignUpMessage(null);
    setResetSent(false);
    setAcceptedTerms(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetFormState();
  };

  const handleSubmit = async () => {
    setError(null);
    setSignUpMessage(null);

    if (mode === 'signUp') {
      // Ressaisie de l'email : garde-fou anti-faute de frappe (aucun mail de vérification n'est
      // envoyé). Comparaison normalisée — l'email est insensible à la casse et aux espaces autour.
      if (email.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
        setError('Les deux adresses email ne correspondent pas.');
        return;
      }
      const pwError = passwordError(password, confirmPassword);
      if (pwError) {
        setError(pwError);
        return;
      }
      // Garde aussi utile que le bouton désactivé : la touche Entrée déclenche handleSubmit
      // directement, sans passer par l'état "disabled" du bouton.
      if (!acceptedTerms) {
        setError('Pour créer un compte, tu dois certifier avoir 18 ans et accepter les conditions.');
        return;
      }
    }

    if (captchaEnabled && !captchaToken) {
      setError("Patiente une seconde : la vérification anti-robot n'est pas encore terminée.");
      return;
    }

    setSubmitting(true);
    // `options.captchaToken` est ignoré par Supabase tant que le CAPTCHA n'est pas activé côté
    // projet : on peut donc déployer ce code avant d'activer le réglage, sans rien casser.
    const options = captchaToken ? { captchaToken } : undefined;
    const { error: authError } =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password, options })
        : await supabase.auth.signUp({ email, password, options });
    setSubmitting(false);
    consumeCaptcha();

    if (authError) {
      setError(translateAuthError(authError.message));
      return;
    }
    // En signUp, si la confirmation par email est activée côté projet, il n'y a pas encore de
    // session à ce stade (AuthProvider ne bascule donc pas tout seul vers le feed) : on l'explique.
    if (mode === 'signUp') {
      trackEvent('signed_up');
      setSignUpMessage('Compte créé. Si la confirmation par email est activée sur le projet, vérifie ta boîte mail avant de te connecter.');
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    if (captchaEnabled && !captchaToken) {
      setError("Patiente une seconde : la vérification anti-robot n'est pas encore terminée.");
      return;
    }
    setSubmitting(true);
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${webOrigin()}/reset-password`,
      captchaToken: captchaToken ?? undefined,
    });
    setSubmitting(false);
    consumeCaptcha();
    if (authError) {
      setError(translateAuthError(authError.message));
      return;
    }
    setResetSent(true);
  };

  if (mode === 'forgotPassword') {
    return (
      <View style={styles.container}>
        <BrandHeader compact />
        <Text style={styles.subtitle}>Mot de passe oublié</Text>

        {resetSent ? (
          <Text style={styles.info}>
            Si un compte existe avec cet email, un lien de réinitialisation vient d'être envoyé —
            vérifie ta boîte mail.
          </Text>
        ) : (
          <>
            <Text style={styles.helper}>On t'envoie un lien par email pour choisir un nouveau mot de passe.</Text>
            <InputRow icon={<MailIcon color={ICON_MUTED} />}>
              <TextInput
                style={styles.inputField}
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
            </InputRow>
            <Turnstile ref={turnstileRef} onToken={setCaptchaToken} onError={setError} />
            {error && <Text style={styles.error}>{error}</Text>}
            <Pressable
              style={[
                styles.submitButton,
                (submitting || !email || (captchaEnabled && !captchaToken)) && styles.submitButtonDisabled,
              ]}
              onPress={handleForgotPassword}
              disabled={submitting || !email || (captchaEnabled && !captchaToken)}
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
      <BrandHeader compact={mode === 'signUp'} />

      <InputRow icon={<MailIcon color={ICON_MUTED} />}>
        <TextInput
          style={styles.inputField}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
          onSubmitEditing={() => (mode === 'signUp' ? confirmEmailRef.current?.focus() : passwordRef.current?.focus())}
          onKeyPress={onEnterKey(() => (mode === 'signUp' ? confirmEmailRef.current?.focus() : passwordRef.current?.focus()))}
          blurOnSubmit={false}
          value={email}
          onChangeText={setEmail}
        />
      </InputRow>
      {mode === 'signUp' && (
        <InputRow icon={<MailIcon color={ICON_MUTED} />}>
          <TextInput
            ref={confirmEmailRef}
            style={styles.inputField}
            placeholder="Confirme ton email"
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
            value={confirmEmail}
            onChangeText={setConfirmEmail}
          />
        </InputRow>
      )}
      <InputRow
        icon={<LockIcon color={ICON_MUTED} />}
        trailing={
          <Pressable style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
            {showPassword ? <EyeOffIcon color="rgba(22,35,61,0.45)" /> : <EyeIcon color="rgba(22,35,61,0.45)" />}
          </Pressable>
        }
      >
        <TextInput
          ref={passwordRef}
          style={styles.inputField}
          placeholder="Mot de passe"
          placeholderTextColor={colors.textSecondary}
          secureTextEntry={!showPassword}
          autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
          textContentType={mode === 'signUp' ? 'newPassword' : 'password'}
          returnKeyType={mode === 'signUp' ? 'next' : 'go'}
          onSubmitEditing={() => (mode === 'signUp' ? confirmPasswordRef.current?.focus() : handleSubmit())}
          onKeyPress={onEnterKey(() => (mode === 'signUp' ? confirmPasswordRef.current?.focus() : handleSubmit()))}
          blurOnSubmit={mode !== 'signUp'}
          value={password}
          onChangeText={setPassword}
        />
      </InputRow>
      {mode === 'signUp' && (
        <InputRow icon={<LockIcon color={ICON_MUTED} />}>
          <TextInput
            ref={confirmPasswordRef}
            style={styles.inputField}
            placeholder="Confirme le mot de passe"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleSubmit}
            onKeyPress={onEnterKey(handleSubmit)}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />
        </InputRow>
      )}

      {mode === 'signUp' && (
        <Pressable style={styles.consentRow} onPress={() => setAcceptedTerms((v) => !v)}>
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
            {acceptedTerms && <Text style={styles.checkboxTick}>✓</Text>}
          </View>
          <Text style={styles.consentText}>
            Je certifie avoir 18 ans et j'accepte les{' '}
            <Text style={styles.consentLink} onPress={() => setLegalDoc('cgu')}>
              conditions d'utilisation
            </Text>{' '}
            et la{' '}
            <Text style={styles.consentLink} onPress={() => setLegalDoc('confidentialite')}>
              politique de confidentialité
            </Text>
            .
          </Text>
        </Pressable>
      )}

      {mode === 'signIn' && (
        <Pressable onPress={() => switchMode('forgotPassword')} hitSlop={8}>
          <Text style={styles.forgotPasswordText}>Mot de passe oublié ?</Text>
        </Pressable>
      )}

      <Turnstile ref={turnstileRef} onToken={setCaptchaToken} onError={setError} />

      {error && <Text style={styles.error}>{error}</Text>}
      {signUpMessage && <Text style={styles.info}>{signUpMessage}</Text>}

      <Pressable
        style={[
          styles.submitButton,
          (submitting ||
            !email ||
            !password ||
            (mode === 'signUp' && !acceptedTerms) ||
            (captchaEnabled && !captchaToken)) &&
            styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={
          submitting ||
          !email ||
          !password ||
          (mode === 'signUp' && !acceptedTerms) ||
          (captchaEnabled && !captchaToken)
        }
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{mode === 'signIn' ? 'Se connecter' : "S'inscrire"}</Text>
        )}
      </Pressable>

      <Pressable onPress={() => switchMode(mode === 'signIn' ? 'signUp' : 'signIn')} hitSlop={8}>
        <Text style={styles.toggleText}>
          {mode === 'signIn' ? 'Pas de compte ? ' : 'Déjà un compte ? '}
          <Text style={styles.toggleAccent}>{mode === 'signIn' ? 'Crée-en un' : 'Connecte-toi'}</Text>
        </Text>
      </Pressable>

      {reportTarget && (
        <Pressable onPress={() => openPublicReport(reportTarget)} hitSlop={8}>
          <Text style={styles.reportLink}>
            {reportTarget.type === 'post' ? 'Signaler ce contenu sans compte' : 'Signaler ce profil sans compte'}
          </Text>
        </Pressable>
      )}

      {legalDoc && (
        <View style={styles.legalOverlay}>
          <LegalScreen initialDocId={legalDoc} onBack={() => setLegalDoc(null)} />
        </View>
      )}
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
  logoWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 44,
    fontWeight: '700',
    color: colors.tableFelt,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 14,
  },
  taglineAccent: {
    color: colors.action,
    fontWeight: '700',
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 28,
    marginTop: 32,
    marginBottom: 36,
  },
  featureCol: {
    alignItems: 'center',
    gap: 8,
    minWidth: 60,
  },
  featureLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  featureDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(22,35,61,0.14)',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
  },
  brandRowTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.tableFelt,
    letterSpacing: -0.5,
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
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.2)',
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  inputIcon: {
    marginRight: 10,
  },
  inputField: {
    flex: 1,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
    // Web (react-native-web) : neutralise le contour bleu par défaut du navigateur sur le champ focalisé.
    outlineStyle: 'none',
  } as any,
  eyeButton: {
    paddingLeft: 10,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'right',
    marginBottom: 16,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.action,
    borderColor: colors.action,
  },
  checkboxTick: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 16,
  },
  consentText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
  },
  consentLink: {
    color: colors.action,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  legalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
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
  toggleAccent: {
    color: colors.action,
    fontWeight: '700',
  },
  reportLink: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    textDecorationLine: 'underline',
  },
});
