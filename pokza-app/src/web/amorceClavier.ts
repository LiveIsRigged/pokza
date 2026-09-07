import { Platform } from 'react-native';

/**
 * OUVRIR LE CLAVIER PENDANT LE GESTE, POUR UN CHAMP QUI N'EXISTE PAS ENCORE.
 * ────────────────────────────────────────────────────────────────────────
 * Demandé par Victor le 07/09/2026 : « on clique sur la loupe et ça ouvre le clavier
 * automatiquement ». Ça paraît anodin, ça ne l'est pas.
 *
 * ⚠️ LA RÈGLE D'iOS : le clavier ne s'ouvre que si `.focus()` part **pendant** le geste de
 * l'utilisateur, dans la même pile d'appels. Or le champ de recherche n'existe pas à ce
 * moment-là — le `Popover` ne monte ses enfants qu'à l'ouverture. Un `autoFocus` arrive donc trop
 * tard : il prend le focus, iOS refuse le clavier, et `AjusteurHauteur` réserve la place d'un
 * clavier qui ne vient pas (c'est la bande blanche qu'on vient de retirer).
 *
 * LE CONTOURNEMENT, ET SON PRIX : on focalise pendant le geste un champ MINUSCULE qui, lui, est
 * déjà dans la page. Le clavier s'ouvre. Le vrai champ prend ensuite le relais, et iOS garde le
 * clavier tant que le focus passe d'un champ à l'autre sans trou.
 *
 * ⚠️ SI L'AMORCE ÉCHOUE, LA BANDE BLANCHE REVIENT — c'est le risque assumé, et Victor l'a tranché :
 * « si ce n'est pas possible sans la bande blanche, la solution actuelle est mieux que rien ». À
 * retirer d'un bloc si l'essai n'est pas concluant.
 *
 * ⚠️ CE QUE L'AMORCE NE DOIT PAS ÊTRE : ni `display:none`, ni `visibility:hidden`, ni de taille
 * nulle — iOS refuse de focaliser ce qui n'est pas rendu. Elle est donc RÉELLEMENT posée, d'un
 * pixel et transparente. Et à 16px, sinon Safari zoome (cf. la note de `typography` dans le thème).
 */

const ID = 'pokza-amorce-clavier';

/** Combien de temps une amorce reste valable. Au-delà, on considère que le geste est passé et
 *  qu'un focus ne serait plus rattaché à lui — donc qu'il ne faut plus rien tenter. */
const VALIDITE_MS = 1500;

let amorceA = 0;

function element(): HTMLInputElement | null {
  if (typeof document === 'undefined') return null;
  const existant = document.getElementById(ID) as HTMLInputElement | null;
  if (existant) return existant;
  const champ = document.createElement('input');
  champ.id = ID;
  champ.type = 'text';
  // Ni saisi ni lu par personne : hors du parcours au clavier et de l'arbre d'accessibilité.
  champ.setAttribute('aria-hidden', 'true');
  champ.tabIndex = -1;
  champ.setAttribute('autocomplete', 'off');
  champ.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;border:0;padding:0;'
    + 'font-size:16px;z-index:-1;pointer-events:none;';
  document.body.appendChild(champ);
  return champ;
}

/**
 * À APPELER DANS LE GESTE, ET SYNCHRONEMENT — jamais dans un `setTimeout`, jamais après un `await` :
 * le rattachement au geste serait perdu et iOS refuserait le clavier.
 */
export function amorcerClavier(): void {
  if (Platform.OS !== 'web') return;
  const champ = element();
  if (!champ) return;
  try {
    champ.focus({ preventScroll: true });
    amorceA = Date.now();
  } catch {
    amorceA = 0;
  }
}

/** Une amorce vient-elle d'avoir lieu ? Le vrai champ ne prend le relais que dans ce cas — sinon
 *  on retomberait sur le focus sans clavier, donc sur la bande blanche. */
export function amorceEnCours(): boolean {
  return Platform.OS === 'web' && Date.now() - amorceA < VALIDITE_MS;
}

/** Le relais est passé : l'amorce n'a plus lieu d'être. */
export function relacherAmorce(): void {
  amorceA = 0;
}
