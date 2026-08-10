import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/theme';

interface Props {
  children: React.ReactNode;
  /** Repli affiché si le sous-arbre plante au rendu. Absent → message discret par défaut. */
  fallback?: React.ReactNode;
  /** Étiquette de contexte pour la trace console (ex. l'id du post concerné). */
  label?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Barrière d'erreur : isole un plantage de rendu à son sous-arbre au lieu de laisser tout l'écran
 * devenir blanc. Indispensable là où on affiche des données produites ailleurs (ex. une main :
 * une seule main malformée ferait sinon planter tout le feed). React impose une classe pour cette
 * API (`getDerivedStateFromError` / `componentDidCatch`) — pas d'équivalent en hook.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // L'utilisateur voit le repli ; on garde une trace pour le debug.
    console.error(`[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ''}]`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <View style={styles.fallback}>
            <Text style={styles.text}>Ce contenu n'a pas pu s'afficher.</Text>
          </View>
        )
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  text: {
    ...typography.description,
    color: colors.textSecondary,
  },
});
