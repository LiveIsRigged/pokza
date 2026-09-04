import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_CONTEXT, TOURNAMENT_DEFAULTS, type ContextData, type AnteType } from './types';
import { gameTypeForFormat } from '../profile/profileOptions';
import type { GameType, Position, Variant } from '../types/poker';
import { DEVISES, type CodeDevise } from '../utils/currency';

const KEY = 'pokza.creator.contextPrefs.v1';

/**
 * Mémorisation des derniers réglages de table, d'une création de main à l'autre, pour accélérer la
 * saisie. On ne garde que les paramètres « de setup » que l'utilisateur retape à l'identique la
 * plupart du temps (sa partie habituelle) : variante, type de partie, blindes, ante, straddle, stack
 * effectif, nombre de joueurs (+ sa position, indissociable du nombre de joueurs), la devise, le
 * lieu et le nom que le joueur se donne — un pseudo ne change pas d'une main à l'autre.
 *
 * On ne mémorise volontairement PAS le mode bomb pot / double board (on repart en jeu classique par
 * défaut), ni les détails propres à une main donnée (noms/stacks adverses, NIVEAU de blindes).
 *
 * ⚠️ DEUX CHAMPS FONT EXCEPTION ET PÉRIMENT : le nom du tournoi et son buy-in (04/09/2026). Ils
 * décrivent une ÉPREUVE, pas une partie habituelle — et une épreuve est un événement borné, là où
 * une salle ou un niveau d'enjeu durent des mois. D'où `PEREMPTION_EPREUVE_MS`.
 *
 * Le NIVEAU, lui, reste hors de la mémorisation, et c'est le bon classement : il change tous les
 * vingt minutes, alors que le nom et le buy-in de l'épreuve ne changent pas d'une main à l'autre.
 * C'est aussi pour ça que les deux voyagent ENSEMBLE : ce sont deux faits sur le même tournoi, et
 * retenir l'un sans l'autre ferait retaper « 250 € » à chaque main sous un « Main Event » déjà là.
 */

/**
 * Au-delà de ce délai, le nom du tournoi et son buy-in ne sont plus proposés. 12 h, tranché par
 * Victor le 04/09/2026.
 *
 * POURQUOI CE CHAMP PÉRIME ALORS QU'AUCUN AUTRE NE LE FAIT. Des blindes périmées se corrigent
 * d'elles-mêmes : on voit « 500/1000 » en étant à « 2000/4000 », on change. Un « Main Event » resté
 * du tournoi de la semaine dernière, posé sur une main jouée dans un side event, **ne se voit pas**
 * — et la main se publie avec le mauvais nom d'épreuve. Le lieu ne pose pas ce problème (une salle
 * reste la même pendant des mois) ; un tournoi change à chaque inscription.
 *
 * Le compte à rebours GLISSE, mais seule une main de tournoi le réarme (cf. `epreuveAEcrire`) :
 * une soirée de cash game ne peut pas garder en vie le nom d'un tournoi de l'avant-veille.
 *
 * Limite résiduelle, assumée : dans les 12 h, le champ est pré-rempli même si l'on s'est inscrit
 * entre-temps à une autre épreuve. Aucune péremption ne peut couvrir ce cas — seul l'auteur voit
 * dans quel tournoi il est assis. Elle ferme le cas long, pas le cas court.
 */
export const PEREMPTION_EPREUVE_MS = 12 * 60 * 60 * 1000;

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
  straddleAmounts: number[];
  straddleBouton: boolean;
  straddleBoutonMontant: number;
  currency: CodeDevise;
  /** Nom de l'épreuve. PÉRIME (cf. `PEREMPTION_EPREUVE_MS`). */
  tournamentName?: string;
  /** Buy-in de l'épreuve. Périme avec le nom, dont il est indissociable. */
  buyIn?: string;
  /** Date d'écriture des deux champs ci-dessus par une main de TOURNOI. Absent ou illisible = on ne
   *  propose rien : oublier est le mode de défaillance souhaitable ici. */
  tournamentSavedAt?: number;
}

const GAME_TYPES: GameType[] = ['cash', 'tournament'];
const VARIANTS: Variant[] = ['nlhe', 'plo', 'plo5'];
const ANTE_TYPES: AnteType[] = ['none', 'bb', 'per-player'];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Les champs d'épreuve à écrire, et leur horodatage.
 *
 * Une main de TOURNOI les prend du formulaire et réarme les 12 h. Une main de CASH GAME n'y touche
 * pas : elle relit ce qui était stocké et le réécrit tel quel, horodatage COMPRIS. C'est cette
 * relecture qui empêche une soirée de cash game de repousser indéfiniment la péremption d'un nom de
 * tournoi — sans elle, le simple fait de continuer à publier réarmerait le compte à rebours.
 */
async function epreuveAEcrire(
  context: ContextData
): Promise<Pick<ContextPrefs, 'tournamentName' | 'buyIn' | 'tournamentSavedAt'>> {
  if (context.gameType === 'tournament') {
    return {
      tournamentName: context.tournamentName,
      buyIn: context.buyIn,
      tournamentSavedAt: Date.now(),
    };
  }
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ContextPrefs>;
      return {
        tournamentName: typeof p.tournamentName === 'string' ? p.tournamentName : undefined,
        buyIn: typeof p.buyIn === 'string' ? p.buyIn : undefined,
        tournamentSavedAt: isNum(p.tournamentSavedAt) ? p.tournamentSavedAt : undefined,
      };
    }
  } catch {
    // Disque muet ou contenu illisible : on repart sans champs d'épreuve. La mémorisation est un
    // pur confort, et ne rien proposer est toujours préférable à proposer n'importe quoi.
  }
  return {};
}

export async function saveContextPrefs(context: ContextData): Promise<void> {
  const epreuve = await epreuveAEcrire(context);
  const prefs: ContextPrefs = {
    ...epreuve,
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
    straddleAmounts: context.straddleAmounts,
    straddleBouton: context.straddleBouton,
    straddleBoutonMontant: context.straddleBoutonMontant,
    currency: context.currency,
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
  if (Array.isArray(p.straddleAmounts) && p.straddleAmounts.every(isNum))
    merged.straddleAmounts = p.straddleAmounts;
  // Préférences écrites avant que les straddles ne portent chacun leur montant : un seul nombre y
  // valait toute la chaîne, par doublement. On le rouvre plutôt que de perdre le réglage habituel.
  else if (isNum((p as { straddleAmount?: unknown }).straddleAmount))
    merged.straddleAmounts = Array.from(
      { length: merged.straddleCount },
      (_, i) => (p as { straddleAmount: number }).straddleAmount * 2 ** i
    );
  if (typeof p.straddleBouton === 'boolean') merged.straddleBouton = p.straddleBouton;
  if (isNum(p.straddleBoutonMontant)) merged.straddleBoutonMontant = p.straddleBoutonMontant;
  if (p.currency && DEVISES.some((d) => d.code === p.currency)) merged.currency = p.currency;

  // LES SEULS CHAMPS QUI PÉRIMENT (cf. `PEREMPTION_EPREUVE_MS`). Un horodatage absent, illisible ou
  // DANS LE FUTUR ne propose rien : une horloge qui a reculé rendrait sinon un nom d'épreuve
  // increvable, alors qu'oublier ne coûte qu'une saisie.
  const age = isNum(p.tournamentSavedAt) ? Date.now() - p.tournamentSavedAt : Infinity;
  if (age >= 0 && age < PEREMPTION_EPREUVE_MS) {
    if (typeof p.tournamentName === 'string') merged.tournamentName = p.tournamentName;
    if (typeof p.buyIn === 'string') merged.buyIn = p.buyIn;
  }
  return merged;
}
