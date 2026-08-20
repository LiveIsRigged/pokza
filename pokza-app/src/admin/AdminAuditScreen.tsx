import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { colors, radius, spacing } from '../theme/theme';
import { listAuditLog, type AuditEntry } from '../data/admin';

interface AdminAuditScreenProps {
  onBack: () => void;
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

// Libellés lisibles des actions journalisées côté base (colonne `action`).
const ACTION_LABEL: Record<string, string> = {
  set_content_status: 'Statut de contenu modifié',
  sanction_user: 'Sanction appliquée',
  lift_sanction: 'Sanction levée',
  resolve_report: 'Signalement clôturé',
  set_age_confirmed: "Confirmation d'âge modifiée",
};

function summarizeDetails(details?: Record<string, unknown>): string {
  if (!details) return '';
  return Object.entries(details)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

/** Journal d'audit en lecture seule (1.8) : toute action admin est tracée côté base et relue ici via
 * une RPC dédiée (la table `admin_audit_log` n'est jamais lisible en direct par le client). */
export function AdminAuditScreen({ onBack }: AdminAuditScreenProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAuditLog(200)
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
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
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Journal d'audit</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>Chargement…</Text>
        ) : entries.length === 0 ? (
          <Text style={styles.statusText}>Aucune action enregistrée.</Text>
        ) : (
          entries.map((e) => (
            <View key={e.id} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.action}>{ACTION_LABEL[e.action] ?? e.action}</Text>
                <Text style={styles.time}>{formatDateTime(e.createdAt)}</Text>
              </View>
              <Text style={styles.meta}>Par {e.adminName}</Text>
              {e.targetType ? (
                <Text style={styles.meta}>
                  Cible : {e.targetType}
                  {e.targetId ? ` (${e.targetId.slice(0, 8)}…)` : ''}
                </Text>
              ) : null}
              {summarizeDetails(e.details) ? <Text style={styles.details}>{summarizeDetails(e.details)}</Text> : null}
            </View>
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
  content: { paddingHorizontal: 14, paddingBottom: 40 },
  statusText: { marginTop: 20, marginHorizontal: 14, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  row: {
    backgroundColor: '#fff',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.1)',
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  action: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flexShrink: 1 },
  time: { fontSize: 11, color: colors.textSecondary },
  meta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  details: { fontSize: 12, color: colors.textPrimary, marginTop: spacing.xs },
});
