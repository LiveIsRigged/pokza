import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Group } from '../data/groups';

const KEY = 'pokza.groups.lastUsed.v1';

/**
 * Derniers groupes dans lesquels ce joueur a publié, du plus récent au plus ancien, mémorisés sur
 * l'appareil — même mécanique que `contextPrefs` pour les réglages de table.
 *
 * Pourquoi l'appareil et non la base : c'est un raccourci de saisie, pas une donnée du compte. Le
 * lire coûterait une requête de plus à chaque ouverture du créateur, et sa perte ne coûte qu'un
 * ordre d'affichage — sur un appareil neuf on retombe simplement sur « aucune présélection », ce
 * qui est déjà le comportement voulu quand on n'a pas d'historique.
 */

/** On en garde plus que les 4 chips affichés : la même liste ordonne aussi le sélecteur complet.
 *  Valeur technique — elle ne change rien à ce que le joueur voit. */
const MAX_REMEMBERED = 20;

export async function loadLastUsedGroupIds(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string').slice(0, MAX_REMEMBERED);
  } catch {
    return [];
  }
}

export async function rememberUsedGroup(groupId: string): Promise<void> {
  try {
    const current = await loadLastUsedGroupIds();
    const next = [groupId, ...current.filter((id) => id !== groupId)].slice(0, MAX_REMEMBERED);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Un historique perdu ne coûte qu'un ordre d'affichage : jamais de quoi interrompre une publication.
  }
}

/** Les groupes récemment utilisés d'abord, dans l'ordre d'utilisation ; les autres derrière, dans
 *  l'ordre reçu. */
export function orderGroupsByLastUsed(groups: Group[], lastUsedIds: string[]): Group[] {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const recent = lastUsedIds.map((id) => byId.get(id)).filter((g): g is Group => !!g);
  const recentIds = new Set(recent.map((g) => g.id));
  return [...recent, ...groups.filter((g) => !recentIds.has(g.id))];
}

/**
 * Groupe présélectionné quand on choisit « Groupe privé ». Le dernier utilisé s'il existe encore
 * (quitté ou supprimé, il ne compte plus), sinon rien — sauf s'il n'y a qu'un seul groupe, où il
 * n'y a rien à deviner.
 *
 * Surtout PAS le premier de la liste par défaut : c'était le groupe créé le plus anciennement, une
 * donnée sans rapport avec l'intention. Publier dans le mauvais groupe notifie ses membres à
 * l'insertion, et corriger la visibilité après coup ne retire pas ces notifications.
 */
export function defaultGroupId(groups: Group[], lastUsedIds: string[]): string | undefined {
  const lastUsed = lastUsedIds.find((id) => groups.some((g) => g.id === id));
  if (lastUsed) return lastUsed;
  return groups.length === 1 ? groups[0].id : undefined;
}
