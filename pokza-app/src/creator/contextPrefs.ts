import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONTEXT, type ContextData, type AnteType } from './types';
import type { GameType, Position, Variant } from '../types/poker';

const KEY = 'pokza.creator.contextPrefs.v1';

/**
 * Mémorisation des derniers réglages de table, d'une création de main à l'autre, pour accélérer la
 * saisie. On ne garde que les paramètres « de setup » que l'utilisateur retape à l'identique la
 * plupart du temps (sa partie habituelle) : variante, type de partie, blindes, ante, straddle, stack
 * effectif, nombre de joueurs (+ sa position, indissociable du nombre de joueurs) et le lieu.
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

/**
 * Renvoie DEFAULT_CONTEXT enrichi des derniers réglages mémorisés. Chaque champ est validé
 * individuellement : toute valeur absente, d'un mauvais type ou hors énumération retombe sur la
 * valeur par défaut, pour qu'un stockage corrompu ou issu d'une ancienne version ne casse jamais le
 * formulaire.
 */
export async function loadContextPrefs(): Promise<ContextData> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(KEY);
  } catch {
    return DEFAULT_CONTEXT;
  }
  if (!raw) return DEFAULT_CONTEXT;

  let p: Partial<ContextPrefs>;
  try {
    p = JSON.parse(raw) as Partial<ContextPrefs>;
  } catch {
    return DEFAULT_CONTEXT;
  }

  const merged: ContextData = { ...DEFAULT_CONTEXT };
  if (p.gameType && GAME_TYPES.includes(p.gameType)) merged.gameType = p.gameType;
  if (p.variant && VARIANTS.includes(p.variant)) merged.variant = p.variant;
  if (isNum(p.sb)) merged.sb = p.sb;
  if (isNum(p.bb)) merged.bb = p.bb;
  if (isNum(p.effectiveStack)) merged.effectiveStack = p.effectiveStack;
  if (isNum(p.numPlayers)) merged.numPlayers = p.numPlayers;
  if (typeof p.heroPosition === 'string') merged.heroPosition = p.heroPosition;
  if (typeof p.location === 'string') merged.location = p.location;
  if (p.anteType && ANTE_TYPES.includes(p.anteType)) merged.anteType = p.anteType;
  if (isNum(p.ante)) merged.ante = p.ante;
  if (p.straddleCount === 0 || p.straddleCount === 1 || p.straddleCount === 2 || p.straddleCount === 3)
    merged.straddleCount = p.straddleCount;
  if (isNum(p.straddleAmount)) merged.straddleAmount = p.straddleAmount;
  return merged;
}
