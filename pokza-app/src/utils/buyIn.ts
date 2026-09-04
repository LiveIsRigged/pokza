import { abbreviateChips, roundMoney } from './chipFormat';
import { DEVISES, devise, habillerMontant, type CodeDevise, type Devise } from './currency';

/**
 * LE BUY-IN, ÉCRIT UNE BONNE FOIS À LA SAISIE.
 * ───────────────────────────────────────────
 * « 45+5€ » devient « 50€ » au moment où l'auteur quitte le champ, pas au moment de l'affichage.
 * Même mécanique que la réécriture des jetons en « 30k » (cf. `formatChipInput`), et pour les mêmes
 * trois raisons : l'auteur VOIT ce qui sera publié avant de publier, la valeur stockée est déjà
 * propre, et l'affichage n'a aucun texte à analyser. L'import de hand histories passe par ici aussi,
 * ce qui garantit qu'une main collée et une main saisie s'écrivent pareil.
 *
 * ⚠️ ON NE SOMME QUE CE QU'ON COMPREND ENTIÈREMENT. Tout ce qui n'est pas exclusivement des nombres,
 * des « + » et au plus un sigle de devise revient INCHANGÉ : « Freeroll », « 45$+5$ KO », « 1,500 »
 * (ambigu — milliers ou décimales ?). Un auteur doit pouvoir écrire ce qu'il veut dans ce champ et
 * le retrouver tel quel ; deviner la moitié d'une saisie serait pire que ne rien deviner.
 *
 * Additionner est bien le bon geste, y compris sur un tournoi à prime : « 10+1+1 » (cave + prime +
 * droit d'entrée) coûte réellement 12 au joueur, et c'est ce prix-là qui parle au lecteur.
 */

/** Les sigles les plus longs d'abord : sans ça « R$ » se ferait manger par « $ », et « RM » par « R ». */
const SIGLES: Devise[] = [...DEVISES].sort((a, b) => b.sigle.length - a.sigle.length);

/** Un morceau de somme : des chiffres, et au plus deux décimales derrière une virgule ou un point.
 *  Trois décimales ou plus (« 1,500 ») sont refusées EXPRÈS — impossible de trancher entre un
 *  séparateur de milliers et une écriture décimale, et se tromper d'un facteur mille sur un prix
 *  est la pire erreur possible ici. */
const MORCEAU = /^\d+([.,]\d{1,2})?$/;

/**
 * @param saisi   ce que l'auteur a tapé (ou ce que la hand history annonce)
 * @param codeDevise devise à poser quand la saisie n'en porte AUCUNE — celle du contexte, qui se
 *   retient d'une main à l'autre. Un sigle écrit à la main gagne toujours sur celui-ci : il a été
 *   tapé exprès.
 */
export function normaliserBuyIn(saisi: string, codeDevise?: CodeDevise): string {
  const texte = saisi.trim();
  if (!texte) return '';

  // Le sigle est retiré AVANT l'examen, sinon toute devise écrite en lettres (« CHF », « zł »,
  // « Kč ») ferait échouer le test « rien que des nombres » et ne serait jamais sommée. Toutes les
  // occurrences du même sigle partent ensemble : « €4.65 + €0.35 » est la forme que produit une
  // hand history Betclic, et c'est exactement un cas à sommer.
  let reste = texte;
  let ecrite: Devise | undefined;
  for (const d of SIGLES) {
    if (!reste.includes(d.sigle)) continue;
    ecrite = d;
    reste = reste.split(d.sigle).join('');
    break;
  }

  // Un second sigle, d'une AUTRE devise, survit ici et fait échouer le test ci-dessous : « 45€+5$ »
  // revient donc tel quel. C'est voulu — on ne saurait pas en quelle monnaie écrire la somme.
  if (!/^[\d\s+.,]+$/.test(reste)) return texte;

  const morceaux = reste.split('+').map((m) => m.trim()).filter((m) => m !== '');
  if (morceaux.length === 0) return texte;

  let total = 0;
  for (const morceau of morceaux) {
    if (!MORCEAU.test(morceau)) return texte;
    total += parseFloat(morceau.replace(',', '.'));
  }

  const d = ecrite ?? devise(codeDevise);
  const montant = roundMoney(total);
  return habillerMontant(d.abrege ? abbreviateChips(montant) : String(montant), d);
}
