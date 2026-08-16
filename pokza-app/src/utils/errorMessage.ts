// Signatures d'échec réseau selon le navigateur/environnement — le message brut d'un fetch qui
// n'a pas pu atteindre le serveur (pas de connexion, DNS, etc.), pas une erreur métier renvoyée
// par Supabase. Comparaison insensible à la casse.
const NETWORK_ERROR_PATTERNS = [
  'failed to fetch', // Chrome / Edge
  'network request failed', // React Native
  'networkerror', // Firefox ("NetworkError when attempting to fetch resource")
  'network connection was lost', // Safari
  'load failed', // Safari (fetch générique)
];

/** Les erreurs Postgrest/Supabase (ex : violation de contrainte renvoyée par `supabase.rpc(...)`)
 * sont de simples objets `{ message, details, hint, code }`, pas des `instanceof Error` — sans ce
 * cas, `String(err)` produit "[object Object]" au lieu du message réel. */
function hasMessage(err: unknown): err is { message: string } {
  return typeof err === 'object' && err !== null && typeof (err as { message?: unknown }).message === 'string';
}

/** Code d'erreur PostgreSQL porté par les objets d'erreur Supabase (`{ message, code, … }`). */
function errorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

/** Remplace partout le `err instanceof Error ? err.message : String(err)` répété dans les blocs
 * catch de l'app : mêmes messages Supabase qu'avant, mais une coupure réseau affiche un message
 * français clair au lieu de "Failed to fetch" brut. */
export function errorMessage(err: unknown): string {
  // 23505 = violation de contrainte d'unicité. Le cas réel n'est pas une faute de l'utilisateur :
  // il a voté ou liké depuis un autre écran / un autre appareil, et cette vue-ci n'est plus à jour.
  // Sans traduction, il lisait `duplicate key value violates unique constraint "votes_pkey"`.
  if (errorCode(err) === '23505') {
    return "C'est déjà enregistré de ton côté — actualise pour voir l'état à jour.";
  }
  const raw = err instanceof Error ? err.message : hasMessage(err) ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (NETWORK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return 'Connexion internet indisponible — vérifie ta connexion et réessaie.';
  }
  return raw;
}
