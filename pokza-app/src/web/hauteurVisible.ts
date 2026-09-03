/**
 * L'APP TIENT DANS LA BANDE RÉELLEMENT VISIBLE
 * ────────────────────────────────────────────
 * Signalé par Victor le 02/09/2026 : ouvrir « Relancer » fait remonter tout l'écran. Le défaut
 * existe partout où l'on saisit quelque chose — 21 écrans et 5 feuilles ont un champ.
 *
 * CE QUI SE PASSE, MESURÉ SUR SON IPHONE LE 03/09/2026 EN MODE APPLICATION
 *   Au repos, la bande visible fait 873 px. Clavier ouvert, elle tombe à 487 : il en manque 386.
 *   La fenêtre de MISE EN PAGE, elle, reste à 873 — `html { height: 100% }` s'y résout, donc l'app
 *   fait 873 px de haut dans une bande de 487, et Safari fait glisser la page de 386 px pour
 *   révéler le champ. C'est ce glissement que Victor voit.
 *
 * DEUX ERREURS PAYÉES CHER, QU'IL NE FAUT PAS REFAIRE
 *
 *   1. `window.innerHeight` N'EST PAS LA FENÊTRE DE MISE EN PAGE SUR iOS. Elle suit la bande
 *      VISIBLE. Clavier ouvert, on lit `innerHeight = 487` et `visualViewport.height = 487` : les
 *      deux mêmes chiffres. La première version de ce fichier s'en servait comme garde-fou —
 *      « si l'écart est inférieur à 120 px, ce n'est pas un clavier » — et cet écart valait donc
 *      TOUJOURS zéro. Le correctif ne s'est jamais déclenché une seule fois, en silence.
 *      La référence est désormais `hauteurAuRepos` : la bande visible mesurée quand aucun champ
 *      n'a le focus. C'est la seule grandeur stable qu'on ait trouvée.
 *
 *   2. RÉTRÉCIR APRÈS AVOIR MESURÉ LE CLAVIER ARRIVE TROP TARD. Le décalage de Safari est déjà
 *      posé à 89 ms, quand le premier `resize` arrive ; s'aligner à 90 ms ne le défait pas. Il
 *      faut rétrécir DÈS LE TOUCHER, sur une hauteur devinée, avant que Safari ne décide de faire
 *      défiler. C'est mesuré : au toucher, la page ne bouge plus du tout (`off=0`, `scroll=0`, le
 *      champ ne se déplace pas d'un pixel) ; sur le premier `resize`, elle glisse de 386 px.
 *
 * On devine généreusement, puis on corrige à la hausse dès que la vraie mesure arrive : rogner un
 * peu trop laisse une bande de fond pendant 90 ms, rogner un peu trop peu fait glisser la page.
 */

/**
 * En dessous de ce retrait (repos − visible), ce n'est pas un clavier : barre d'adresse Safari en
 * onglet (50 à 80 px), barre de suggestions d'un clavier matériel (~55 px). Le plus petit clavier
 * iOS, lui, fait 216 px. 120 sépare franchement les deux familles.
 */
export const RETRAIT_MINIMUM = 120;

/**
 * Page zoomée : `visualViewport.height` devient la hauteur de la loupe et non celle de l'écran.
 * S'y caler écraserait l'app. (En mode application iOS interdit le zoom ; le cas ne se rencontre
 * qu'en onglet.)
 */
export const ECHELLE_MAX = 1.05;

/**
 * Part de l'écran que prend un clavier, tant qu'on n'en a pas mesuré un vrai. Sert au seul premier
 * toucher de la vie de l'app : dès le premier `resize`, la vraie hauteur est retenue.
 * 0,55 est délibérément généreux — 0,44 sur l'iPhone de Victor. Trop rogner ne fait jamais glisser
 * la page ; pas assez, si.
 */
export const PART_CLAVIER_PAR_DEFAUT = 0.55;

/** On ne rétrécit jamais en dessous : sous ce seuil il n'y a plus d'app, juste une bande. */
export const HAUTEUR_PLANCHER = 200;

export type EtatViewport = {
  /** `visualViewport.height` relevée quand aucun champ n'a le focus. La référence. */
  hauteurAuRepos: number;
  /** `visualViewport.height` maintenant. */
  hauteurVisible: number;
  /** `visualViewport.scale` — 1 tant que la page n'est pas zoomée. */
  echelle: number;
  /** Un champ de saisie a le focus, au sens de `clavier.ts`. */
  champFocalise: boolean;
};

/**
 * La hauteur à poser DÈS LE TOUCHER, avant que le clavier n'existe et donc avant toute mesure.
 * `clavierRetenu` vient du dernier clavier réellement mesuré sur cet appareil (0 si aucun).
 */
export function hauteurAnticipee(hauteurAuRepos: number, clavierRetenu: number): number | null {
  if (!(hauteurAuRepos > 0)) return null;
  const clavier = clavierRetenu >= RETRAIT_MINIMUM
    ? clavierRetenu
    : Math.round(hauteurAuRepos * PART_CLAVIER_PAR_DEFAUT);
  return Math.max(HAUTEUR_PLANCHER, Math.round(hauteurAuRepos - clavier));
}

/**
 * La hauteur à poser une fois le clavier mesuré. `null` = aucune, on rend la main à `100%`.
 *
 * `engage` sert à la SORTIE : quand le champ perd le focus, le clavier met encore ~250 ms à
 * redescendre. Rendre la hauteur tout de suite rejouerait le défaut le temps de l'animation. Tant
 * qu'on est engagé, on accompagne donc le clavier qui s'en va.
 */
export function hauteurAAppliquer(etat: EtatViewport, engage: boolean): number | null {
  const { hauteurAuRepos, hauteurVisible, echelle, champFocalise } = etat;
  // `!(x > 0)` et non `x <= 0` : attrape aussi NaN, que `visualViewport` renvoie le temps d'un
  // changement d'orientation.
  if (!(hauteurVisible > 0) || !(hauteurAuRepos > 0)) return null;
  if (echelle > ECHELLE_MAX) return null;
  if (hauteurAuRepos - hauteurVisible < RETRAIT_MINIMUM) return null;
  if (!champFocalise && !engage) return null;
  return Math.max(HAUTEUR_PLANCHER, Math.round(hauteurVisible));
}
