import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing } from '../theme/theme';
import {
  getReportContext,
  resolveReport,
  sanctionUser,
  setContentStatus,
  isSanctionActive,
  REPORT_STATUS_CLE,
  SANCTION_TYPE_CLE,
  type ReportContext,
} from '../data/admin';
import { reportReasonLabel } from '../data/reports';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { BlockIcon, ClockIcon, TrashIcon, WarningIcon, type IconProps } from '../components/ui/icons';
import { useT } from '../i18n';
import { langueCourante } from '../i18n/traduire';

interface AdminReportDetailScreenProps {
  reportId: string;
  onBack: () => void;
  onOpenUser: (userId: string) => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(langueCourante(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function AdminReportDetailScreen({ reportId, onBack, onOpenUser }: AdminReportDetailScreenProps) {
  const t = useT();
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Action de modération en attente de confirmation (contenu retiré, avertissement, suspension,
  // bannissement) — un seul `ConfirmSheet` partagé, paramétré par ce que le bouton pressé y dépose.
  const [pendingAction, setPendingAction] = useState<{
    icon: React.ComponentType<IconProps>;
    title: string;
    message?: string;
    confirmLabel: string;
    execute: () => Promise<void>;
  } | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getReportContext(reportId)
      .then((data) => {
        if (cancelled) return;
        setCtx(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  useEffect(() => load(), [load]);

  const target = ctx?.target ?? null;
  const targetType = ctx?.report.targetType;
  // L'« auteur » à sanctionner : l'auteur du contenu (post/comment) ou le compte lui-même (user).
  const authorId = (target?.author_id as string | undefined) ?? (target?.id as string | undefined);
  const contentModStatus = target?.mod_status as string | undefined;

  // Exécute une action admin puis recharge le contexte pour refléter le nouvel état (statut du
  // contenu, sanctions, statut du signalement). Un message de confirmation transitoire s'affiche.
  const run = async (label: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setFeedback(null);
    try {
      await fn();
      setFeedback(label);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t('admin.detail_titre')}</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}

      {loading || !ctx ? (
        <Text style={styles.statusText}>{t('commun.chargement')}</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Signalement */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.reason}>{reportReasonLabel(ctx.report.reason)}</Text>
              {ctx.report.severity === 'priority' && <Text style={styles.priorityBadge}>{t('admin.prioritaire')}</Text>}
            </View>
            <Text style={styles.metaLine}>{t('admin.statut_ligne', { statut: t(REPORT_STATUS_CLE[ctx.report.status]) })}</Text>
            <Text style={styles.metaLine}>{t('admin.recu_le', { date: formatDateTime(ctx.report.createdAt) })}</Text>
            {ctx.report.reporterEmail ? (
              <Text style={styles.metaLine}>{t('admin.signaleur', { email: ctx.report.reporterEmail })}</Text>
            ) : null}
            {ctx.report.details ? <Text style={styles.detailsText}>« {ctx.report.details} »</Text> : null}
            <Text style={styles.metaLine}>
              {t('admin.signalements_sur_cible', { count: ctx.reportsOnTarget })} ·{' '}
              {t('admin.signalements_sur_compte', { count: ctx.reportsOnAuthorAsUser })}
            </Text>
          </View>

          {/* Contenu visé */}
          <Text style={styles.sectionTitle}>{t('admin.contenu_signale')}</Text>
          <View style={styles.card}>
            {targetType === 'post' && (
              <>
                <Text style={styles.contentTitle}>{(target?.title as string) || t('admin.sans_titre')}</Text>
                {target?.description ? <Text style={styles.contentBody}>{target.description as string}</Text> : null}
              </>
            )}
            {targetType === 'comment' && (
              <Text style={styles.contentBody}>{(target?.body as string) || t('admin.commentaire_vide')}</Text>
            )}
            {targetType === 'user' && (
              <Text style={styles.contentTitle}>@{(target?.pseudo as string) || '?'}</Text>
            )}
            {target == null && <Text style={styles.contentBody}>{t('admin.contenu_introuvable')}</Text>}
            {contentModStatus && (
              <Text style={styles.modStatusBadge}>{t('admin.etat_moderation', { etat: contentModStatus })}</Text>
            )}
          </View>

          {/* Actions sur le contenu (post/comment uniquement) */}
          {(targetType === 'post' || targetType === 'comment') && target != null && (
            <>
              <Text style={styles.sectionTitle}>{t('admin.agir_sur_contenu')}</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    run(t('admin.contenu_masque'), () => setContentStatus(targetType, ctx.report.targetId, 'hidden', note || undefined))
                  }
                >
                  <Text style={styles.actionBtnText}>{t('admin.masquer')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionDanger, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    setPendingAction({
                      icon: TrashIcon,
                      title: t('admin.retirer_contenu_titre', { cible: t(targetType === 'post' ? 'signalement.cible_main' : 'signalement.cible_commentaire') }),
                      message: t('admin.retirer_contenu_message'),
                      confirmLabel: t('commun.retirer'),
                      execute: () =>
                        run(t('admin.contenu_retire'), () =>
                          setContentStatus(targetType, ctx.report.targetId, 'removed', note || undefined)
                        ),
                    })
                  }
                >
                  <Text style={[styles.actionBtnText, styles.actionDangerText]}>{t('commun.retirer')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    run(t('admin.contenu_retabli'), () => setContentStatus(targetType, ctx.report.targetId, 'visible'))
                  }
                >
                  <Text style={styles.actionBtnText}>{t('admin.retablir')}</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Auteur + sanctions */}
          {authorId && (
            <>
              <Text style={styles.sectionTitle}>{t('admin.auteur')}</Text>
              <View style={styles.card}>
                {ctx.authorSanctions.length === 0 ? (
                  <Text style={styles.metaLine}>{t('admin.aucune_sanction')}</Text>
                ) : (
                  ctx.authorSanctions.map((s) => (
                    <View key={s.id} style={styles.sanctionRow}>
                      <Text style={styles.sanctionType}>
                        {t(SANCTION_TYPE_CLE[s.type])}
                        {isSanctionActive(s) ? '' : ` ${t('admin.levee_expiree')}`}
                      </Text>
                      <Text style={styles.metaLine}>{formatDateTime(s.createdAt)}</Text>
                    </View>
                  ))
                )}
                <Pressable style={styles.linkBtn} onPress={() => onOpenUser(authorId)}>
                  <Text style={styles.linkBtnText}>{t('admin.voir_fiche')}</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>{t('admin.sanctionner_auteur')}</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    setPendingAction({
                      icon: WarningIcon,
                      title: t('admin.avertir_titre'),
                      confirmLabel: t('admin.avertir'),
                      execute: () =>
                        run(t('admin.avertissement_envoye'), () => sanctionUser(authorId, 'warning', note || undefined)),
                    })
                  }
                >
                  <Text style={styles.actionBtnText}>{t('admin.avertir')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    setPendingAction({
                      icon: ClockIcon,
                      title: t('admin.suspendre_titre'),
                      confirmLabel: t('admin.suspendre'),
                      execute: () =>
                        run(t('admin.suspension_7j'), () =>
                          sanctionUser(
                            authorId,
                            'suspended',
                            note || undefined,
                            new Date(Date.now() + SEVEN_DAYS_MS).toISOString()
                          )
                        ),
                    })
                  }
                >
                  <Text style={styles.actionBtnText}>{t('admin.suspendre_7j')}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionDanger, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    setPendingAction({
                      icon: BlockIcon,
                      title: t('admin.bannir_titre'),
                      message: t('admin.bannissement_definitif'),
                      confirmLabel: t('admin.bannir'),
                      execute: () => run(t('admin.compte_banni'), () => sanctionUser(authorId, 'banned', note || undefined)),
                    })
                  }
                >
                  <Text style={[styles.actionBtnText, styles.actionDangerText]}>{t('admin.bannir')}</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Note partagée (motif de sanction ou de rejet) */}
          <Text style={styles.sectionTitle}>Motif / note</Text>
          <TextInput
            autoComplete="off"
            style={styles.noteInput}
            placeholder={t('admin.note_placeholder')}
            value={note}
            onChangeText={setNote}
            multiline
          />

          {/* Clôture du signalement */}
          <Text style={styles.sectionTitle}>{t('admin.cloturer')}</Text>
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => run(t('admin.marque_en_cours'), () => resolveReport(reportId, 'reviewing', note || undefined))}
            >
              <Text style={styles.actionBtnText}>{t('admin.en_cours')}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionPrimary, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => run(t('admin.signalement_traite'), () => resolveReport(reportId, 'actioned', note || undefined))}
            >
              <Text style={[styles.actionBtnText, styles.actionPrimaryText]}>{t('admin.traite')}</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => run(t('admin.signalement_rejete'), () => resolveReport(reportId, 'dismissed', note || undefined))}
            >
              <Text style={styles.actionBtnText}>{t('admin.rejeter')}</Text>
            </Pressable>
          </View>

          {busy && <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />}
        </ScrollView>
      )}

      <ConfirmSheet
        visible={pendingAction != null}
        icon={pendingAction?.icon ?? WarningIcon}
        title={pendingAction?.title ?? ''}
        message={pendingAction?.message}
        confirmLabel={pendingAction?.confirmLabel ?? t('commun.confirmer')}
        loading={busy}
        onCancel={() => setPendingAction(null)}
        onConfirm={async () => {
          if (!pendingAction) return;
          await pendingAction.execute();
          setPendingAction(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.feedBackground, paddingTop: 50 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 14, marginBottom: 10 },
  backArrow: { fontSize: 22, color: colors.textPrimary, paddingHorizontal: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  content: { paddingHorizontal: 14, paddingBottom: 60 },
  statusText: { marginTop: 20, marginHorizontal: 14, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  errorText: { marginHorizontal: 14, fontSize: 13, color: '#C0392B', marginBottom: spacing.xs },
  feedbackText: { marginHorizontal: 14, fontSize: 13, color: '#2E8B57', fontWeight: '600', marginBottom: spacing.xs },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: borders.subtle,
  },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  reason: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  priorityBadge: { fontSize: 11, fontWeight: '700', color: '#C0392B' },
  metaLine: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  detailsText: { fontSize: 13, color: colors.textPrimary, fontStyle: 'italic', marginTop: spacing.xs },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  contentTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  contentBody: { fontSize: 14, color: colors.textPrimary, marginTop: 2 },
  modStatusBadge: { fontSize: 12, color: colors.action, fontWeight: '600', marginTop: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  actionBtn: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  actionPrimary: { backgroundColor: colors.action, borderColor: colors.action },
  actionPrimaryText: { color: '#fff' },
  actionDanger: { borderColor: 'rgba(192,57,43,0.5)' },
  actionDangerText: { color: '#C0392B' },
  sanctionRow: { marginBottom: spacing.xs },
  sanctionType: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  linkBtn: { marginTop: spacing.sm },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: colors.action },
  noteInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 16,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  spinner: { marginTop: spacing.md },
});
