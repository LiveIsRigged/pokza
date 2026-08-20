import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { colors, radius, spacing } from '../../theme/theme';
import { PokzaLogo } from './authIcons';

interface ConnectionErrorScreenProps {
  /** Déjà mis en forme par `errorMessage()` — pas de texte technique brut ici. */
  message: string;
  onRetry: () => void;
}

/**
 * Écran plein affiché quand l'app n'arrive pas à savoir si le compte a un profil, et seulement
 * après un délai de grâce (cf. `App.tsx`) : un incident d'une seconde se règle tout seul, l'afficher
 * ferait clignoter l'écran pour rien.
 *
 * ⚠️ Le bouton n'est PAS le seul moyen de s'en sortir : `useProfileStatus` réessaie déjà tout seul,
 * en espaçant les tentatives. L'écran disparaît de lui-même dès que le réseau revient, même sans
 * toucher à rien. Le bouton ne fait qu'abréger l'attente pour qui n'a pas envie de patienter.
 */
export function ConnectionErrorScreen({ message, onRetry }: ConnectionErrorScreenProps) {
  return (
    <View style={styles.container}>
      <PokzaLogo size={92} />
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={styles.button}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={styles.buttonText}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.feedBackground,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  message: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    color: colors.textSecondary,
    maxWidth: 320,
  },
  button: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
