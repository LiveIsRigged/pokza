import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../theme/theme';
import { useLeftEdgeSwipe } from '../navigation/edgeSwipe';

interface WizardScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onBack?: () => void;
  step?: number;
  totalSteps?: number;
  /** Permet à l'étape d'accéder au ScrollView (ex. faire défiler jusqu'à une section dépliée). */
  scrollRef?: React.RefObject<ScrollView | null>;
}

export function WizardScreen({
  title,
  subtitle,
  children,
  onNext,
  nextLabel = 'Continuer',
  nextDisabled,
  onBack,
  step,
  totalSteps,
  scrollRef,
}: WizardScreenProps) {
  // Retour au glissement bord-gauche → droite, double du bouton ‹ Retour (étape précédente, ou
  // sortie du créateur à la première étape). Inerte quand l'étape n'a pas de retour.
  const backSwipe = useLeftEdgeSwipe(onBack ?? (() => {}), !!onBack);
  return (
    <View style={styles.container} {...backSwipe.panHandlers}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹ Retour</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {step && totalSteps ? (
          <Text style={styles.stepIndicator}>
            Étape {step}/{totalSteps}
          </Text>
        ) : null}
      </View>
      <Text style={[typography.postTitle, styles.title]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {onNext && (
        <Pressable
          onPress={onNext}
          disabled={nextDisabled}
          style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    minHeight: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: colors.action,
    fontSize: 14,
    fontWeight: '600',
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  content: {
    flex: 1,
  },
  contentInner: {
    flexGrow: 1,
  },
  nextButton: {
    backgroundColor: colors.action,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  nextButtonDisabled: {
    opacity: 0.35,
  },
  nextText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
