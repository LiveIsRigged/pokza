import { supabase } from '../lib/supabase';
import { trackEvent } from '../analytics';
import { t, type Cle } from '../i18n/traduire';

/** Cible d'un signalement : une main, un commentaire ou un compte. Un seul mécanisme, trois cibles
 * (cf. table `reports`, colonne polymorphe `target_type`/`target_id`). */
export type ReportTargetType = 'post' | 'comment' | 'user';

/** Motifs autorisés — DOIT rester aligné avec le CHECK de `reports.reason` côté base : toute valeur
 * hors liste est rejetée par Postgres, pas seulement par l'UI. Motifs « poker » inclus (opérateur
 * illégal, arnaque) comme demandé par la spec. */
export type ReportReason =
  | 'insultes_harcelement'
  | 'haine_discrimination'
  | 'sexuel_choquant'
  | 'usurpation_identite'
  | 'spam'
  | 'operateur_illegal'
  | 'arnaque'
  | 'sollicitation_commerciale'
  | 'compte_mineur';

/** Libellés affichés dans le sélecteur de motif, dans l'ordre où on veut les proposer. La valeur
 * envoyée en base est `value`, jamais le libellé. */
export const REPORT_REASONS: { value: ReportReason; cle: Cle }[] = [
  { value: 'insultes_harcelement', cle: 'signalement.insultes_harcelement' },
  { value: 'haine_discrimination', cle: 'signalement.haine_discrimination' },
  { value: 'sexuel_choquant', cle: 'signalement.sexuel_choquant' },
  { value: 'usurpation_identite', cle: 'signalement.usurpation_identite' },
  { value: 'spam', cle: 'signalement.spam' },
  { value: 'operateur_illegal', cle: 'signalement.operateur_illegal' },
  { value: 'arnaque', cle: 'signalement.arnaque' },
  { value: 'sollicitation_commerciale', cle: 'signalement.sollicitation_commerciale' },
  { value: 'compte_mineur', cle: 'signalement.compte_mineur' },
];

const REASON_CLE: Record<ReportReason, Cle> = Object.fromEntries(
  REPORT_REASONS.map((r) => [r.value, r.cle])
) as Record<ReportReason, Cle>;

/** Libellé lisible d'un motif — utilisé aussi côté back-office admin. Tolérant à une valeur inconnue
 * (motif ajouté en base mais pas encore côté client) plutôt que de renvoyer `undefined`. */
export function reportReasonLabel(reason: string): string {
  const cle = REASON_CLE[reason as ReportReason];
  return cle ? t(cle) : reason;
}

export interface SubmitReportInput {
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  /** Texte libre facultatif ajouté par le signaleur. */
  details?: string;
}

/**
 * Enregistre un signalement in-app. `source` est forcé à `'app'` (la RLS d'insertion l'exige, tout
 * comme `reporter_id = auth.uid()`). Deux erreurs métier remontées telles quelles à l'utilisateur :
 * le doublon (index unique par cible) et la limite anti-abus (trigger 30/24h). On les traduit en
 * messages clairs plutôt que de laisser fuiter le message brut Postgres.
 */
export async function submitReport(input: SubmitReportInput): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: input.reporterId,
    source: 'app',
    target_type: input.targetType,
    target_id: input.targetId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });
  if (error) {
    // 23505 = violation d'unicité → cette cible a déjà été signalée par ce compte.
    if (error.code === '23505') {
      throw new Error(t('signalement.deja_signale'));
    }
    throw error;
  }
  // Métrique de modération (jamais l'id de la cible ni du signaleur — juste type + motif).
  trackEvent('report_submitted', { target_type: input.targetType, reason: input.reason });
}
