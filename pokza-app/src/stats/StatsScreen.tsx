import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing, tints } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { fetchAdminStats, type AdminStats, type DayCount } from '../data/stats';
import { formatLabel } from '../profile/profileOptions';
import { useT, type Cle } from '../i18n';
import { t } from '../i18n/traduire';

interface StatsScreenProps {
  onBack: () => void;
}

const VARIANTE_CLE: Record<string, Cle> = {
  nlhe: 'profil.variante_nlhe',
  plo: 'profil.variante_plo',
  plo5: 'profil.variante_plo5',
};
const FREQUENCE_CLE: Record<string, Cle> = {
  tres_occasionnel: 'stats.frequence_tres_occasionnel',
  occasionnel: 'stats.frequence_occasionnel',
  regulier: 'stats.frequence_regulier',
  tres_regulier: 'stats.frequence_tres_regulier',
  '?': 'stats.non_precise',
};
const varianteLabel = (k: string) => (VARIANTE_CLE[k] ? t(VARIANTE_CLE[k]) : k);
const frequenceLabel = (k: string) => (FREQUENCE_CLE[k] ? t(FREQUENCE_CLE[k]) : k);

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
  const t = useT();
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
          <Text style={styles.refresh}>{loading ? '…' : t('stats.rafraichir')}</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{t('stats.titre')}</Text>
      {generatedTime ? <Text style={styles.subtitle}>{t('stats.a_jour_a', { heure: generatedTime })}</Text> : null}

      {loading && !stats ? (
        <ActivityIndicator style={styles.loader} color={colors.action} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : stats ? (
        <>
          <Section title={t('stats.croissance')}>
            <Tiles>
              <StatTile value={stats.croissance.inscrits} label={t('stats.inscrits')} />
              <StatTile value={`+${stats.croissance.nouveaux24h}`} label={t('stats.nouveaux_24h')} />
              <StatTile value={`+${stats.croissance.nouveaux7j}`} label={t('stats.nouveaux_7j')} />
              <StatTile value={`+${stats.croissance.nouveaux30j}`} label={t('stats.nouveaux_30j')} />
              <StatTile
                value={stats.croissance.profilsCompletes}
                label={t('stats.profils_completes')}
                hint={pct(stats.croissance.profilsCompletes, stats.croissance.inscrits)}
              />
              <StatTile value={stats.croissance.sansProfil} label={t('stats.inscrits_sans_profil')} />
            </Tiles>
            <MiniBars data={stats.croissance.parJour} caption="Inscriptions · 14 derniers jours" />
          </Section>

          <Section title={t('stats.utilisateurs_actifs')}>
            <Tiles>
              <StatTile value={stats.activite.actifs24h} label={t('stats.actifs_24h')} />
              <StatTile value={stats.activite.actifs7j} label={t('stats.actifs_7j')} />
              <StatTile value={stats.activite.actifs30j} label={t('stats.actifs_30j')} />
              <StatTile value={stats.activite.jamaisRevenus} label={t('stats.jamais_revenus')} />
            </Tiles>
          </Section>

          <Section title={t('stats.contenu')}>
            <Tiles>
              <StatTile value={stats.contenu.mains} label={t('stats.mains_postees')} />
              <StatTile value={`+${stats.contenu.mains7j}`} label={t('stats.mains_7j')} />
              <StatTile value={stats.contenu.posteursTotal} label={t('stats.posteurs')} />
              <StatTile value={stats.contenu.posteurs7j} label={t('stats.posteurs_7j')} />
              <StatTile value={stats.contenu.bombPots} label={t('stats.bomb_pots')} />
              <StatTile value={stats.contenu.doubleBoards} label={t('stats.double_boards')} />
              <StatTile value={stats.contenu.avecSondage} label={t('stats.avec_sondage')} />
              <StatTile value={stats.contenu.cash} label={t('stats.cash')} />
              <StatTile value={stats.contenu.tournoi} label={t('stats.tournoi')} />
              <StatTile value={stats.contenu.publiques} label={t('stats.publiques')} />
              <StatTile value={stats.contenu.enGroupe} label={t('stats.en_groupe')} />
              <StatTile value={stats.contenu.privees} label={t('stats.privees')} />
            </Tiles>
            <Text style={styles.miniTitle}>{t('stats.par_variante')}</Text>
            <Breakdown entries={toEntries(stats.contenu.parVariante, varianteLabel)} />
            <MiniBars data={stats.contenu.parJour} caption={t('stats.mains_14_jours')} />
          </Section>

          <Section title={t('stats.engagement')}>
            <Tiles>
              <StatTile value={stats.engagement.likes} label={t('stats.likes')} />
              <StatTile value={stats.engagement.commentaires} label={t('stats.commentaires')} />
              <StatTile value={stats.engagement.reponses} label={t('stats.reponses')} />
              <StatTile value={stats.engagement.votes} label={t('stats.votes')} />
              <StatTile
                value={stats.engagement.mainsAvecLike}
                label={t('stats.mains_likees')}
                hint={pct(stats.engagement.mainsAvecLike, stats.contenu.mains)}
              />
              <StatTile
                value={stats.engagement.mainsAvecCommentaire}
                label={t('stats.mains_commentees')}
                hint={pct(stats.engagement.mainsAvecCommentaire, stats.contenu.mains)}
              />
            </Tiles>
          </Section>

          <Section title={t('stats.social')}>
            <Tiles>
              <StatTile value={stats.social.amities} label={t('stats.amities')} />
              <StatTile value={stats.social.demandesEnAttente} label={t('stats.demandes_en_attente')} />
              <StatTile value={stats.social.groupes} label={t('stats.groupes')} />
              <StatTile value={stats.social.membresGroupes} label={t('stats.membres_de_groupes')} />
            </Tiles>
          </Section>

          <Section title={t('stats.preferences')}>
            <Text style={styles.miniTitle}>{t('profil.format_favori')}</Text>
            <Breakdown entries={toEntries(stats.profils.formatFavori, (k) => (k === '?' ? t('stats.non_precise') : formatLabel(k)))} />
            <Text style={styles.miniTitle}>{t('profil.variante_preferee')}</Text>
            <Breakdown entries={toEntries(stats.profils.varianteFavorite, varianteLabel)} />
            <Text style={styles.miniTitle}>{t('stats.frequence_de_jeu')}</Text>
            <Breakdown entries={toEntries(stats.profils.frequence, frequenceLabel)} />
          </Section>

          {stats.topPosteurs.length > 0 && (
            <Section title={t('stats.top_posteurs')}>
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
    borderColor: borders.subtle,
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
    borderColor: borders.subtle,
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
    backgroundColor: tints.light,
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
