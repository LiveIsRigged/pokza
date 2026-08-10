// URL du formulaire public de signalement (edge function `report-public`, §5.2) : permet à un
// visiteur SANS compte de signaler un contenu. On la construit depuis l'URL Supabase publique
// (même variable que le client), avec la cible pré-remplie via la query string quand on la connaît.
// Accès statique obligatoire pour l'inlining Expo (cf. lib/supabase.ts).
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export type PublicReportTarget = { type: 'post' | 'comment' | 'user'; id: string };

export function publicReportUrl(target?: PublicReportTarget): string {
  const base = `${SUPABASE_URL}/functions/v1/report-public`;
  if (!target) return base;
  const qs = new URLSearchParams({ type: target.type, id: target.id }).toString();
  return `${base}?${qs}`;
}

/** Ouvre le formulaire public dans un nouvel onglet (web uniquement — sur natif il n'y a pas de
 * lien partagé en attente, cf. `readInitialDeepLink`). */
export function openPublicReport(target?: PublicReportTarget): void {
  if (typeof window !== 'undefined') {
    window.open(publicReportUrl(target), '_blank', 'noopener');
  }
}
