import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing, tints } from '../theme/theme';
import { listReports, REPORT_STATUS_LABEL, type AdminReport, type ReportStatus } from '../data/admin';
import { reportReasonLabel } from '../data/reports';

interface AdminReportsScreenProps {
  onBack: () => void;
  onOpenReport: (reportId: string) => void;
  /** Incrémenté par le parent au retour du détail → force un rechargement de la file. */
  reloadKey?: number;
}

const TARGET_LABEL: Record<string, string> = { post: 'Main', comment: 'Commentaire', user: 'Compte' };

// Onglets de statut. `null` = tout. Ordre pensé pour le travail quotidien : ce qui reste à traiter
// en premier.
const TABS: { key: ReportStatus | null; label: string }[] = [
  { key: 'open', label: 'À traiter' },
  { key: 'reviewing', label: 'En cours' },
  { key: 'actioned', label: 'Sanctionnés' },
  { key: 'dismissed', label: 'Rejetés' },
  { key: null, label: 'Tout' },
];

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "à l'instant";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} j`;
}

export function AdminReportsScreen({ onBack, onOpenReport, reloadKey }: AdminReportsScreenProps) {
  const [tab, setTab] = useState<ReportStatus | null>('open');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listReports(tab)
      .then((data) => {
        if (cancelled) return;
        setReports(data);
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
  }, [tab]);

  useEffect(() => load(), [load, reloadKey]);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Signalements</Text>
      </View>

      <View style={styles.tabsWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.label}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>Chargement…</Text>
        ) : reports.length === 0 ? (
          <Text style={styles.statusText}>Aucun signalement dans cette catégorie.</Text>
        ) : (
          reports.map((r) => (
            <Pressable key={r.id} style={styles.row} onPress={() => onOpenReport(r.id)}>
              <View style={styles.rowHeader}>
                {r.severity === 'priority' && <Text style={styles.priorityBadge}>⚠️ Prioritaire</Text>}
                <Text style={styles.targetBadge}>{TARGET_LABEL[r.targetType] ?? r.targetType}</Text>
                {r.reportsOnTarget > 1 && <Text style={styles.multiBadge}>×{r.reportsOnTarget}</Text>}
                <View style={styles.grow} />
                <Text style={styles.statusBadge}>{REPORT_STATUS_LABEL[r.status]}</Text>
              </View>
              <Text style={styles.reason}>{reportReasonLabel(r.reason)}</Text>
              {r.details ? (
                <Text style={styles.details} numberOfLines={2}>
                  {r.details}
                </Text>
              ) : null}
              <Text style={styles.time}>{timeAgo(r.createdAt)}</Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.feedBackground, paddingTop: 50 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: 14, marginBottom: 10 },
  backArrow: { fontSize: 22, color: colors.textPrimary, paddingHorizontal: 4 },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  tabsWrap: { marginBottom: spacing.sm },
  tabs: { paddingHorizontal: 14, gap: spacing.xs },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  tabActive: { backgroundColor: colors.tableFelt, borderColor: colors.tableFelt },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  tabTextActive: { color: colors.textOnFelt },
  statusText: { marginTop: 20, marginHorizontal: 14, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  content: { paddingHorizontal: 14, paddingBottom: 40 },
  row: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: borders.subtle,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 6 },
  grow: { flex: 1 },
  priorityBadge: { fontSize: 11, fontWeight: '700', color: '#C0392B' },
  targetBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    backgroundColor: tints.light,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  multiBadge: { fontSize: 11, fontWeight: '700', color: colors.action },
  statusBadge: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  reason: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  details: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: 11, color: colors.textSecondary, marginTop: 6 },
});
