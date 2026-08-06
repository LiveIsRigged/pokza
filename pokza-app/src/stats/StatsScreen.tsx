import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { fetchAdminStats, type AdminStats, type DayCount } from '../data/stats';
import { formatLabel } from '../profile/profileOptions';

interface StatsScreenProps {
  onBack: () => void;
}

const VARIANTE_LABEL: Record<string, string> = { nlhe: "Hold'em", plo: 'PLO', plo5: 'PLO5' };
const FREQUENCE_LABEL: Record<string, string> = {
  tres_occasionnel: 'Très occasionnel',
  occasionnel: 'Occasionnel',
  regulier: 'Régulier',
  tres_regulier: 'Très régulier',
  '?': 'Non précisé',
};

/** Une tuile chiffre + libellé. `hint` = précision optionnelle sous le libellé (ex. un pourcentage). */
function StatTile({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
      {hint ? <Text style={styles.tileHint}>{hint}</Text> : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Tiles({ children }: { children: React.ReactNode }) {
  return <View style={styles.tileRow}>{children}</View>;
}

/** Mini histogramme des 14 derniers jours. Barres à hauteur proportionnelle au max de la série. */
function MiniBars({ data, caption }: { data: DayCount[]; caption: string }) {
  const max = Math.max(1, ...data.map((d) => d.n));
  const total = data.reduce((s, d) => s + d.n, 0);
  return (
    <View style={styles.card}>
      <View style={styles.barsRow}>
        {data.map((d, i) => (
          <View key={i} style={styles.barTrack}>
            <View style={[styles.bar, { height: `${Math.round((100 * d.n) / max)}%` }]} />
          </View>
        ))}
      </View>
      <Text style={styles.caption}>
        {caption} · {total} au total
      </Text>
    </View>
  );
}

/** Répartition en barres horizontales proportionnelles (variante, format favori, fréquence…). */
function Breakdown({ entries }: { entries: { label: string; n: number }[] }) {
  const max = Math.max(1, ...entries.map((e) => e.n));
  if (entries.length === 0) return null;
  return (
    <View style={styles.card}>
      {entries.map((e, i) => (
        <View key={i} style={styles.breakRow}>
          <Text style={styles.breakLabel} numberOfLines={1}>
            {e.label}
          </Text>
          <View style={styles.breakBarTrack}>
            <View style={[styles.breakBar, { width: `${Math.round((100 * e.n) / max)}%` }]} />
          </View>
          <Text style={styles.breakValue}>{e.n}</Text>
        </View>
      ))}
    </View>
  );
}

/** Transforme un dictionnaire {clé: n} en entrées libellées, triées par nombre décroissant. */
function toEntries(dict: Record<string, number>, label: (key: string) => string) {
  return Object.entries(dict)
    .map(([key, n]) => ({ label: label(key), n }))
    .sort((a, b) => b.n - a.n);
}

export function StatsScreen({ onBack }: StatsScreenProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchAdminStats()
      .then((s) => {
        setStats(s);
        setLoading(false);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  const pct = (part: number, whole: number) =>
    whole > 0 ? `${Math.round((100 * part) / whole)}%` : undefined;

  const generatedTime = stats
    ? new Date(stats.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Pressable onPress={load} hitSlop={8} disabled={loading}>
          <Text style={styles.refresh}>{loading ? '…' : '↻ Rafraîchir'}</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Statistiques</Text>
      {generatedTime ? <Text style={styles.subtitle}>À jour à {generatedTime}</Text> : null}

      {loading && !stats ? (
        <ActivityIndicator style={styles.loader} color={colors.action} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : stats ? (
        <>
          <Section title="Croissance">
            <Tiles>
              <StatTile value={stats.croissance.inscrits} label="Inscrits" />
              <StatTile value={`+${stats.croissance.nouveaux24h}`} label="Nouveaux (24 h)" />
              <StatTile value={`+${stats.croissance.nouveaux7j}`} label="Nouveaux (7 j)" />
              <StatTile value={`+${stats.croissance.nouveaux30j}`} label="Nouveaux (30 j)" />
              <StatTile
                value={stats.croissance.profilsCompletes}
                label="Profils complétés"
                hint={pct(stats.croissance.profilsCompletes, stats.croissance.inscrits)}
              />
              <StatTile value={stats.croissance.sansProfil} label="Inscrits sans profil" />
            </Tiles>
            <MiniBars data={stats.croissance.parJour} caption="Inscriptions · 14 derniers jours" />
          </Section>

          <Section title="Utilisateurs actifs">
            <Tiles>
              <StatTile value={stats.activite.actifs24h} label="Actifs (24 h)" />
              <StatTile value={stats.activite.actifs7j} label="Actifs (7 j)" />
              <StatTile value={stats.activite.actifs30j} label="Actifs (30 j)" />
              <StatTile value={stats.activite.jamaisRevenus} label="Jamais revenus" />
            </Tiles>
          </Section>

          <Section title="Contenu">
            <Tiles>
              <StatTile value={stats.contenu.mains} label="Mains postées" />
              <StatTile value={`+${stats.contenu.mains7j}`} label="Mains (7 j)" />
              <StatTile value={stats.contenu.posteursTotal} label="Posteurs" />
              <StatTile value={stats.contenu.posteurs7j} label="Posteurs (7 j)" />
              <StatTile value={stats.contenu.bombPots} label="Bomb pots" />
              <StatTile value={stats.contenu.doubleBoards} label="Double boards" />
              <StatTile value={stats.contenu.avecSondage} label="Avec sondage" />
              <StatTile value={stats.contenu.cash} label="Cash" />
              <StatTile value={stats.contenu.tournoi} label="Tournoi" />
              <StatTile value={stats.contenu.publiques} label="Publiques" />
              <StatTile value={stats.contenu.enGroupe} label="En groupe" />
              <StatTile value={stats.contenu.privees} label="Privées" />
            </Tiles>
            <Text style={styles.miniTitle}>Par variante</Text>
            <Breakdown entries={toEntries(stats.contenu.parVariante, (k) => VARIANTE_LABEL[k] ?? k)} />
            <MiniBars data={stats.contenu.parJour} caption="Mains postées · 14 derniers jours" />
          </Section>

          <Section title="Engagement">
            <Tiles>
              <StatTile value={stats.engagement.likes} label="Likes" />
              <StatTile value={stats.engagement.commentaires} label="Commentaires" />
              <StatTile value={stats.engagement.reponses} label="Réponses" />
              <StatTile value={stats.engagement.votes} label="Votes" />
              <StatTile
                value={stats.engagement.mainsAvecLike}
                label="Mains likées"
                hint={pct(stats.engagement.mainsAvecLike, stats.contenu.mains)}
              />
              <StatTile
                value={stats.engagement.mainsAvecCommentaire}
                label="Mains commentées"
                hint={pct(stats.engagement.mainsAvecCommentaire, stats.contenu.mains)}
              />
            </Tiles>
          </Section>

          <Section title="Social">
            <Tiles>
              <StatTile value={stats.social.amities} label="Amitiés" />
              <StatTile value={stats.social.demandesEnAttente} label="Demandes en attente" />
              <StatTile value={stats.social.groupes} label="Groupes" />
              <StatTile value={stats.social.membresGroupes} label="Membres de groupes" />
            </Tiles>
          </Section>

          <Section title="Préférences des joueurs">
            <Text style={styles.miniTitle}>Format favori</Text>
            <Breakdown entries={toEntries(stats.profils.formatFavori, (k) => (k === '?' ? 'Non précisé' : formatLabel(k)))} />
            <Text style={styles.miniTitle}>Variante préférée</Text>
            <Breakdown entries={toEntries(stats.profils.varianteFavorite, (k) => VARIANTE_LABEL[k] ?? k)} />
            <Text style={styles.miniTitle}>Fréquence de jeu</Text>
            <Breakdown entries={toEntries(stats.profils.frequence, (k) => FREQUENCE_LABEL[k] ?? k)} />
          </Section>

          {stats.topPosteurs.length > 0 && (
            <Section title="Top posteurs">
              <Breakdown entries={stats.topPosteurs.map((t) => ({ label: t.pseudo, n: t.n }))} />
            </Section>
          )}

          <Text style={styles.footnote}>
            « Actif » = connecté récemment. Proxy correct pour un beta, mais qui surestime un peu —
            pour l'engagement réel, fie-toi aux posteurs uniques.
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

const TILE_MIN_WIDTH = 100;

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 60,
    backgroundColor: colors.feedBackground,
    minHeight: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  refresh: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.action,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.tableFelt,
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  loader: {
    marginTop: 60,
  },
  error: {
    color: '#C0392B',
    fontSize: 14,
    marginTop: 40,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  miniTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 12,
    marginBottom: 6,
  },
  tileRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    flexBasis: TILE_MIN_WIDTH,
    minWidth: TILE_MIN_WIDTH,
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.08)',
  },
  tileValue: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  tileLabel: {
    fontSize: 13,
    color: colors.textPrimary,
    marginTop: 2,
  },
  tileHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 3,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.08)',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 52,
  },
  barTrack: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    minHeight: 2,
    backgroundColor: colors.action,
    borderRadius: 2,
  },
  caption: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 8,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 5,
  },
  breakLabel: {
    width: 110,
    fontSize: 13,
    color: colors.textPrimary,
  },
  breakBarTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(22,35,61,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  breakBar: {
    height: '100%',
    minWidth: 2,
    backgroundColor: colors.action,
    borderRadius: 4,
  },
  breakValue: {
    width: 32,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  footnote: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginTop: 4,
  },
});
