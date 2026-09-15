// Les modèles de Workers AI éligibles au plan GRATUIT, et ce qu'ils coûtent en neurons.
// ──────────────────────────────────────────────────────────────────────────────────────
// Relevé le 14/09/2026 sur developers.cloudflare.com/workers-ai/platform/pricing. Trois choses
// vérifiées ce jour-là, qui ont décidé de la liste :
//   • les modèles « frontier » répondent 403 / 5035 sur le plan Free — DeepSeek V4, GLM 5.x,
//     Kimi et Qwen 3.8 sont donc ABSENTS d'ici, quelle que soit leur qualité ;
//   • Gemma 3 12B a été retiré le 30/05/2026 : Gemma 4 est son remplaçant désigné ;
//   • la sortie coûte de 3 à 8 fois l'entrée selon le modèle — le rapport n'est pas le même
//     partout, et il change ce qu'un long glossaire coûte.
//
// Le paramètre de longueur n'a pas le même nom partout (`max_tokens` / `max_completion_tokens`),
// et un modèle qui RAISONNE facture sa réflexion comme de la sortie : le banc la mesure.

export interface Modele {
  /** Nom court, celui qu'on tape au banc. */
  court: string;
  id: string;
  /** Neurons par MILLION de tokens. */
  prix: { entree: number; sortie: number };
  parametreLongueur: 'max_tokens' | 'max_completion_tokens';
  /** Réflexion facturée en sortie : on réserve de la marge pour qu'elle ne tronque pas la réponse. */
  raisonne?: boolean;
  /** Champs propres au modèle, ajoutés tels quels au corps de la requête. */
  extra?: Record<string, unknown>;
  /** Ajouté à la fin du message utilisateur (interrupteur de réflexion de Qwen3). */
  suffixe?: string;
}

/**
 * Coupe la réflexion là où le modèle le permet. Constaté le 14/09/2026 sur Gemma 4 : c'est le SEUL
 * réglage qui marche. `reasoning_effort: 'none'`, `enable_thinking: false` à la racine et
 * `reasoning.enabled: false` sont acceptés SANS ERREUR et ignorés (réponse tronquée) ; `'low'`
 * réfléchit en silence et facture quand même. Avec lui : 37 tokens de sortie au lieu de 430.
 */
const SANS_REFLEXION = { chat_template_kwargs: { enable_thinking: false } };

export const MODELES: Modele[] = [
  { court: 'gemma-4', id: '@cf/google/gemma-4-26b-a4b-it', prix: { entree: 9091, sortie: 27273 }, parametreLongueur: 'max_completion_tokens', extra: SANS_REFLEXION },
  // La même, réflexion laissée libre : pour MESURER si réfléchir rend plus fidèle, et à quel prix.
  { court: 'gemma-4-pense', id: '@cf/google/gemma-4-26b-a4b-it', prix: { entree: 9091, sortie: 27273 }, parametreLongueur: 'max_completion_tokens', raisonne: true },
  { court: 'mistral-small', id: '@cf/mistralai/mistral-small-3.1-24b-instruct', prix: { entree: 31876, sortie: 50488 }, parametreLongueur: 'max_tokens' },
  { court: 'llama-3.3', id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', prix: { entree: 26668, sortie: 204805 }, parametreLongueur: 'max_tokens' },
  { court: 'llama-4-scout', id: '@cf/meta/llama-4-scout-17b-16e-instruct', prix: { entree: 24545, sortie: 77273 }, parametreLongueur: 'max_tokens' },
  { court: 'nemotron-3', id: '@cf/nvidia/nemotron-3-120b-a12b', prix: { entree: 45455, sortie: 136364 }, parametreLongueur: 'max_completion_tokens', raisonne: true, extra: SANS_REFLEXION },
  { court: 'glm-4.7-flash', id: '@cf/zai-org/glm-4.7-flash', prix: { entree: 5500, sortie: 36400 }, parametreLongueur: 'max_completion_tokens', raisonne: true, extra: SANS_REFLEXION },
  { court: 'gpt-oss-120b', id: '@cf/openai/gpt-oss-120b', prix: { entree: 31818, sortie: 68182 }, parametreLongueur: 'max_tokens', raisonne: true, extra: { reasoning: { effort: 'low' } } },
  { court: 'qwen3-30b', id: '@cf/qwen/qwen3-30b-a3b-fp8', prix: { entree: 4625, sortie: 30475 }, parametreLongueur: 'max_tokens', raisonne: true, suffixe: '/no_think' },
];

/**
 * Le modèle de production. PROVISOIRE : Gemma 4 est le seul candidat gratuit récent, multilingue
 * (140 langues d'entraînement) et moins cher en sortie que Qwen3 — mais c'est le banc, sur des
 * textes de poker, qui tranche. Pas l'étiquette.
 */
export const MODELE_PRODUCTION = 'gemma-4';

export function trouverModele(court: string): Modele | undefined {
  return MODELES.find((m) => m.court === court);
}

/** Ce que Cloudflare décompte : tokens × prix, entrée et sortie séparément. */
export function neurons(modele: Modele, usage: { entree: number; sortie: number }): number {
  return (usage.entree * modele.prix.entree + usage.sortie * modele.prix.sortie) / 1_000_000;
}
