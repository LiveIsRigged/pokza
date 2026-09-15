import { FunctionsFetchError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { langueCourante, t } from '../i18n/traduire';

/**
 * TRADUCTION DU CONTENU — le bouton « Traduire » d'une main ou d'un commentaire.
 * ─────────────────────────────────────────────────────────────────────────────
 * Décisions du 15/09 : tout passe par un bouton, jamais d'office ; un bouton par main traduit d'un
 * coup le titre, la description et le sondage ; un bouton par commentaire ; aucune mention
 * « traduit de… » — on sait qu'on a traduit, on vient de toucher le bouton.
 *
 * La traduction elle-même se fait dans l'Edge Function `traduire` (Workers AI, plan gratuit) : le
 * jeton Cloudflare n'est jamais dans le bundle, et la fonction relit la main AVEC le jeton du
 * lecteur, donc ne traduit que ce qu'il a le droit de voir.
 */

/** Une main traduite, prête à remplacer l'originale à l'écran. `options` suit l'ORDRE du sondage. */
export interface TraductionPost {
  titre: string;
  description: string | null;
  question: string | null;
  options: string[];
}

/**
 * `identique` : le texte était déjà dans la langue du lecteur, ou n'avait rien à traduire.
 * `quota` : le quota gratuit du jour est épuisé (il revient à 00:00 UTC).
 * `hors_ligne` : la requête n'est jamais partie.
 */
export type IssueTraduction<T> =
  | { statut: 'traduit'; valeur: T }
  | { statut: 'identique' | 'echec' | 'quota' | 'hors_ligne' };

/**
 * Le bouton ne se propose que sur un texte écrit dans une autre langue que celle du lecteur.
 *
 * La langue du texte est lue par le modèle à la publication (décision B du 15/09) — pas déduite du
 * profil de l'auteur, qui se trompe dès qu'on écrit dans une autre langue que son interface.
 * Inconnue ou `zxx` (« AA vs KK », « gg ») : pas de bouton, il n'y aurait rien à traduire.
 */
export function proposerTraduction(langueTexte: string | undefined, langueLecteur: string = langueCourante()): boolean {
  if (!langueTexte || langueTexte === 'zxx' || langueTexte === 'und') return false;
  // « de-AT » lit comme « de » : une variante régionale n'appelle pas de traduction.
  return langueTexte.split(/-/)[0] !== langueLecteur.split(/-/)[0];
}

async function demander<T>(type: 'post' | 'comment', id: string, lire: (data: Record<string, unknown>) => T | null): Promise<IssueTraduction<T>> {
  const { data, error } = await supabase.functions.invoke('traduire', {
    // `langue` ne sert que si le profil n'a pas encore reçu la langue résolue : c'est celle du profil
    // qui fait foi côté serveur.
    body: { mode: 'traduire', type, id, langue: langueCourante() },
  });
  if (error) {
    // `FunctionsFetchError` = la requête n'a pas pu partir (pas de réseau). Tout le reste — une
    // réponse 4xx/5xx de la fonction, un relais Supabase en panne — est un échec de traduction.
    return { statut: error instanceof FunctionsFetchError ? 'hors_ligne' : 'echec' };
  }
  const statut = (data as { statut?: unknown } | null)?.statut;
  if (statut === 'identique' || statut === 'quota' || statut === 'echec') return { statut };
  const valeur = statut === 'traduit' ? lire(data as Record<string, unknown>) : null;
  return valeur ? { statut: 'traduit', valeur } : { statut: 'echec' };
}

export function traduirePost(postId: string): Promise<IssueTraduction<TraductionPost>> {
  return demander('post', postId, (data) => {
    const p = data.post as Partial<TraductionPost> | undefined;
    if (!p || typeof p.titre !== 'string' || !Array.isArray(p.options)) return null;
    return {
      titre: p.titre,
      description: typeof p.description === 'string' ? p.description : null,
      question: typeof p.question === 'string' ? p.question : null,
      options: p.options.map(String),
    };
  });
}

/**
 * Le message affiché quand le bouton n'a rien traduit — les textes validés par Victor le 15/09.
 * Quota et échec sont distincts exprès : « réessaie dans un instant » serait faux quand plus rien
 * ne passera avant minuit UTC. Texte fabriqué au toucher, jamais affiché en continu : `t` nu suffit.
 */
export function messageEchecTraduction(statut: Exclude<IssueTraduction<unknown>['statut'], 'traduit'>): string {
  switch (statut) {
    case 'identique':
      return t('traduction.deja_ta_langue');
    case 'quota':
      return t('traduction.quota');
    case 'hors_ligne':
      return t('erreur.connexion_indisponible');
    default:
      return t('traduction.echec');
  }
}

export function traduireCommentaire(commentId: string): Promise<IssueTraduction<string>> {
  return demander('comment', commentId, (data) => (typeof data.texte === 'string' ? data.texte : null));
}
