import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONTEXT, TOURNAMENT_DEFAULTS, type ContextData, type AnteType } from './types';
import { gameTypeForFormat } from '../profile/profileOptions';
import type { GameType, Position, Variant } from '../types/poker';

const KEY = 'pokza.creator.contextPrefs.v1';

/**
 * Mémorisation des derniers réglages de table, d'une création de main à l'autre, pour accélérer la
 * saisie. On ne garde que les paramètres « de setup » que l'utilisateur retape à l'identique la
 * plupart du temps (sa partie habituelle) : variante, type de partie, blindes, ante, straddle, stack
 * effectif, nombre de joueurs (+ sa position, indissociable du nombre de joueurs), le lieu et le
 * nom que le joueur se donne — un pseudo ne change pas d'une main à l'autre.
 *
 * On ne mémorise volontairement PAS le mode bomb pot / double board (on repart en jeu classique par
 * défaut), ni les détails propres à une main donnée (noms/stacks adverses, buy-in, niveau).
 */
interface ContextPrefs {
  gameType: GameType;
  variant: Variant;
  sb: number;
  bb: number;
  effectiveStack: number;
  numPlayers: number;
  heroPosition: Position;
  location?: string;
  heroName?: string;
  anteType: AnteType;
  ante: number;
  straddleCount: 0 | 1 | 2 | 3;
  straddleAmount: number;
}

const GAME_TYPES: GameType[] = ['cash', 'tournament'];
const VARIANTS: Variant[] = ['nlhe', 'plo', 'plo5'];
const ANTE_TYPES: AnteType[] = ['none', 'bb', 'per-player'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function saveContextPrefs(context: ContextData): Promise<void> {
  const prefs: ContextPrefs = {
    gameType: context.gameType,
    variant: context.variant,
    sb: context.sb,
    bb: context.bb,
    effectiveStack: context.effectiveStack,
    numPlayers: context.numPlayers,
    heroPosition: context.heroPosition,
    location: context.location,
    heroName: context.heroName,
    anteType: context.anteType,
    ante: context.ante,
    straddleCount: context.straddleCount,
    straddleAmount: context.straddleAmount,
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // La mémorisation est un pur confort : si l'écriture échoue, on n'interrompt pas la création.
  }
}

/** Ce que le profil du joueur dit de sa partie habituelle (cf. `profiles.format_favori` et
 * `profiles.variante_favorite`). Les deux champs sont optionnels : un profil incomplet ou une
 * requête en échec laisse simplement le formulaire sur ses valeurs par défaut. */
export interface PlayerGamePrefs {
  formatFavori?: string;
  varianteFavorite?: string;
}

/**
 * Table de départ d'un joueur qui n'a encore jamais créé de main : DEFAULT_CONTEXT ajusté à sa
 * partie habituelle déclarée au profil (variante préférée, et cash game / tournoi selon le format
 * favori — le tournoi entraîne avec lui ses blindes et son stack, comme la chip « Tournoi »).
 *
 * ⚠️ Ce n'est qu'une BASE : dès qu'une main a été créée, `loadContextPrefs` recouvre ces champs par
 * les derniers réglages réellement utilisés. Un joueur de cash game qui vient de raconter une main
 * de tournoi retrouve donc « Tournoi » présélectionné, pas son format favori.
 */
export function defaultContextForPlayer(player?: PlayerGamePrefs): ContextData {
  const base: ContextData = { ...DEFAULT_CONTEXT };
  if (gameTypeForFormat(player?.formatFavori) === 'tournament') {
    base.gameType = 'tournament';
    base.sb = TOURNAMENT_DEFAULTS.sb;
    base.bb = TOURNAMENT_DEFAULTS.bb;
    base.effectiveStack = TOURNAMENT_DEFAULTS.effectiveStack;
  }
  const variant = player?.varianteFavorite;
  if (variant && VARIANTS.includes(variant as Variant)) base.variant = variant as Variant;
  return base;
}

/**
 * Renvoie la base passée en argument (cf. `defaultContextForPlayer`) enrichie des derniers réglages
 * mémorisés, qui ont le dernier mot : la dernière main créée est un meilleur indice de ce qu'on
 * s'apprête à raconter que le format déclaré au profil. Chaque champ est validé individuellement :
 * toute valeur absente, d'un mauvais type ou hors énumération retombe sur la valeur de base, pour
 * qu'un stockage corrompu ou issu d'une ancienne version ne casse jamais le formulaire.
 */
export async function loadContextPrefs(base: ContextData = DEFAULT_CONTEXT): Promise<ContextData> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    return base;
  }
  if (!raw) return base;

  let p: Partial<ContextPrefs>;
  try {
    p = JSON.parse(raw) as Partial<ContextPrefs>;
  } catch {
    return base;
  }

  const merged: ContextData = { ...base };
  if (p.gameType && GAME_TYPES.includes(p.gameType)) merged.gameType = p.gameType;
  if (p.variant && VARIANTS.includes(p.variant)) merged.variant = p.variant;
  if (isNum(p.sb)) merged.sb = p.sb;
  if (isNum(p.bb)) merged.bb = p.bb;
  if (isNum(p.effectiveStack)) merged.effectiveStack = p.effectiveStack;
  if (isNum(p.numPlayers)) merged.numPlayers = p.numPlayers;
  if (typeof p.heroPosition === 'string') merged.heroPosition = p.heroPosition;
  if (typeof p.location === 'string') merged.location = p.location;
  if (typeof p.heroName === 'string') merged.heroName = p.heroName;
  if (p.anteType && ANTE_TYPES.includes(p.anteType)) merged.anteType = p.anteType;
  if (isNum(p.ante)) merged.ante = p.ante;
  if (p.straddleCount === 0 || p.straddleCount === 1 || p.straddleCount === 2 || p.straddleCount === 3)
    merged.straddleCount = p.straddleCount;
  if (isNum(p.straddleAmount)) merged.straddleAmount = p.straddleAmount;
  return merged;
}
