// Motifs de signalement — DOIT rester aligné avec le CHECK `reports.reason` en base
// (docs/dev/moderation.sql) ET avec pokza-app/src/data/reports.ts. Toute valeur hors liste
// est de toute façon rejetée par Postgres ; on valide aussi ici pour renvoyer un message clair.
export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'insultes_harcelement', label: 'Insultes ou harcèlement' },
  { value: 'haine_discrimination', label: 'Haine ou discrimination' },
  { value: 'sexuel_choquant', label: 'Contenu sexuel ou choquant' },
  { value: 'usurpation_identite', label: "Usurpation d'identité" },
  { value: 'spam', label: 'Spam' },
  { value: 'operateur_illegal', label: "Opérateur illégal / jeu d'argent non autorisé" },
  { value: 'arnaque', label: 'Arnaque ou escroquerie' },
  { value: 'sollicitation_commerciale', label: 'Sollicitation commerciale' },
  { value: 'compte_mineur', label: 'Compte de mineur (moins de 18 ans)' },
];

export const REASON_VALUES = new Set(REPORT_REASONS.map((r) => r.value));
export const TARGET_TYPES = new Set(['post', 'comment', 'user']);

export function reasonLabel(reason: string): string {
  return REPORT_REASONS.find((r) => r.value === reason)?.label ?? reason;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
