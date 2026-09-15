// Traduire un lot : consigne → Cloudflare → lecture → garde-fous.
// ───────────────────────────────────────────────────────────────
// C'est la chaîne complète, et le banc l'appelle telle quelle : ce qui est mesuré est ce qui
// tournera. La fonction Deno n'y ajoute que le cache, le budget et les droits de lecture.
//
// Un LOT et non un texte : le titre et la description d'une main, ou les commentaires d'un fil,
// partent dans le même appel. La consigne se paie une fois au lieu d'une fois par texte — et avec
// Gemma 4 l'entrée coûte le tiers de la sortie, donc la consigne pèse plus lourd qu'avec Qwen3.

import type { Consigne, ElementATraduire } from './consigne.ts';
import { construireConsigne, langueDeBase } from './consigne.ts';
import type { Identifiants, Reponse } from './cloudflare.ts';
import { appelerCloudflare } from './cloudflare.ts';
import type { Defaut } from './garde-fous.ts';
import { verifierTraduction } from './garde-fous.ts';
import { lireReponse } from './lecture.ts';
import type { Modele } from './modeles.ts';

/**
 * `identique` : déjà dans la langue du lecteur, ou rien à traduire (« AA vs KK ») — on montre
 * l'original, sans mention. `rejete` : un garde-fou a refusé. `absent` : le modèle a sauté le bloc.
 */
export type Statut = 'traduit' | 'identique' | 'rejete' | 'absent';

export interface ResultatElement {
  id: string;
  statut: Statut;
  /** Le texte lu, présent même quand il est rejeté : le banc doit pouvoir le montrer. */
  texte?: string;
  source?: string;
  defauts?: Defaut[];
}

export interface ResultatLot {
  elements: ResultatElement[];
  consigne: Consigne;
  reponse: Reponse;
  anomalies: string[];
}

/**
 * Plafond de sortie. Il ne coûte rien (on paie les tokens produits, pas le plafond), mais trop bas
 * il tronque la dernière traduction : ~1,2 token par caractère couvre même le chinois, et un
 * modèle qui raisonne reçoit de quoi réfléchir sans manger la réponse.
 */
export function longueurMax(elements: ElementATraduire[], modele: Modele): number {
  const utile = elements.reduce((n, e) => n + 48 + Math.ceil(e.texte.length * 1.2), 64);
  return Math.min(8192, utile + (modele.raisonne ? 1024 : 0));
}

export async function traduireLot(
  ids: Identifiants,
  modele: Modele,
  elements: ElementATraduire[],
  cible: string,
  sourceProbable: string | null,
  fetcher?: typeof fetch,
): Promise<ResultatLot> {
  const consigne = construireConsigne(elements, cible, sourceProbable);
  const reponse = await appelerCloudflare(
    ids,
    { modele, systeme: consigne.systeme, utilisateur: consigne.utilisateur, longueurMax: longueurMax(elements, modele) },
    fetcher,
  );
  const { blocs, anomalies } = lireReponse(reponse.texte, consigne.nonce);
  if (reponse.tronquee) anomalies.push('sortie tronquée : le plafond de longueur a été atteint');
  const base = langueDeBase(cible);

  const resultats = elements.map((e): ResultatElement => {
    const bloc = blocs.get(e.id);
    if (!bloc) return { id: e.id, statut: 'absent' };
    if (bloc.source === 'zxx' || langueDeBase(bloc.source) === base || bloc.texte === e.texte.trim()) {
      return { id: e.id, statut: 'identique', texte: bloc.texte, source: bloc.source };
    }
    const defauts = verifierTraduction(e.texte, bloc.texte, cible, bloc.source);
    return { id: e.id, statut: defauts.length > 0 ? 'rejete' : 'traduit', texte: bloc.texte, source: bloc.source, defauts };
  });

  for (const id of blocs.keys()) {
    if (!elements.some((e) => e.id === id)) anomalies.push(`bloc au nom inconnu : ${id}`);
  }
  return { elements: resultats, consigne, reponse, anomalies };
}
