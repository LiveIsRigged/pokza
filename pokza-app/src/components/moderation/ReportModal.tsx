import React, { useEffect, useState } from 'react';
import { Animated, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { borders, colors, radius, spacing, tints } from '../../theme/theme';
import { errorMessage } from '../../utils/errorMessage';
import { REPORT_REASONS, submitReport, type ReportReason, type ReportTargetType } from '../../data/reports';
import { sheetGrabStyle, useSheetDismiss } from '../ui/useSheetDismiss';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  /** Ce qu'on signale, inséré dans le titre : « cette main », « ce commentaire », un pseudo. */
  targetLabel: string;
  /** Appelé après un envoi réussi (ex. pour proposer de bloquer dans la foulée). */
  onSubmitted?: () => void;
}

import { REPORT_DETAILS_MAX_LENGTH as DETAILS_MAX } from '../../constants/limits';

/**
 * Feuille de signalement : choix d'un motif (obligatoire) + précision libre facultative. Le contenu
 * n'est jamais supprimé côté client — on crée seulement une ligne `reports` que la modération
 * traitera. Deux refus métier possibles remontés en clair : cible déjà signalée, et limite anti-abus
 * (30 signalements / 24 h). Après succès, un écran de confirmation remercie et se referme.
 */
export function ReportModal({
  visible,
  onClose,
  reporterId,
  targetType,
  targetId,
  targetLabel,
  onSubmitted,
}: ReportModalProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Glisser le bandeau vers le bas pour fermer, comme les autres bottom-sheets (cf. `useSheetDismiss`).
  const { dragY, grabHandlers } = useSheetDismiss(visible, onClose);

  // Repartir d'un état vierge à chaque ouverture — sinon un précédent motif/erreur/confirmation
  // resterait affiché en rouvrant la feuille sur une autre cible.
  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setSubmitting(false);
      setError(null);
      setDone(false);
    }
  }, [visible]);

  const handleSubmit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitReport({ reporterId, targetType, targetId, reason, details });
      setDone(true);
      onSubmitted?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropFill} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: dragY }] }]}>
          <View style={sheetGrabStyle} {...grabHandlers}>
            <View style={styles.handleRow}>
              <View style={styles.handle} />
            </View>
          </View>

          {done ? (
            <View style={styles.doneWrap}>
              <Text style={styles.doneTitle}>Merci, c'est envoyé</Text>
              <Text style={styles.doneText}>
                Ton signalement a été transmis à la modération. Nous examinons chaque signalement et
                agissons quand une règle n'est pas respectée.
              </Text>
              <Pressable style={styles.submitButton} onPress={onClose}>
                <Text style={styles.submitButtonText}>Fermer</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Signaler {targetLabel}</Text>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.closeButton}>✕</Text>
                </Pressable>
              </View>

              <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
                <Text style={styles.sectionLabel}>Pourquoi signales-tu ce contenu ?</Text>
                {REPORT_REASONS.map((r) => {
                  const selected = reason === r.value;
                  return (
                    <Pressable
                      key={r.value}
                      style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                      onPress={() => setReason(r.value)}
                    >
                      <View style={[styles.radio, selected && styles.radioSelected]}>
                        {selected && <View style={styles.radioDot} />}
                      </View>
                      <Text style={[styles.reasonLabel, selected && styles.reasonLabelSelected]}>{r.label}</Text>
                    </Pressable>
                  );
                })}

                <Text style={[styles.sectionLabel, styles.detailsLabel]}>Précision (facultatif)</Text>
                <TextInput
                  style={styles.detailsInput}
                  placeholder="Ajoute un détail utile à la modération…"
                  value={details}
                  onChangeText={(t) => setDetails(t.slice(0, DETAILS_MAX))}
                  multiline
                  maxLength={DETAILS_MAX}
                />

                {error && <Text style={styles.error}>{error}</Text>}
              </ScrollView>

              <View style={styles.footer}>
                <Pressable
                  style={[styles.submitButton, (!reason || submitting) && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={!reason || submitting}
                >
                  <Text style={styles.submitButtonText}>{submitting ? 'Envoi…' : 'Envoyer le signalement'}</Text>
                </Pressable>
              </View>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  backdropFill: {
    flex: 1,
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: spacing.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: tints.medium,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  closeButton: {
    fontSize: 18,
    color: colors.textSecondary,
    padding: 4,
  },
  list: {
    flexGrow: 0,
  },
  listContent: {
    padding: spacing.md,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  detailsLabel: {
    marginTop: spacing.lg,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  reasonRowSelected: {
    backgroundColor: 'rgba(232,87,31,0.08)',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: borders.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.action,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  reasonLabel: {
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  reasonLabelSelected: {
    fontWeight: '700',
  },
  detailsInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  error: {
    fontSize: 13,
    color: '#C0392B',
    marginTop: spacing.sm,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
  },
  submitButton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  doneWrap: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  doneTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  doneText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
});
