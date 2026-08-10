import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import {
  getReportContext,
  resolveReport,
  sanctionUser,
  setContentStatus,
  isSanctionActive,
  REPORT_STATUS_LABEL,
  SANCTION_TYPE_LABEL,
  type ReportContext,
} from '../data/admin';
import { reportReasonLabel } from '../data/reports';

interface AdminReportDetailScreenProps {
  reportId: string;
  onBack: () => void;
  onOpenUser: (userId: string) => void;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function AdminReportDetailScreen({ reportId, onBack, onOpenUser }: AdminReportDetailScreenProps) {
  const [ctx, setCtx] = useState<ReportContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

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
        <Text style={styles.title}>Détail du signalement</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}

      {loading || !ctx ? (
        <Text style={styles.statusText}>Chargement…</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Signalement */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.reason}>{reportReasonLabel(ctx.report.reason)}</Text>
              {ctx.report.severity === 'priority' && <Text style={styles.priorityBadge}>⚠️ Prioritaire</Text>}
            </View>
            <Text style={styles.metaLine}>Statut : {REPORT_STATUS_LABEL[ctx.report.status]}</Text>
            <Text style={styles.metaLine}>Reçu le {formatDateTime(ctx.report.createdAt)}</Text>
            {ctx.report.reporterEmail ? (
              <Text style={styles.metaLine}>Signaleur : {ctx.report.reporterEmail}</Text>
            ) : null}
            {ctx.report.details ? <Text style={styles.detailsText}>« {ctx.report.details} »</Text> : null}
            <Text style={styles.metaLine}>
              {ctx.reportsOnTarget} signalement{ctx.reportsOnTarget > 1 ? 's' : ''} sur cette cible ·{' '}
              {ctx.reportsOnAuthorAsUser} sur ce compte
            </Text>
          </View>

          {/* Contenu visé */}
          <Text style={styles.sectionTitle}>Contenu signalé</Text>
          <View style={styles.card}>
            {targetType === 'post' && (
              <>
                <Text style={styles.contentTitle}>{(target?.title as string) || '(sans titre)'}</Text>
                {target?.description ? <Text style={styles.contentBody}>{target.description as string}</Text> : null}
              </>
            )}
            {targetType === 'comment' && (
              <Text style={styles.contentBody}>{(target?.body as string) || '(commentaire vide)'}</Text>
            )}
            {targetType === 'user' && (
              <Text style={styles.contentTitle}>@{(target?.pseudo as string) || '?'}</Text>
            )}
            {target == null && <Text style={styles.contentBody}>Contenu introuvable (déjà supprimé ?)</Text>}
            {contentModStatus && (
              <Text style={styles.modStatusBadge}>État de modération : {contentModStatus}</Text>
            )}
          </View>

          {/* Actions sur le contenu (post/comment uniquement) */}
          {(targetType === 'post' || targetType === 'comment') && target != null && (
            <>
              <Text style={styles.sectionTitle}>Agir sur le contenu</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    run('Contenu masqué', () => setContentStatus(targetType, ctx.report.targetId, 'hidden', note || undefined))
                  }
                >
                  <Text style={styles.actionBtnText}>Masquer</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionDanger, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    run('Contenu retiré', () => setContentStatus(targetType, ctx.report.targetId, 'removed', note || undefined))
                  }
                >
                  <Text style={[styles.actionBtnText, styles.actionDangerText]}>Retirer</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    run('Contenu rétabli', () => setContentStatus(targetType, ctx.report.targetId, 'visible'))
                  }
                >
                  <Text style={styles.actionBtnText}>Rétablir</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Auteur + sanctions */}
          {authorId && (
            <>
              <Text style={styles.sectionTitle}>Auteur</Text>
              <View style={styles.card}>
                {ctx.authorSanctions.length === 0 ? (
                  <Text style={styles.metaLine}>Aucune sanction enregistrée.</Text>
                ) : (
                  ctx.authorSanctions.map((s) => (
                    <View key={s.id} style={styles.sanctionRow}>
                      <Text style={styles.sanctionType}>
                        {SANCTION_TYPE_LABEL[s.type]}
                        {isSanctionActive(s) ? '' : ' (levée/expirée)'}
                      </Text>
                      <Text style={styles.metaLine}>{formatDateTime(s.createdAt)}</Text>
                    </View>
                  ))
                )}
                <Pressable style={styles.linkBtn} onPress={() => onOpenUser(authorId)}>
                  <Text style={styles.linkBtnText}>Voir la fiche de modération →</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>Sanctionner l'auteur</Text>
              <View style={styles.actionsRow}>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() => run('Avertissement envoyé', () => sanctionUser(authorId, 'warning', note || undefined))}
                >
                  <Text style={styles.actionBtnText}>Avertir</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() =>
                    run('Suspension 7 jours', () =>
                      sanctionUser(authorId, 'suspended', note || undefined, new Date(Date.now() + SEVEN_DAYS_MS).toISOString())
                    )
                  }
                >
                  <Text style={styles.actionBtnText}>Suspendre 7 j</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionBtn, styles.actionDanger, busy && styles.actionBtnDisabled]}
                  disabled={busy}
                  onPress={() => run('Compte banni', () => sanctionUser(authorId, 'banned', note || undefined))}
                >
                  <Text style={[styles.actionBtnText, styles.actionDangerText]}>Bannir</Text>
                </Pressable>
              </View>
            </>
          )}

          {/* Note partagée (motif de sanction ou de rejet) */}
          <Text style={styles.sectionTitle}>Motif / note</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="Utilisé comme motif de sanction ou de rejet…"
            value={note}
            onChangeText={setNote}
            multiline
          />

          {/* Clôture du signalement */}
          <Text style={styles.sectionTitle}>Clôturer le signalement</Text>
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => run('Marqué en cours', () => resolveReport(reportId, 'reviewing', note || undefined))}
            >
              <Text style={styles.actionBtnText}>En cours</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionPrimary, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => run('Signalement traité', () => resolveReport(reportId, 'actioned', note || undefined))}
            >
              <Text style={[styles.actionBtnText, styles.actionPrimaryText]}>Traité</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
              disabled={busy}
              onPress={() => run('Signalement rejeté', () => resolveReport(reportId, 'dismissed', note || undefined))}
            >
              <Text style={styles.actionBtnText}>Rejeter</Text>
            </Pressable>
          </View>

          {busy && <ActivityIndicator style={styles.spinner} color={colors.textSecondary} />}
        </ScrollView>
      )}
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
    borderColor: 'rgba(22,35,61,0.1)',
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
    borderColor: 'rgba(22,35,61,0.25)',
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
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  spinner: { marginTop: spacing.md },
});
