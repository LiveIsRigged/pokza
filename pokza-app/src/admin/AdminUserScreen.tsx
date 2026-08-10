import React, { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import {
  getUserContext,
  liftSanction,
  setAgeConfirmed,
  isSanctionActive,
  SANCTION_TYPE_LABEL,
  type UserModerationContext,
} from '../data/admin';

interface AdminUserScreenProps {
  userId: string;
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

/**
 * Fiche de modération d'un compte : sanctions passées/en cours (avec « Lever »), volume de contenu,
 * nombre de signalements le visant, et le verrou monétisation `age_confirmed` (7.3/7.4). L'émission
 * de nouvelles sanctions se fait depuis le détail d'un signalement — ici on gère surtout la levée et
 * le statut mineur.
 */
export function AdminUserScreen({ userId, onBack }: AdminUserScreenProps) {
  const [ctx, setCtx] = useState<UserModerationContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    getUserContext(userId)
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
  }, [userId]);

  useEffect(() => load(), [load]);

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

  const profile = ctx?.profile;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>Fiche de modération</Text>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}
      {feedback && <Text style={styles.feedbackText}>{feedback}</Text>}

      {loading || !ctx ? (
        <Text style={styles.statusText}>Chargement…</Text>
      ) : !profile ? (
        <Text style={styles.statusText}>Compte introuvable.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.card}>
            <Text style={styles.name}>{profile.displayName}</Text>
            <Text style={styles.metaLine}>@{profile.pseudo}</Text>
            <Text style={styles.metaLine}>Membre depuis {formatDateTime(profile.createdAt)}</Text>
            <Text style={styles.metaLine}>
              {ctx.recentContentCount.posts} main{ctx.recentContentCount.posts > 1 ? 's' : ''} ·{' '}
              {ctx.recentContentCount.comments} commentaire{ctx.recentContentCount.comments > 1 ? 's' : ''}
            </Text>
            <Text style={styles.metaLine}>
              {ctx.reportsAgainstUser} signalement{ctx.reportsAgainstUser > 1 ? 's' : ''} visant ce compte
            </Text>
          </View>

          {/* Verrou monétisation / âge */}
          <Text style={styles.sectionTitle}>Confirmation d'âge (7.3/7.4)</Text>
          <View style={styles.card}>
            <Text style={styles.metaLine}>
              {profile.ageConfirmed
                ? 'Âge confirmé — le compte est traité comme majeur.'
                : '⚠️ Âge NON confirmé — compte soupçonné mineur, monétisation bloquée.'}
            </Text>
            {profile.ageConfirmed ? (
              <Pressable
                style={[styles.actionBtn, styles.actionDanger, busy && styles.actionBtnDisabled]}
                disabled={busy}
                onPress={() => run('Marqué comme mineur soupçonné', () => setAgeConfirmed(userId, false))}
              >
                <Text style={[styles.actionBtnText, styles.actionDangerText]}>Marquer « mineur soupçonné »</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                disabled={busy}
                onPress={() => run("Confirmation d'âge rétablie", () => setAgeConfirmed(userId, true))}
              >
                <Text style={styles.actionBtnText}>Rétablir la confirmation d'âge</Text>
              </Pressable>
            )}
          </View>

          {/* Sanctions */}
          <Text style={styles.sectionTitle}>Sanctions</Text>
          {ctx.sanctions.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.metaLine}>Aucune sanction enregistrée.</Text>
            </View>
          ) : (
            ctx.sanctions.map((s) => {
              const active = isSanctionActive(s);
              return (
                <View key={s.id} style={styles.card}>
                  <View style={styles.sanctionHeader}>
                    <Text style={styles.sanctionType}>{SANCTION_TYPE_LABEL[s.type]}</Text>
                    <Text style={[styles.sanctionState, active ? styles.stateActive : styles.stateInactive]}>
                      {active ? 'Active' : s.liftedAt ? 'Levée' : 'Expirée'}
                    </Text>
                  </View>
                  {s.reason ? <Text style={styles.metaLine}>« {s.reason} »</Text> : null}
                  <Text style={styles.metaLine}>Le {formatDateTime(s.createdAt)}</Text>
                  {s.expiresAt ? <Text style={styles.metaLine}>Expire le {formatDateTime(s.expiresAt)}</Text> : null}
                  {active && (
                    <Pressable
                      style={[styles.actionBtn, busy && styles.actionBtnDisabled]}
                      disabled={busy}
                      onPress={() => run('Sanction levée', () => liftSanction(s.id))}
                    >
                      <Text style={styles.actionBtnText}>Lever la sanction</Text>
                    </Pressable>
                  )}
                </View>
              );
            })
          )}

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
  name: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  metaLine: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  sanctionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sanctionType: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  sanctionState: { fontSize: 12, fontWeight: '700' },
  stateActive: { color: '#C0392B' },
  stateInactive: { color: colors.textSecondary },
  actionBtn: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  actionDanger: { borderColor: 'rgba(192,57,43,0.5)' },
  actionDangerText: { color: '#C0392B' },
  spinner: { marginTop: spacing.md },
});
