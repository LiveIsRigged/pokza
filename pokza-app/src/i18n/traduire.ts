import fr from './catalogues/fr.json';
import en from './catalogues/en.json';
import { estLangueServie, LANGUE_REPLI, LANGUE_SOURCE, type Langue } from './langues';

/**
 * Le cœur de la traduction, SANS React ni rien de natif : un dictionnaire, une interpolation et
 * `Intl.PluralRules` — qui EST l'implémentation correcte des pluriels, pas une approximation.
 * Isolé ici pour être exécutable tel quel sous Node (cf. `scripts/test-i18n.js`), comme
 * `lectureVisibilite.ts` l'est vis-à-vis de `readTracking.ts`. La couche React est dans `index.tsx`.
 *
 * Deux protections sont gratuites, à la compilation :
 *   - `en` est typé COMPLET : oublier l'anglais d'une clé casse `tsc`. L'anglais est le repli de
 *     tous ceux dont la langue n'existe pas encore, il ne peut donc jamais avoir de trou ;
 *   - une clé absente de `fr` est une erreur de type partout où elle est appelée.
 * Reste le seul cas que le type ne voit pas — retoucher un mot français sans retoucher sa
 * traduction : c'est `scripts/i18n-audit.js` qui l'attrape, en comparant `fr.json` aux empreintes.
 */

export type Cle = keyof typeof fr;

/** Une entrée de catalogue : un texte, ou ses formes plurielles. `other` sert de repli de forme. */
type Pluriel = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Message = string | Pluriel;

export type Variables = Record<string, string | number>;

/**
 * L'anglais est exhaustif (`Record`), les langues suivantes ne le seront pas forcément
 * (`Partial`) : une clé qui manque retombe sur l'anglais plutôt que d'afficher un trou.
 */
const CATALOGUES: { fr: Record<Cle, Message>; en: Record<Cle, Message> } = { fr, en };

/**
 * Langue effective, tenue hors de React : `handEngine`, `relativeDate` ou `errorMessage` produisent
 * du texte sans être des composants, et doivent pouvoir traduire aussi.
 */
let langueActive: Langue = LANGUE_SOURCE;

export function poserLangue(langue: Langue): void {
  langueActive = langue;
}

export function langueCourante(): Langue {
  return langueActive;
}

const plurielsParLangue = new Map<Langue, Intl.PluralRules>();

export function categorie(langue: Langue, nombre: number): Intl.LDMLPluralRule {
  let regles = plurielsParLangue.get(langue);
  if (!regles) {
    try {
      regles = new Intl.PluralRules(langue);
    } catch {
      // Hermes peut être compilé sans ICU (Android). Repli anglais/français : 1 au singulier.
      return nombre === 1 ? 'one' : 'other';
    }
    plurielsParLangue.set(langue, regles);
  }
  return regles.select(nombre) as Intl.LDMLPluralRule;
}

export function interpoler(texte: string, variables: Variables | undefined): string {
  if (!variables) return texte;
  // Un `{nom}` sans variable correspondante est laissé TEL QUEL : mieux vaut voir l'accolade que
  // « undefined » ou un trou muet dans la phrase.
  return texte.replace(/\{(\w+)\}/g, (brut, nom: string) =>
    nom in variables ? String(variables[nom]) : brut
  );
}

/**
 * Rend un message : choisit la forme plurielle s'il y en a, puis remplace les `{variables}`. Séparé
 * de `t` pour être éprouvable sur des messages fabriqués, sans devoir polluer le catalogue de clés
 * de test — le catalogue ne contient que des textes réellement affichés.
 */
export function rendre(message: Message, langue: Langue, variables?: Variables): string {
  if (typeof message === 'string') return interpoler(message, variables);
  const nombre = typeof variables?.count === 'number' ? variables.count : 0;
  // `other` en dernier recours : une langue peut réclamer une catégorie (`few`, `many`) que le
  // traducteur n'a pas remplie. Mieux vaut la forme générique qu'une phrase vide.
  const forme = message[categorie(langue, nombre)] ?? message.other;
  return interpoler(forme, variables);
}

/**
 * Traduit `cle` dans la langue active. Utilisable partout, y compris hors composant — mais dans un
 * composant, préférer `useT()` : c'est lui qui provoque le rendu quand la langue change.
 */
export function t(cle: Cle, variables?: Variables): string {
  const message =
    CATALOGUES[langueActive]?.[cle] ?? CATALOGUES[LANGUE_REPLI][cle] ?? CATALOGUES[LANGUE_SOURCE][cle];
  if (message === undefined) return cle; // ne devrait pas arriver : le type l'interdit
  return rendre(message, langueActive, variables);
}

/** Un morceau de gabarit : du texte brut, ou un repère nommé à remplacer par autre chose. */
export type Segment = { texte: string } | { repere: string };

/**
 * Découpe « Je certifie … j'accepte les {cgu} et la {confidentialite}. » en morceaux.
 *
 * Sert aux phrases dont un bout n'est pas du texte : un mot en couleur, un lien qui ouvre les CGU.
 * Le réflexe — couper la phrase en trois clés et recoller — ne survit pas à la traduction : l'ordre
 * des mots change d'une langue à l'autre, et « et la » tout seul dans une liste ne veut rien dire
 * pour un traducteur. La phrase reste donc ENTIÈRE, avec des repères que le traducteur déplace.
 *
 * Pur exprès (pas de React ici) : c'est `noeuds.tsx` qui transforme les segments en éléments.
 */
export function segmenter(gabarit: string): Segment[] {
  const sortie: Segment[] = [];
  let reste = gabarit;
  for (;;) {
    const trouve = /\{(\w+)\}/.exec(reste);
    if (!trouve) break;
    if (trouve.index > 0) sortie.push({ texte: reste.slice(0, trouve.index) });
    sortie.push({ repere: trouve[1] });
    reste = reste.slice(trouve.index + trouve[0].length);
  }
  if (reste.length > 0) sortie.push({ texte: reste });
  return sortie;
}

/**
 * Première langue préférée de l'appareil que nous servons réellement.
 *
 * `preferees` arrive DANS L'ORDRE DE PRÉFÉRENCE de l'utilisateur (ce que rend `getLocales()`). On
 * prend la première que nous servons plutôt que seulement la première tout court : un Suisse réglé
 * sur [de, fr] reçoit alors du français au lieu de l'anglais, ce qui est strictement mieux pour lui.
 * Si aucune n'est servie, anglais (décision du 10/09/2026).
 */
export function choisirLangue(preferees: readonly (string | null | undefined)[]): Langue {
  for (const code of preferees) {
    if (estLangueServie(code)) return code;
  }
  return LANGUE_REPLI;
}
