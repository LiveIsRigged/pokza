import fr from './catalogues/fr.json';
import en from './catalogues/en.json';
import de from './catalogues/de.json';
import es from './catalogues/es.json';
import it from './catalogues/it.json';
import pt from './catalogues/pt.json';
import nl from './catalogues/nl.json';
import el from './catalogues/el.json';
import hu from './catalogues/hu.json';
import sv from './catalogues/sv.json';
import fi from './catalogues/fi.json';
import nb from './catalogues/nb.json';
import da from './catalogues/da.json';
import ru from './catalogues/ru.json';
import pl from './catalogues/pl.json';
import uk from './catalogues/uk.json';
import bg from './catalogues/bg.json';
import ro from './catalogues/ro.json';
import cs from './catalogues/cs.json';
import zhHant from './catalogues/zh-Hant.json';
import sk from './catalogues/sk.json';
import ko from './catalogues/ko.json';
import ja from './catalogues/ja.json';
import th from './catalogues/th.json';
import vi from './catalogues/vi.json';
import tr from './catalogues/tr.json';
import { estLangueServie, LANGUE_REPLI, LANGUE_SOURCE, resoudreLangue, type Langue } from './langues';

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
const CATALOGUES: {
  fr: Record<Cle, Message>;
  en: Record<Cle, Message>;
  de: Partial<Record<Cle, Message>>;
  es: Partial<Record<Cle, Message>>;
  it: Partial<Record<Cle, Message>>;
  pt: Partial<Record<Cle, Message>>;
  nl: Partial<Record<Cle, Message>>;
  el: Partial<Record<Cle, Message>>;
  hu: Partial<Record<Cle, Message>>;
  sv: Partial<Record<Cle, Message>>;
  fi: Partial<Record<Cle, Message>>;
  nb: Partial<Record<Cle, Message>>;
  da: Partial<Record<Cle, Message>>;
  ru: Partial<Record<Cle, Message>>;
  pl: Partial<Record<Cle, Message>>;
  uk: Partial<Record<Cle, Message>>;
  bg: Partial<Record<Cle, Message>>;
  ro: Partial<Record<Cle, Message>>;
  cs: Partial<Record<Cle, Message>>;
  'zh-Hant': Partial<Record<Cle, Message>>;
  sk: Partial<Record<Cle, Message>>;
  ko: Partial<Record<Cle, Message>>;
  ja: Partial<Record<Cle, Message>>;
  th: Partial<Record<Cle, Message>>;
  vi: Partial<Record<Cle, Message>>;
  tr: Partial<Record<Cle, Message>>;
} = { fr, en, de, es, it, pt, nl, el, hu, sv, fi, nb, da, ru, pl, uk, bg, ro, cs, 'zh-Hant': zhHant, sk, ko, ja, th, vi, tr };

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
 * Codes qui DÉSIGNENT LA MÊME LANGUE qu'un code servi, sans lui être égaux — un étage au-dessus du
 * repli « de-AT » → « de », qui ne traite que les variantes régionales.
 *
 * LE NORVÉGIEN EN EST LA RAISON, et c'est mesuré, pas supposé : « nb » (bokmål) et « no » (la
 * macrolangue) nomment le même norvégien écrit, et les plateformes ne s'accordent pas — iOS rend
 * « nb-NO », Android « nb », certains navigateurs « no ». Servir l'un sans l'autre renvoie donc une
 * partie des Norvégiens sur l'anglais, sans qu'ils puissent deviner que leur langue existe. C'est
 * exactement le défaut que le repli régional évite déjà, à un niveau que `split('-')` ne voit pas.
 *
 * Pokza sert « nb » : c'est du bokmål qui est écrit dans le catalogue, et c'est aussi le nom que
 * reçoit le modèle de traduction de contenu (« Norwegian Bokmål » plutôt que « Norwegian »), donc
 * une consigne plus précise. La table rend « no » et « nn » sans qu'on ait à le redire ailleurs.
 *
 * ⚠️ « nn » (nynorsk) y est un ARBITRAGE, pas une équivalence : c'est une autre norme écrite, pas
 * une variante régionale. Du bokmål vaut mieux que de l'anglais pour qui écrit le nynorsk — les
 * deux se lisent sans effort en Norvège — mais ce n'est pas du même ordre que les deux lignes
 * au-dessus. Le jour où Pokza servirait le nynorsk, `estLangueServie('nn')` répondrait vrai avant
 * d'arriver ici et la ligne deviendrait morte d'elle-même.
 *
 * Les autres doublons connus (« he »/« iw », « id »/« in », « zh »/« cmn ») n'y sont pas : on
 * n'ajoute une ligne que pour une langue qu'on sert, sinon la table décrit un monde imaginaire.
 */
const EQUIVALENTS: Record<string, readonly string[]> = {
  nb: ['no'],
  no: ['nb'],
  nn: ['nb', 'no'],
  // Même nature d'arbitrage que le nynorsk : deux écritures du chinois, pas deux dialectes. Qui lit
  // le simplifié déchiffre le traditionnel avec un effort — moins d'effort que l'anglais. Le jour où
  // Pokza servira `zh-Hans`, la correspondance exacte jouera avant d'arriver ici.
  'zh-hans': ['zh-Hant'],
  'zh-hant': ['zh-Hans'],
};

/**
 * « zh-Hant-TW » → [« zh-Hant-TW », « zh-Hant », « zh »] : la recherche par TRONCATURE de RFC 4647.
 * `split('-')[0]` ne gardait que le premier morceau, et jetait donc l'écriture avec la région.
 */
function troncatures(code: string): string[] {
  const parts = code.split('-');
  return parts.map((_, i) => parts.slice(0, parts.length - i).join('-'));
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
    if (typeof code !== 'string' || code === '') continue;

    // ⚠️ « de-AT » EST DE L'ALLEMAND. `getLocales()` rend en principe le code nu (« de »), mais rien
    // ne le garantit sur toutes les plateformes, et le jour où on servira une variante régionale
    // (« pt-BR ») les deux formes coexisteront. Un Autrichien basculé sur l'anglais faute d'un
    // tiret serait un défaut invisible : il n'aurait aucun moyen de savoir que l'allemand existe.
    // La correspondance EXACTE est la première troncature : pas de chemin rapide à tenir en double.

    const candidats = troncatures(code);
    // ⚠️ « zh-TW » NE CONTIENT PAS L'ÉCRITURE, et c'est CLDR qui sait que Taïwan écrit en
    // traditionnel et la Chine en simplifié. `maximize()` ajoute ces sous-étiquettes probables :
    // « zh-TW » → « zh-Hant-TW », « zh-HK » → « zh-Hant-HK », « zh-CN » → « zh-Hans-CN ». Aucune
    // liste à tenir à la main, donc rien à oublier le jour d'une écriture de plus.
    try {
      for (const t of troncatures(new Intl.Locale(code).maximize().toString())) {
        if (!candidats.includes(t)) candidats.push(t);
      }
    } catch {
      // `Intl.Locale` peut manquer (Hermes sans ICU, cf. `categorie`) ou le code être malformé. Les
      // troncatures seules suffisent dès que la plateforme rend déjà l'écriture (« zh-Hant-TW »),
      // ce que fait iOS ; on perd seulement le cas « zh-TW » nu.
    }

    for (const candidat of candidats) {
      const servie = resoudreLangue(candidat);
      if (servie !== null) return servie;
    }
    // …et l'étage au-dessus : les codes qui ne sont ni des variantes ni des troncatures, mais DEUX
    // NOMS DE LA MÊME LANGUE (cf. EQUIVALENTS). Dans la même préférence, avant de passer à la suivante.
    for (const candidat of candidats) {
      for (const equivalent of EQUIVALENTS[candidat.toLowerCase()] ?? []) {
        const servie = resoudreLangue(equivalent);
        if (servie !== null) return servie;
      }
    }
  }
  return LANGUE_REPLI;
}
