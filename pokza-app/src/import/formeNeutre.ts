import type { Card, Rank, Street, Suit } from '../types/poker';
import type { CodeDevise } from '../utils/currency';

/**
 * LA FORME NEUTRE — CE QU'UN DIALECTE A LU, AVANT TOUTE INTERPRÉTATION POKZA.
 * ═════════════════════════════════════════════════════════════════════════
 * Un dialecte ne connaît QUE son texte : des noms, des verbes, des nombres, un ordre. Il ne sait
 * rien des positions de Pokza, ni que `Action.amount` est un total de street, ni qu'un siège a un
 * identifiant déterministe. Tout ça, c'est le montage (cf. `montage.ts`), écrit UNE FOIS.
 *
 * C'est la seule ligne de partage qui tienne à l'échelle : ajouter une salle doit coûter une table
 * de tournures, pas une relecture de la logique dure. Ce qui suit est donc volontairement plat et
 * bête — la forme neutre n'a aucune règle de poker, juste ce que le fichier dit.
 *
 * ⚠️ LA LEÇON QUI A COÛTÉ LE PLUS CHER (mesurée le 04/09/2026 sur un tournoi Betclic) :
 * `typePartie` SE LIT AVANT LES MONTANTS, et décide de ce qu'ils veulent dire. Betclic écrit
 * « €200.00 in chips » sur des JETONS DE TOURNOI. Lu naïvement, ça donne un cash game à 10/20 €
 * — et les six contrôles passent tous, puisque cette lecture est parfaitement cohérente. Les
 * contrôles vérifient la cohérence interne d'une lecture, PAS son sens. Le sens vient d'ici.
 */

/** Une main lue, telle que le fichier la raconte. Rien de plus, rien d'interprété. */
export interface MainLue {
  /** Identifiant du dialecte qui a lu ce texte — apparaît dans les refus et les tests. */
  dialecte: string;
  /**
   * Nom de la SALLE, quand ce dialecte permet de la nommer (décision nº4 du 04/09 : une salle
   * donne son nom au lieu, un OUTIL ne le donne à rien). `undefined` = personne ne l'a nommée, et
   * le lieu restera VIDE plutôt que devinée — cas mesuré : Betclic n'écrit que
   * `GAME #… Version:23.1.1.1`, signature parfaite mais anonyme, et le même logiciel peut servir
   * plusieurs salles.
   */
  salle?: string;
  /** ⚠️ Se lit AVANT les montants (cf. l'avertissement en tête de fichier). */
  typePartie: 'cash' | 'tournoi';
  /** La variante TELLE QU'ÉCRITE. Le montage refuse ce qu'il ne sait pas jouer. */
  variante: string;
  /** Devise des montants — cash game seulement. En tournoi les jetons ne sont pas de l'argent. */
  devise?: CodeDevise;
  nomTournoi?: string;
  /** Le prix de l'épreuve, tel qu'écrit (« 45€ + 5€ », « €4.65 + €0.35 ») — de l'argent RÉEL,
   *  seul endroit d'une main de tournoi où un signe de devise ne mente pas. */
  buyIn?: string;
  /** Le seul nombre du niveau (« 12 »), sans le mot. */
  niveau?: string;
  /** Les sièges DANS L'ORDRE DU FICHIER — cet ordre est lui-même un témoin chez certains
   *  dialectes (cf. `temoinPositions`), il ne faut donc pas le trier ici. */
  sieges: SiegeLu[];
  /** Numéro de siège du bouton. */
  siegeBouton: number;
  /** Le joueur dont le fichier montre les cartes fermées : l'auteur. Une main sans lui est
   *  refusée — le modèle de Pokza a toujours exactement un héros. */
  hero?: { nom: string; cartes: Card[] };
  /** Mises forcées, dans l'ordre du texte. */
  misesForcees: MiseForceeLue[];
  /** Actions volontaires, dans l'ordre du texte. */
  actions: ActionLue[];
  /** Board dans l'ordre de distribution, 0/3/4 ou 5 cartes. */
  board: Card[];
  /** Le board tel que le RÉSUMÉ le réécrit, quand le dialecte en a un (`Board: [6c 2d Qh 4s 4c]`
   *  chez Winamax). Témoin gratuit sur l'assemblage street par street — et Betclic n'en a AUCUN,
   *  d'où l'optionnalité. */
  boardResume?: Card[];
  /** Cartes MONTRÉES à l'abattage. Jamais un `Mucks` : montrer des cartes que personne n'a vues
   *  à table serait raconter une autre main que celle qui a été jouée. */
  abattage: CartesMontrees[];
  /** Ce que le fichier annonce de son propre résultat — le témoin de la vérification par rejeu. */
  resume?: ResumeLu;
  /** Comment CE dialecte écrit son « Total pot » (cf. `EquationDuPot`). */
  equationDuPot: EquationDuPot;
  /** Témoin gratuit, propre au dialecte, sur le placement des positions (cf. `TemoinPositions`). */
  temoinPositions?: TemoinPositions;
  /**
   * CE QUE LE DIALECTE A DÛ TRANCHER PAR DÉFAUT, et qu'il faut dire à l'auteur.
   *
   * ⚠️ CE CANAL EST ICI PARCE QU'UN DIALECTE SAIT DE SA NOTATION CE QUE LE MONTAGE NE PEUT PAS
   * SAVOIR. Le montage avertit déjà de ce qu'IL laisse tomber (un nom d'épreuve trop long pour son
   * champ) ; mais « cette notation n'écrit jamais si c'est du cash ou un tournoi » est une
   * propriété du FORMAT, invisible depuis la forme neutre — la main lue est parfaitement cohérente,
   * simplement muette sur ce point. `monter` les reprend tels quels et y ajoute les siens.
   *
   * Ce ne sont JAMAIS des refus : la main part, l'auteur est seulement prévenu de ce qu'il peut
   * corriger en remontant à l'étape 1.
   */
  avertissements?: string[];
}

export interface SiegeLu {
  /** Numéro imprimé sur la ligne `Seat N:` — jamais l'index dans la liste. */
  numero: number;
  nom: string;
  /** Tapis de départ, dans l'unité du fichier (euros en cash, jetons en tournoi). */
  tapis: number;
}

export type GenreForce = 'sb' | 'bb' | 'ante' | 'straddle';

export interface MiseForceeLue {
  nom: string;
  genre: GenreForce;
  montant: number;
}

/**
 * Ce que le texte dit d'une action, y compris SA CONVENTION DE MONTANT.
 *
 * ⚠️ PIÈGE Nº 1 DU CHANTIER : les deux salles mesurées écrivent les suivis en INCRÉMENT et les
 * mises/relances en TOTAL de street. Et ce n'est pas uniforme par salle : le verbe `Allin` de
 * Betclic est un incrément (20 de BB + 180 = 200) là où son `Raise` est un total. C'est donc au
 * VERBE de déclarer sa convention, et au montage de faire l'arithmétique une seule fois.
 */
export interface ActionLue {
  nom: string;
  rue: Street;
  /** `tapis` = le texte a dit « à tapis » sans dire suivre ni relancer (le `Allin` de Betclic).
   *  Le montage tranche entre suivre et relancer d'après le total obtenu — Pokza n'a pas de type
   *  « tapis », le tapis se DÉDUIT de l'épuisement du tapis. */
  genre: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'tapis';
  montant?: number;
  montantEst?: 'total' | 'increment';
  /** Le texte a annoncé le tapis en toutes lettres (Winamax le fait, Betclic non). Sert de
   *  contre-épreuve : quand il est là, il doit tomber d'accord avec l'épuisement calculé. */
  tapisAnnonce?: boolean;
}

export interface CartesMontrees {
  nom: string;
  cartes: Card[];
}

export interface ResumeLu {
  /** Le « Total pot » du fichier — dont le SENS dépend du dialecte (cf. `EquationDuPot`). */
  potTotal?: number;
  /** Le rake se LIT, il ne se calcule pas. `0` est une valeur (« No rake », « Rake €0.00 »). */
  rake?: number;
  /** Ce que chaque gagnant est annoncé avoir empoché. */
  gains: { nom: string; montant: number }[];
  /**
   * La mise NON SUIVIE, quand le fichier l'écrit (`Uncalled bet ($149) returned to X`).
   *
   * Ni Winamax ni Betclic ne l'écrivent — elle se DÉRIVE (cf. `miseNonSuivie`). Mais la famille
   * PokerStars, si : c'est alors un témoin GRATUIT sur la seule quantité que le pipeline calcule
   * sans avoir rien à comparer. Absent = à dériver, comme avant.
   */
  nonSuiviAnnonce?: number;
}

/**
 * « TOTAL POT » N'A PAS LE MÊME SENS D'UN SITE À L'AUTRE — mesuré, et c'est décisif : un contrôle
 * partagé aurait été silencieusement faux sur l'un des deux.
 *   • Winamax : Σ des contributions − rake. La mise NON SUIVIE reste dedans (elle est rendue à
 *     l'intérieur du « collected »). 115,66 − 1,43 = 114,23 ✓
 *   • Betclic : Σ − mise non suivie − rake. 210 − 75 − 2,50 = 132,50 ✓
 */
export type EquationDuPot =
  | 'somme-moins-rake'
  | 'somme-moins-non-suivi-moins-rake'
  /**
   * ON NE SAIT PAS LAQUELLE — le cas de la grammaire générique, sur une salle jamais mesurée.
   * Le contrôle nº 6 accepte alors l'une OU l'autre, et dit laquelle a répondu.
   *
   * ⚠️ C'EST UN AFFAIBLISSEMENT ASSUMÉ, et il est petit : sur les vraies mains mesurées, deux
   * lectures différentes des montants donnaient DÉJÀ le même pot (le non suivi absorbait l'écart)
   * — c'est le contrôle nº 5, la clôture des tours, qui les séparait. Le pot n'a jamais été le
   * contrôle porteur. Refuser une lecture JUSTE parce qu'on a deviné la mauvaise convention
   * coûterait plus cher que cette tolérance.
   */
  | 'inconnue';

/**
 * Chaque dialecte offre un témoin GRATUIT sur le placement des positions, mais un différent.
 *   • `ordre-de-parole` (Betclic) : le bloc des sièges est écrit dans l'ordre de parole préflop,
 *     pas dans l'ordre des numéros. Vérifié sur les 3 mains Betclic du corpus.
 *   • `blindes-nommees` (Winamax) : le résumé annote les blindes (`Seat 3: X (small blind)`).
 * C'est une contre-épreuve sur la lecture du BOUTON, la seule donnée dont tout le placement
 * dépend et qui n'a aucune autre source.
 */
export type TemoinPositions =
  | { genre: 'ordre-de-parole' }
  | { genre: 'blindes-nommees'; sb?: string; bb?: string };

/** Un dialecte : une signature de notation, une découpe, une lecture. ~60 lignes utiles. */
export interface Dialecte {
  id: string;
  /**
   * ⚠️ UN SITE = PLUSIEURS NOTATIONS, et un dialecte se reconnaît à sa NOTATION, pas au nom du
   * site. Winamax en a deux (l'export « partager la main » en BBCode et l'autre), qui diffèrent
   * sur la place des cartes du héros et sur le balisage des streets. La reconnaissance doit donc
   * porter sur une signature de FORME, jamais sur « Winamax » trouvé quelque part.
   */
  reconnait(texte: string): boolean;
  /** Découpe un texte en mains, dans l'ordre. Une seule main = un seul élément. */
  decoupe(texte: string): string[];
  lit(texte: string): MainLue;
}

// ─── Lecture des cartes ────────────────────────────────────────────────────────────────────────

const RANGS = '23456789TJQKA';
const COULEURS = 'CDHS';

/**
 * UN SEUL LECTEUR DE CARTE POUR TOUS LES DIALECTES, et c'est un cadeau de la notation :
 * les rangs {2..9,T,J,Q,K,A} et les couleurs {C,D,H,S} sont des alphabets DISJOINTS. Un jeton de
 * deux caractères se lit donc dans n'importe quel ordre sans jamais devenir ambigu — `AS` (Winamax)
 * et `SA` (Betclic) désignent tous deux l'as de pique, et aucun couple ne peut se lire en deux
 * cartes différentes.
 *
 * Reste à normaliser la CASSE : Winamax écrit la couleur en majuscule dans sa notation BBCode
 * (`[AS]`) et en minuscule dans l'autre (`[Ah As]`), parfois dans la même main.
 *
 * Le Dix s'écrit `T` partout où on l'a mesuré ; `10` est accepté par prudence — deux chiffres ne
 * peuvent désigner que lui, donc l'accepter ne peut rien confondre.
 */
export function lireCarte(jeton: string): Card | null {
  const t = jeton.trim().toUpperCase().replace('10', 'T');
  if (t.length !== 2) return null;
  const [a, b] = [t[0], t[1]];
  if (RANGS.includes(a) && COULEURS.includes(b)) {
    return { rank: a as Rank, suit: b.toLowerCase() as Suit };
  }
  if (COULEURS.includes(a) && RANGS.includes(b)) {
    return { rank: b as Rank, suit: a.toLowerCase() as Suit };
  }
  return null;
}

/** Toutes les cartes d'un contenu de crochets (`[6c 2d Qh]`, `[AS]`), dans l'ordre. */
export function lireCartes(contenu: string): Card[] {
  const cartes: Card[] = [];
  for (const jeton of contenu.split(/[\s,]+/)) {
    if (!jeton) continue;
    const carte = lireCarte(jeton);
    if (carte) cartes.push(carte);
  }
  return cartes;
}

/** Le contenu de CHAQUE groupe de crochets d'une ligne, dans l'ordre. */
export function crochets(ligne: string): string[] {
  return [...ligne.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]);
}

/**
 * LES CARTES NEUVES D'UNE LIGNE DE STREET : les `combien` DERNIÈRES de la ligne.
 *
 * ⚠️ CE N'EST PAS « LE DERNIER CROCHET », comme on l'avait d'abord écrit. Winamax répète le board
 * cumulativement (`*** TURN *** [6c 2d Qh][4s]`) et Betclic n'écrit que la carte neuve
 * (`*** TURN *** [D2]`) — mais la notation BBCode de Winamax met UN CROCHET PAR CARTE, et le
 * dernier crochet du flop n'y donnerait qu'une carte sur trois.
 *
 * Prendre les N dernières CARTES couvre les trois notations mesurées d'un seul coup, et c'est la
 * règle la plus courte qui le fasse.
 *
 * ⚠️ ET ELLE NE LIT QU'UNE SEULE LIGNE — celle du marqueur (cf. `Blocs.apresMarqueur`). Appliquée
 * au bloc entier, elle attrapait les cartes MONTRÉES à l'intérieur de la street : mesuré sur une
 * vraie main GGPoker, qui retourne les mains dès le tapis, le flop devenait les cartes des deux
 * joueurs. Une ligne sans assez de cartes est un REFUS : mieux vaut ça qu'un board deviné.
 */
export function cartesNeuves(ligne: string, combien: number, quoi: string): Card[] {
  const toutes = crochets(ligne).flatMap((c) => lireCartes(c));
  if (toutes.length < combien) {
    refuser('ligne-incomprise', `${quoi} : ${toutes.length} carte(s) lue(s), ${combien} attendue(s)`);
  }
  return toutes.slice(toutes.length - combien);
}

// ─── Lecture des montants ──────────────────────────────────────────────────────────────────────

/**
 * Un montant écrit dans une hand history, quelle que soit sa décoration : `€1,330.78`, `0.50€`,
 * `80213`, `202.75`.
 *
 * ⚠️ LA VIRGULE EST UN SÉPARATEUR DE MILLIERS ICI, PAS UNE DÉCIMALE. Betclic écrit
 * `€1,330.78` — un tapis de mille trois cent trente euros. C'est l'inverse de la convention du
 * champ « buy-in » de Pokza, où `1,500` est refusé faute de pouvoir trancher (cf.
 * `normaliserBuyIn`) : ici le point décimal est présent dans la même chaîne, ce qui lève
 * l'ambiguïté, et une hand history est écrite par une machine anglophone, pas par un joueur.
 *
 * Renvoie `null` sur tout ce qui n'est pas un nombre entier ou à décimales — mieux vaut un refus
 * qu'un montant faux d'un facteur mille.
 */
export function lireMontant(texte: string): number | null {
  const nu = texte.replace(/[^\d.,]/g, '');
  if (!nu) return null;
  const sansMilliers = nu.replace(/,(?=\d{3}(\D|$))/g, '');
  if (!/^\d+(\.\d+)?$/.test(sansMilliers)) return null;
  const n = parseFloat(sansMilliers);
  return Number.isFinite(n) ? n : null;
}

/**
 * LE PREMIER MONTANT D'UNE PARENTHÈSE QUI EN CONTIENT DEUX — sans casser le séparateur de milliers.
 *
 * ⚠️ CE CORRECTIF PAIE UN BUG SILENCIEUX (mesuré le 05/09/2026 sur de vraies mains Full Tilt).
 * Une parenthèse de siège peut porter DEUX faits séparés par une virgule :
 *     `Seat 1: X (1500 in chips, $2.50 bounty)`      ← la prime ne nous concerne pas
 *     `Seat 3: Y (80213, 61.87€ bounty)`             ← idem, chez Winamax
 * D'où un `split(',')` dans les deux dialectes… qui coupait AUSSI les milliers :
 *     `Seat 1: jobetzu ($1,020)`  →  tapis lu : **1**
 * Un tapis de mille vingt dollars devenait un dollar. Aucune main fausse n'a pu être publiée — le
 * contrôle nº 4 voyait bien « BTN engage 5 pour un tapis de 1 » — mais toute main à tapis de
 * quatre chiffres était PERDUE, en silence, et le refus accusait la mauvaise cause.
 *
 * La règle est l'exacte inverse de celle de `lireMontant` : on ne coupe QUE sur une virgule qui
 * n'est pas un séparateur de milliers, c'est-à-dire qui n'est pas suivie de trois chiffres suivis
 * de la fin du groupe. Les deux tournures mesurées gardent donc leur sens, et `$1,151.70` reste
 * mille cent cinquante et un.
 */
export function premierMontantDeLaParenthese(contenu: string): string {
  return contenu.split(/,(?!\d{3}(?:\D|$))/)[0];
}

// ─── Refus ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Ce qui fait qu'une main N'EST PAS importable. Un code par cause, pour que l'écran (lot 2) puisse
 * dire quoi faire plutôt que « échec ».
 *
 * ⚠️ REFUSER EST UN SUCCÈS, PAS UN ÉCHEC. C'est ce qui autorise à tenter une lecture sur un
 * format jamais vu : une lecture fausse est DÉTECTÉE et jamais publiée. La couverture devient une
 * propriété par MAIN, pas par site.
 */
export const CODES_DE_REFUS = [
  'format-inconnu',
  'plusieurs-mains',
  'texte-vide',
  'variante-non-prise-en-charge',
  'trop-de-joueurs',
  'pas-assez-de-joueurs',
  'bouton-introuvable',
  'hero-introuvable',
  'joueur-inconnu',
  'noms-en-double',
  'mise-forcee-inconnue',
  'ligne-incomprise',
  'sans-petite-blinde',
  'controle-echoue',
  'fichier-trop-gros',
  'main-avec-cashout',
] as const;

/** Une LISTE, pas seulement une union de types : `Record<CodeDeRefus, string>` force alors le
 *  compilateur à exiger un libellé pour chaque code (cf. `messages.ts`), et un test peut la
 *  parcourir pour vérifier qu'aucun ne retombe sur la phrase de secours. Un code ajouté sans son
 *  libellé est exactement le genre d'oubli qui ne se voit qu'en production. */
export type CodeDeRefus = (typeof CODES_DE_REFUS)[number];

export class ErreurDeLecture extends Error {
  constructor(readonly code: CodeDeRefus, message: string) {
    super(message);
    this.name = 'ErreurDeLecture';
  }
}

export function refuser(code: CodeDeRefus, message: string): never {
  throw new ErreurDeLecture(code, message);
}
