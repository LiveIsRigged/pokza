// L'UNIQUE endroit du dépôt qui parle à Cloudflare.
// ────────────────────────────────────────────────
// Signature étroite exprès : une consigne entre, un texte et un décompte de neurons sortent. Le
// jour où Cloudflare ne suffit plus, ajouter un second fournisseur, c'est écrire un fichier voisin
// qui rend la même `Reponse` — rien d'autre ne sait d'où vient la traduction.
//
// ⚠️ LE PLAN GRATUIT NE FACTURE JAMAIS : au-delà de 10 000 neurons par jour, Cloudflare répond
// 429 / 3036 (« You have used up your daily free allocation »). Cette erreur est donc un ÉTAT
// NORMAL, pas une panne : elle a sa propre nature pour que l'appelant cesse d'appeler jusqu'à
// 00:00 UTC, au lieu de marteler une porte fermée.
//
// Point d'entrée « natif » (`/ai/run/<modèle>`) et non la route compatible OpenAI : c'est le seul
// documenté pour TOUS les modèles. Sa réponse n'a pas la même forme selon le modèle (`response`
// pour Mistral et Llama, `choices` pour Gemma 4 et GLM, parfois les deux) — toutes sont lues.

import type { Modele } from './modeles.ts';
import { neurons } from './modeles.ts';

export type NatureErreur =
  | 'quota_epuise' // 3036 : le quota gratuit du jour est consommé → rien avant 00:00 UTC
  | 'plan_payant_requis' // 5035 : modèle « frontier », jamais disponible en gratuit
  | 'capacite' // 3040 : Cloudflare saturé, réessayable
  | 'trop_de_requetes' // 429 sans code connu
  | 'requete_refusee' // 4xx : paramètre refusé par le modèle, jeton invalide…
  | 'reseau'
  | 'reponse_illisible';

export class ErreurCloudflare extends Error {
  readonly nature: NatureErreur;
  readonly statut: number;
  constructor(nature: NatureErreur, statut: number, message: string) {
    super(message);
    this.name = 'ErreurCloudflare';
    this.nature = nature;
    this.statut = statut;
  }
}

export interface Identifiants {
  compte: string;
  jeton: string;
}

export interface Appel {
  modele: Modele;
  systeme: string;
  utilisateur: string;
  longueurMax: number;
}

export interface Reponse {
  texte: string;
  usage: { entree: number; sortie: number };
  /** Faux si Cloudflare n'a pas rendu `usage` : les neurons sont alors estimés PAR EXCÈS. */
  usageExact: boolean;
  neurons: number;
  /**
   * Le plafond de longueur a coupé la sortie. Vu le 14/09/2026 sur Gemma 4 : sa réflexion, facturée
   * en sortie, a consommé les 128 tokens alloués et `content` est revenu VIDE.
   */
  tronquee: boolean;
  dureeMs: number;
}

interface ChargeCloudflare {
  success?: boolean;
  errors?: { code?: number; message?: string }[];
  result?: {
    response?: unknown;
    choices?: { finish_reason?: string; message?: { content?: unknown } }[];
    output?: { type?: string; content?: { type?: string; text?: unknown }[] }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      input_tokens?: number;
      output_tokens?: number;
      neurons?: number;
    };
  };
}

/** Basse mais pas nulle : à zéro, certains petits modèles bouclent sur une répétition. */
const TEMPERATURE = 0.2;

export function natureDe(statut: number, code: number | undefined): NatureErreur {
  if (code === 3036) return 'quota_epuise';
  if (code === 5035) return 'plan_payant_requis';
  if (code === 3040) return 'capacite';
  if (statut === 429) return 'trop_de_requetes';
  return 'requete_refusee';
}

export async function appelerCloudflare(
  ids: Identifiants,
  appel: Appel,
  fetcher: typeof fetch = fetch,
): Promise<Reponse> {
  const { modele } = appel;
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ids.compte)}/ai/run/${modele.id}`;
  const corps: Record<string, unknown> = {
    messages: [
      { role: 'system', content: appel.systeme },
      { role: 'user', content: modele.suffixe ? `${appel.utilisateur}\n${modele.suffixe}` : appel.utilisateur },
    ],
    temperature: TEMPERATURE,
    [modele.parametreLongueur]: appel.longueurMax,
    ...modele.extra,
  };

  const debut = Date.now();
  let reponse: Response;
  try {
    reponse = await fetcher(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ids.jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    throw new ErreurCloudflare('reseau', 0, e instanceof Error ? e.message : String(e));
  }
  const dureeMs = Date.now() - debut;
  const charge = (await reponse.json().catch(() => null)) as ChargeCloudflare | null;

  if (!reponse.ok || !charge?.success) {
    const erreur = charge?.errors?.[0];
    throw new ErreurCloudflare(
      natureDe(reponse.status, erreur?.code),
      reponse.status,
      `${erreur?.code ?? ''} ${erreur?.message ?? `HTTP ${reponse.status}`}`.trim(),
    );
  }

  const r = charge.result ?? {};
  // Le premier texte NON VIDE, pas le premier champ présent : un `response: ""` ne doit pas masquer
  // le vrai texte rangé dans `choices`.
  const candidats = [
    r.response,
    r.choices?.[0]?.message?.content,
    r.output?.find((o) => o.type === 'message')?.content?.find((c) => c.type === 'output_text')?.text,
  ].filter((c): c is string => typeof c === 'string');
  if (candidats.length === 0) {
    throw new ErreurCloudflare('reponse_illisible', reponse.status, 'aucun texte dans la réponse');
  }
  const texte = candidats.find((c) => c.trim().length > 0) ?? '';

  const entree = r.usage?.prompt_tokens ?? r.usage?.input_tokens;
  const sortie = r.usage?.completion_tokens ?? r.usage?.output_tokens;
  const usageExact = typeof entree === 'number' && typeof sortie === 'number';
  const usage = usageExact
    ? { entree: entree as number, sortie: sortie as number }
    : // Deux caractères par token surestime tout texte latin : le budget ne peut que se tromper
      // dans le bon sens.
      { entree: Math.ceil((appel.systeme.length + appel.utilisateur.length) / 2), sortie: Math.ceil(texte.length / 2) };

  return {
    texte,
    usage,
    usageExact,
    // Cloudflare rend lui-même le décompte FACTURÉ (`usage.neurons`, constaté le 14/09/2026) : c'est
    // lui qui fait foi. La grille de `modeles.ts` ne sert que s'il manque.
    neurons: typeof r.usage?.neurons === 'number' ? r.usage.neurons : neurons(modele, usage),
    tronquee: r.choices?.[0]?.finish_reason === 'length',
    dureeMs,
  };
}
