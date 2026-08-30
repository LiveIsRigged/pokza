import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, typography } from '../theme/theme';
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
  /**
   * Une phrase collée au bouton, qui dit la conséquence de ce qu'on vient de faire — utilisée par
   * la correction d'une main, où le bouton change de sens selon les champs modifiés (« Valider »
   * publie, « Continuer » fait ressaisir la suite). Elle est là pour que ce basculement soit
   * ANNONCÉ et non subi : un bouton qui change de rôle sous le doigt, sans un mot, fait mal taper.
   */
  footerNote?: string | null;
  /**
   * Une sortie SECONDAIRE, sous le bouton principal : un lien texte, pas une pastille. Sert aux
   * écrans de street, qui n'ont justement pas de bouton principal (leur sortie normale, c'est
   * d'enregistrer les actions jusqu'à ce que la street se termine d'elle-même) et dont
   * l'emplacement du bas est donc vide — c'est là que se pose « Arrêter la main ici ».
   *
   * Volontairement un lien et non une pastille : la pastille orange veut dire « la suite normale de
   * l'assistant », et une sortie de secours n'en est pas une. Elle deviendrait alors l'élément le
   * plus lourd de l'écran, juste sous des boutons d'action qui, eux, sont le vrai sujet.
   */
  footerLink?: { label: string; onPress: () => void };
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
  footerNote,
  footerLink,
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
      {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
      {onNext && (
        <Pressable
          onPress={onNext}
          disabled={nextDisabled}
          style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </Pressable>
      )}
      {footerLink && (
        <Pressable onPress={footerLink.onPress} style={styles.footerLink}>
          <Text style={styles.footerLinkText}>{footerLink.label}</Text>
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
  footerNote: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
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
  footerLink: {
    // Le filet sépare le lien du dernier élément du contenu qui défile — sur une street courte, la
    // rangée de boutons d'action finit juste au-dessus.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
    // 20 et non 12 : sur une street dont le contenu remplit l'écran, la rangée d'actions finit
    // juste au-dessus, et mesuré à 12 il ne restait que 12 px entre la pastille « Tapis » et le
    // filet. Deux cibles voisines dont l'une change d'écran, c'est trop peu.
    marginTop: 20,
    // 16 + 14 autour d'une ligne de 15 px : la cible fait un peu moins de 50 px de haut, et la
    // marge du dessus l'écarte encore des pastilles d'action.
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: 'center',
  },
  footerLinkText: {
    // Même écriture que « ‹ Retour » en haut de l'écran : c'est le vocabulaire de l'app pour une
    // sortie qui n'est pas une action de poker.
    color: colors.action,
    fontSize: 15,
    fontWeight: '700',
  },
});
