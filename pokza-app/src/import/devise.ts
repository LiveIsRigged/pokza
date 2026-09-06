import { DEVISES, type CodeDevise } from '../utils/currency';

/** Les sigles les plus longs d'abord — même précaution que dans `normaliserBuyIn` : sans ça
 *  « R$ » se ferait manger par « $ », et « RM » par « R ». */
const SIGLES = [...DEVISES].sort((a, b) => b.sigle.length - a.sigle.length);

/**
 * LA DEVISE ÉCRITE DANS UN GROUPE D'ENJEUX (`0.50€/1€`, `$5/$10`, `CHF 5/CHF 10`).
 *
 * ⚠️ NE JAMAIS APPELER SUR UNE LIGNE ENTIÈRE. Trois sigles de Pokza sont des lettres latines
 * ordinaires — « R » (rand), « RM » (ringgit), « Kč » — et « Rake », « RIVER » ou « Turn »
 * contiennent la première. On ne cherche donc une devise que dans un fragment dont on sait qu'il
 * ne contient QUE des nombres et une unité : les chiffres, la ponctuation et les espaces sont
 * retirés d'abord, et ce qui reste doit être un sigle et rien d'autre.
 *
 * `undefined` quand rien n'est écrit — c'est le cas normal d'un tournoi, où les jetons sont nus.
 * On ne devine pas : l'appelant décidera (en cash, Pokza retombe sur l'euro par défaut, cf.
 * `devise`).
 */
export function deviseEcrite(enjeux: string): CodeDevise | undefined {
  const unites = enjeux.replace(/[\d\s.,/()+-]/g, '');
  if (!unites) return undefined;
  for (const d of SIGLES) {
    if (!unites.includes(d.sigle)) continue;
    // Le fragment ne doit RIEN contenir d'autre que ce sigle, répété : sinon on ne lit pas des
    // enjeux mais du texte, et deviner y serait pire que renoncer.
    if (unites.split(d.sigle).join('') === '') return d.code;
    return undefined;
  }
  return undefined;
}

/** Les codes ISO, en majuscules et sur trois lettres : le seul moyen SÛR de nommer une devise. */
const CODES = new Set(DEVISES.map((d) => d.code as string));

/**
 * LA DEVISE DÉCLARÉE EN CLAIR, quand le fichier la nomme : `($0.50/$1.00 USD)`.
 *
 * Plus fiable que le sigle, et pour deux raisons. D'abord le sigle est ambigu — « $ » couvre huit
 * devises dans la table de Pokza (cf. `DEVISES`), le code ISO en désigne une. Ensuite `deviseEcrite`
 * REFUSE un fragment qui contient autre chose qu'un sigle : `$0.50/$1.00 USD` laisse `$$USD` après
 * nettoyage, donc rien. C'est cette fonction-là qu'il faut essayer d'abord.
 *
 * Le mot doit être ISOLÉ (`\b`) : sans ça, « USD » se trouverait dans n'importe quelle chaîne de
 * lettres qui le contient.
 */
export function deviseDeclaree(texte: string): CodeDevise | undefined {
  for (const mot of texte.match(/\b[A-Z]{3}\b/g) ?? []) {
    if (CODES.has(mot)) return mot as CodeDevise;
  }
  return undefined;
}
