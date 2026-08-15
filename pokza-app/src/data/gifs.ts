import { supabase } from '../lib/supabase';

/**
 * La recherche de GIF passe par la fonction serveur `giphy` (F-16 de l'audit).
 *
 * AVANT : la clé d'API GIPHY était inlinée dans le bundle JS (`EXPO_PUBLIC_GIPHY_API_KEY`) et
 * lisible par n'importe quel visiteur, qui pouvait alors consommer le quota du compte Pokza.
 * MAINTENANT : la clé ne quitte jamais le serveur, et seuls les comptes connectés peuvent
 * déclencher une recherche — la fonction vérifie l'utilisateur elle-même
 * (cf. supabase/functions/giphy/index.ts).
 *
 * Les GIF eux-mêmes restent servis directement par GIPHY au navigateur : ce sont des images
 * publiques, les proxyfier coûterait de la bande passante pour rien. C'est pourquoi la CSP
 * autorise toujours `https://*.giphy.com` en `img-src`, mais plus `api.giphy.com` en `connect-src`.
 */

export interface GifResult {
  id: string;
  /** Format allégé pour l'aperçu dans la grille de résultats. */
  previewUrl: string;
  /** Format envoyé dans le commentaire une fois choisi. */
  url: string;
  width: number;
  height: number;
}

async function giphyInvoke(path: 'trending' | 'search', q?: string): Promise<GifResult[]> {
  const { data, error } = await supabase.functions.invoke('giphy', { body: { path, q } });
  if (error) throw new Error('La recherche de GIF a échoué.');
  // La fonction renvoie déjà les cinq champs utiles, aucun remodelage à faire ici.
  return (data?.gifs ?? []) as GifResult[];
}

/** Résultats tendances — écran par défaut avant toute recherche, comme sur WhatsApp/iMessage. */
export async function fetchTrendingGifs(): Promise<GifResult[]> {
  return giphyInvoke('trending');
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return fetchTrendingGifs();
  return giphyInvoke('search', trimmed);
}
