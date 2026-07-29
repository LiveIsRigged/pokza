const GIPHY_API_KEY = process.env.EXPO_PUBLIC_GIPHY_API_KEY;
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

export interface GifResult {
  id: string;
  /** Format allégé pour l'aperçu dans la grille de résultats. */
  previewUrl: string;
  /** Format envoyé dans le commentaire une fois choisi. */
  url: string;
  width: number;
  height: number;
}

interface GiphyImageVariant {
  url: string;
  width: string;
  height: string;
}

interface GiphyGif {
  id: string;
  images: {
    fixed_width: GiphyImageVariant;
    original: GiphyImageVariant;
  };
}

function rowToGif(gif: GiphyGif): GifResult {
  return {
    id: gif.id,
    previewUrl: gif.images.fixed_width.url,
    url: gif.images.original.url,
    width: Number(gif.images.original.width),
    height: Number(gif.images.original.height),
  };
}

async function giphyFetch(path: string, params: Record<string, string>): Promise<GifResult[]> {
  if (!GIPHY_API_KEY) {
    throw new Error("Recherche de GIF indisponible : EXPO_PUBLIC_GIPHY_API_KEY n'est pas configurée.");
  }
  const query = new URLSearchParams({ api_key: GIPHY_API_KEY, limit: '24', rating: 'pg-13', ...params });
  const response = await fetch(`${GIPHY_BASE_URL}/${path}?${query.toString()}`);
  if (!response.ok) throw new Error('La recherche de GIF a échoué.');
  const json = await response.json();
  return (json.data as GiphyGif[]).map(rowToGif);
}

/** Résultats tendances — écran par défaut avant toute recherche, comme sur WhatsApp/iMessage. */
export async function fetchTrendingGifs(): Promise<GifResult[]> {
  return giphyFetch('trending', {});
}

export async function searchGifs(query: string): Promise<GifResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return fetchTrendingGifs();
  return giphyFetch('search', { q: trimmed });
}
