import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ContextData } from './types';
import { type DerniereTable, tableDepuisContexte, validerTable } from './derniereTable';

/**
 * LE SEUL FICHIER QUI TOUCHE AU DISQUE pour les tables mémorisées (cf. `derniereTable`, qui explique
 * pourquoi la séparation existe).
 *
 * ⚠️ `chargerDerniereTable` N'A PAS SA PLACE DANS UN `useEffect` DE MONTAGE. C'est toute la
 * différence avec `contextPrefs`, qui pré-remplit le formulaire tout seul : ici, rien ne doit
 * apparaître à l'écran sans qu'un doigt l'ait demandé. Un chargement au montage pour « avoir la
 * donnée sous la main » est acceptable ; l'APPLIQUER sans geste ne l'est pas.
 */

const KEY = 'pokza.creator.dernieresTables.v1';

/** On range une LISTE là où l'écran n'en lit que la première : la suite naturelle est une banque de
 *  tables par lieu (cf. la banque de lieux), et changer la forme du stockage plus tard ferait perdre
 *  ce qui y est déjà. Le plafond est une borne technique, pas une valeur produit — rien ne l'affiche. */
const MAX_TABLES = 5;

/** Appelée à la PUBLICATION seulement : une main abandonnée en cours de route n'a pas de table
 *  digne d'être reproposée. Sans effet quand aucun adversaire n'est nommé. */
export async function memoriserTable(ctx: ContextData): Promise<void> {
  const table = tableDepuisContexte(ctx, new Date().toISOString());
  if (!table) return;
  try {
    const brut = await AsyncStorage.getItem(KEY);
    const liste = brut ? (JSON.parse(brut) as unknown[]) : [];
    const suite = [table, ...(Array.isArray(liste) ? liste : [])].slice(0, MAX_TABLES);
    await AsyncStorage.setItem(KEY, JSON.stringify(suite));
  } catch {
    // Pur confort : un échec d'écriture ne doit jamais interrompre une publication.
  }
}

/** La dernière table utilisable, ou `null`. Ne s'applique à rien toute seule. */
export async function chargerDerniereTable(): Promise<DerniereTable | null> {
  try {
    const brut = await AsyncStorage.getItem(KEY);
    if (!brut) return null;
    const liste = JSON.parse(brut) as unknown;
    if (!Array.isArray(liste)) return null;
    for (const entree of liste) {
      const table = validerTable(entree);
      if (table) return table;
    }
    return null;
  } catch {
    return null;
  }
}
