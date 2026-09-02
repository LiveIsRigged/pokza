/**
 * L'APP TIENT DANS LA BANDE RÉELLEMENT VISIBLE
 * ────────────────────────────────────────────
 * Signalé par Victor le 02/09/2026 : ouvrir « Relancer » fait remonter tout l'écran pour laisser
 * la place au clavier, et on perd de vue ce qu'on était en train de faire. Le même défaut existe
 * partout où l'on saisit quelque chose — 21 écrans et 5 feuilles ont un champ.
 *
 * CE QUI SE PASSE VRAIMENT (mesuré le 02/09/2026, iPhone de Victor)
 *   Le clavier iOS ne rétrécit PAS la fenêtre de MISE EN PAGE : `window.innerHeight` reste à 932 px,
 *   clavier ouvert comme fermé. Il ne rétrécit que la fenêtre VISIBLE — `visualViewport.height`
 *   tombe à 569 px. Avec `html, body, #root { height: 100% }`, l'app fait donc 932 px de haut dans
 *   une bande de 569 px : 363 px d'app existent SOUS le bord de l'écran. Safari fait alors glisser
 *   la page entière vers le bas pour révéler le champ focalisé.
 *
 *   Une première tentative a consisté à remonter le champ au-dessus des raccourcis, en croyant que
 *   Safari ne glissait que « juste assez ». La capture d'écran de Victor après déploiement l'a
 *   démentie : la page glissait pareil. Ce n'est pas la position du champ qui déclenche, c'est le
 *   simple fait qu'il existe de l'app hors de la bande visible.
 *
 * LE CORRECTIF
 *   Faire tenir la racine dans la bande visible. Plus rien n'existe sous le bord, Safari n'a plus
 *   rien à révéler, et il ne glisse pas. On pose `--hauteur-app` sur `<html>` ; les trois règles de
 *   `public/index.html` la lisent avec `100%` en repli, donc sans la variable le comportement est
 *   exactement celui d'avant.
 *
 * POURQUOI CE FICHIER NE MESURE RIEN POUR SAVOIR SI LE CLAVIER EST LÀ
 *   `clavier.ts` pose une règle : on détecte le clavier par le focus, jamais par la taille du
 *   viewport, « notoirement instable sur Safari iOS ». Elle tient toujours. Ici la mesure ne sert
 *   qu'à DIMENSIONNER, une fois qu'un champ focalisé a dit qu'un clavier arrivait. Le retrait sert
 *   seulement de garde-fou : il écarte ce qui n'est pas un clavier.
 */

/**
 * En dessous de ce retrait (mise en page − visible), ce n'est pas un clavier.
 *   • barre d'adresse Safari (onglet, pas PWA), qui va et vient au défilement : 50 à 80 px ;
 *   • barre de suggestions d'un clavier matériel sur iPad : ~55 px ;
 *   • le plus petit clavier iOS (iPhone SE, portrait) : 216 px, barre d'outils en plus.
 * 120 px sépare franchement les deux familles. Conséquence heureuse : sur un ordinateur, et sur
 * les navigateurs Android qui rétrécissent la fenêtre de mise en page (le retrait y vaut alors 0),
 * on ne s'engage jamais — ces plateformes n'ont pas le défaut, on ne leur touche pas.
 */
export const RETRAIT_MINIMUM = 120;

/**
 * Page zoomée : `visualViewport.height` devient la hauteur de la LOUPE, pas celle de l'écran.
 * S'y caler écraserait l'app. On lâche tout, et on retombe sur le comportement d'avant.
 * (Dans la PWA, iOS interdit le zoom : `echelle` y vaut toujours 1. Le cas ne se rencontre qu'en
 * onglet, où Safari zoome tout seul sur un champ dont la fonte fait moins de 16 px.)
 */
export const ECHELLE_MAX = 1.05;

export type EtatViewport = {
  /** `visualViewport.height` — la bande réellement visible. */
  hauteurVisible: number;
  /** `window.innerHeight` — la fenêtre de mise en page, que le clavier iOS ne touche pas. */
  hauteurMiseEnPage: number;
  /** `visualViewport.scale` — 1 tant que la page n'est pas zoomée. */
  echelle: number;
  /** Un champ de saisie a le focus, au sens de `clavier.ts`. */
  champFocalise: boolean;
};

/**
 * Quelle hauteur poser sur la racine ? `null` = aucune, on rend la main à `100%`.
 *
 * `engage` dit si l'on avait déjà pris la main. Il sert à la SORTIE : quand le champ perd le focus,
 * le clavier met encore ~250 ms à redescendre. Rendre la hauteur tout de suite rendrait l'app
 * haute de 932 px dans une bande encore réduite — c'est-à-dire le défaut qu'on corrige, le temps
 * de l'animation. Tant qu'on est engagé, on accompagne donc le clavier qui s'en va, et on ne rend
 * la main qu'une fois le retrait retombé sous le seuil.
 */
export function hauteurAAppliquer(etat: EtatViewport, engage: boolean): number | null {
  const { hauteurVisible, hauteurMiseEnPage, echelle, champFocalise } = etat;
  // `!(x > 0)` et non `x <= 0` : attrape aussi NaN, que `visualViewport` renvoie le temps d'un
  // changement d'orientation.
  if (!(hauteurVisible > 0) || !(hauteurMiseEnPage > 0)) return null;
  if (echelle > ECHELLE_MAX) return null;
  if (hauteurMiseEnPage - hauteurVisible < RETRAIT_MINIMUM) return null;
  if (!champFocalise && !engage) return null;
  return Math.round(hauteurVisible);
}
