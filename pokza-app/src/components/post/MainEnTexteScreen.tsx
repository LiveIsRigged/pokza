import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Pressable } from '../ui/Pressable';
import { mainEnTexte, scinderSignature } from '../../engine/mainEnTexte';
import type { PartieDecrite } from '../../utils/denomination';
import { borders, colors, radius, spacing, typography } from '../../theme/theme';

interface MainEnTexteScreenProps {
  visible: boolean;
  /** La main et son contexte. Un `Post` remplit ce contrat tel quel. */
  partie: PartieDecrite;
  onFermer: () => void;
}

/** Le temps que « Copié » reste affiché : assez pour être lu, assez court pour ne pas traîner. */
const DUREE_CONFIRMATION_MS = 2000;

/**
 * LA MAIN EN TEXTE, à emporter.
 * ────────────────────────────
 * Le coup en phrases, pour le coller sur un forum, dans un Discord, dans un message — là où le
 * replayer de Pokza ne va pas. Le texte lui-même est bâti par `mainEnTexte` ; cet écran ne fait que
 * le montrer et le mettre dans le presse-papier.
 *
 * En `Modal` et non en calque absolu : cet écran s'ouvre AUSSI depuis le menu « ⋯ » d'une main du
 * feed, donc depuis l'intérieur d'une liste défilante, où un calque absolu se ferait rogner (même
 * piège que `EditPostScreen.tsx:310`). Le modal, lui, sort de la hiérarchie de défilement.
 *
 * Le texte est `selectable` en plus du bouton : sur ordinateur on copie souvent à la souris, et un
 * bloc qu'on ne peut pas sélectionner donne l'impression d'une image.
 */
export function MainEnTexteScreen({ visible, partie, onFermer }: MainEnTexteScreenProps) {
  /** 'copie' après un succès, 'refus' quand le presse-papier du navigateur nous ferme la porte. */
  const [issue, setIssue] = useState<null | 'copie' | 'refus'>(null);
  // Le texte n'est bâti qu'à l'ouverture, et refait si la main change : il rejoue toute la main
  // step par step, ce n'est pas un calcul à refaire à chaque rendu du modal.
  const texte = useMemo(() => (visible ? mainEnTexte(partie) : ''), [visible, partie]);
  // Pour l'affichage seulement : la signature se grise, mais c'est bien `texte` entier qui part
  // dans le presse-papier (cf. `scinderSignature`).
  const { corps, signature } = useMemo(() => scinderSignature(texte), [texte]);

  // La confirmation retombe d'elle-même, et surtout : elle ne survit pas à la fermeture. Sans ça,
  // rouvrir l'écran juste après une copie afficherait « Copié » sans que rien n'ait été copié.
  useEffect(() => {
    if (!issue) return;
    const t = setTimeout(() => setIssue(null), DUREE_CONFIRMATION_MS);
    return () => clearTimeout(t);
  }, [issue]);
  useEffect(() => {
    if (!visible) setIssue(null);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onFermer}>
      <View style={styles.page}>
        <View style={styles.topRow}>
          <Pressable onPress={onFermer} hitSlop={8}>
            <Text style={styles.fermer}>←</Text>
          </Pressable>
          <Text style={styles.titre}>La main en texte</Text>
        </View>

        <ScrollView style={styles.corps} contentContainerStyle={styles.corpsInner}>
          {/* Imbriqué, et non posé à côté : deux <Text> frères couperaient la sélection à la
              souris en deux, et « tout sélectionner puis copier » — la porte de sortie quand le
              presse-papier refuse — ne prendrait plus que la moitié du texte. */}
          <Text selectable style={styles.texte}>
            {corps}
            <Text style={styles.signature}>{signature}</Text>
          </Text>
        </ScrollView>

        <View style={styles.pied}>
          <Pressable
            style={styles.bouton}
            onPress={async () => {
              // Le presse-papier peut REFUSER : navigateur qui l'interdit, permission coupée, page
              // servie hors contexte sécurisé. Sans ce filet, le bouton ne faisait alors
              // absolument rien — pas de texte copié, pas un mot pour le dire. Le texte étant
              // sélectionnable, il reste une porte de sortie, et c'est celle qu'on indique.
              try {
                await Clipboard.setStringAsync(texte);
                setIssue('copie');
              } catch {
                setIssue('refus');
              }
            }}
          >
            <Text style={styles.boutonTexte}>
              {issue === 'copie'
                ? 'Copié ✓'
                : issue === 'refus'
                  ? 'Sélectionne le texte pour le copier'
                  : 'Copier le texte'}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: spacing.md,
  },
  fermer: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  titre: {
    ...typography.postTitle,
    color: colors.textPrimary,
  },
  corps: {
    flex: 1,
  },
  corpsInner: {
    paddingHorizontal: 14,
    paddingBottom: spacing.lg,
  },
  texte: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  // La signature n'appartient pas à la main : elle se lit comme une mention, pas comme une ligne du
  // coup. Grisée et en italique ICI seulement — le texte copié, lui, est du texte brut.
  signature: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  pied: {
    paddingHorizontal: 14,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: borders.default,
  },
  bouton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  boutonTexte: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
