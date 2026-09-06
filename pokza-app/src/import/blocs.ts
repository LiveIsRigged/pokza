import { refuser } from './formeNeutre';

/**
 * LE DÉCOUPAGE EN BLOCS, PARTAGÉ PAR TOUS LES DIALECTES.
 * ════════════════════════════════════════════════════
 * Toute hand history de la famille se lit pareil : un en-tête, puis des blocs annoncés par un
 * marqueur (`*** FLOP ***`). Ce qui change d'un dialecte à l'autre, c'est la LISTE des marqueurs,
 * pas la mécanique — d'où ce module plutôt qu'une troisième copie.
 *
 * ⚠️ LES MARQUEURS SE COMPARENT SANS LEURS BLANCS. `SHOW DOWN` et `SHOWDOWN` sont le même
 * marqueur ; refuser le second pour un espace serait absurde.
 *
 * ⚠️⚠️ UN MARQUEUR INCONNU EST UN REFUS, PAS UNE LIGNE ORDINAIRE. Avalé dans le bloc courant, un
 * `*** SECOND FLOP ***` (run it twice) verrait ses cartes comptées comme celles de la street
 * précédente : le board serait faux et AUCUN CONTRÔLE NE POURRAIT S'EN APERCEVOIR. C'est le seul
 * endroit du pipeline où une mécompréhension pourrait passer les six contrôles, donc le seul
 * endroit où il faut être intransigeant.
 */
export interface Blocs {
  /** Tout ce qui précède le premier marqueur. */
  entete: string[];
  /** Un bloc par marqueur rencontré, sous son nom CANONIQUE — les lignes d'ACTION, et rien d'autre. */
  parMarqueur: Map<string, string[]>;
  /**
   * Ce qui suit le marqueur SUR SA PROPRE LIGNE (`*** FLOP *** [6c 2d Qh]`), rangé à part.
   *
   * ⚠️ À PART, ET C'EST UN BUG PAYÉ : tant que ce reste était mêlé aux lignes du bloc, lire « les
   * N dernières cartes du bloc » attrapait aussi les cartes MONTRÉES à l'intérieur de la street.
   * Mesuré sur une vraie main GGPoker, qui retourne les mains dès le tapis : le flop lu devenait
   * `Jc Ah Kc` — les cartes des deux joueurs — au lieu de `Qh 8s 2c`. Un board faux qu'aucun
   * contrôle n'aurait vu sans le témoin `Board` du résumé.
   */
  apresMarqueur: Map<string, string>;
}

/** La clef de comparaison d'un marqueur : sans blancs NI tirets. `SHOW DOWN` ≡ `SHOWDOWN`, et
 *  `PRE-FLOP` ≡ `PREFLOP` — les deux écarts qu'on a réellement vus entre notations. */
export function clefDeMarqueur(m: string): string {
  return m.replace(/[\s-]+/g, '').toUpperCase();
}

/** `['ANTE/BLINDS', 'FLOP', …]` → la table de reconnaissance, avec les alias qu'on veut bien. */
export function clefs(...noms: string[]): Map<string, string> {
  return new Map(noms.map((n) => [clefDeMarqueur(n), n]));
}

/**
 * LA FORME D'UN MARQUEUR — trois astérisques par défaut, parce que c'est la notation de la famille
 * PokerStars, dont descendent presque tous les formats texte.
 *
 * ⚠️ MAIS PAS TOUS, ET C'EST MESURÉ. La famille partypoker/888 écrit `** Dealing Flop **` à DEUX
 * astérisques, et son en-tête en met CINQ (`***** Hand History for Game 13550695573 *****`). D'où
 * `MARQUEUR_DEUX_ETOILES`, qui exige un BLANC de part et d'autre du nom : `^\*\*\s+` ne peut pas
 * mordre sur `*****`, dont le troisième caractère est une astérisque et non un blanc. Les deux
 * notations ne peuvent donc pas se confondre, ce qui permet de partager cette mécanique plutôt que
 * d'en écrire une troisième copie.
 */
export const MARQUEUR_TROIS_ETOILES = /^\*\*\*\s*(.+?)\s*\*\*\*(.*)$/;
export const MARQUEUR_DEUX_ETOILES = /^\*\*\s+(.+?)\s+\*\*(.*)$/;

export function decouperEnBlocs(
  lignes: string[],
  reconnus: Map<string, string>,
  forme: RegExp = MARQUEUR_TROIS_ETOILES
): Blocs {
  const entete: string[] = [];
  const parMarqueur = new Map<string, string[]>();
  const apresMarqueur = new Map<string, string>();
  let courant: string[] | null = null;

  for (const brute of lignes) {
    const ligne = brute.trimEnd();
    const m = ligne.match(forme);
    if (!m) {
      (courant ?? entete).push(ligne);
      continue;
    }
    const canonique = reconnus.get(clefDeMarqueur(m[1]));
    if (!canonique) refuser('ligne-incomprise', `marqueur inconnu : « ${ligne.trim()} »`);
    courant = parMarqueur.get(canonique!) ?? [];
    parMarqueur.set(canonique!, courant);
    // Les cartes de la street vivent SUR la ligne du marqueur : rangées à part (cf. `apresMarqueur`).
    if (m[2].trim()) apresMarqueur.set(canonique!, m[2].trim());
  }
  return { entete, parMarqueur, apresMarqueur };
}
