/**
 * « RESTE-T-IL QUELQUE CHOSE SOUS LE PLI ? »
 * ─────────────────────────────────────────
 * Le fondu du bas d'une zone qui défile ne se décide PAS sur la géométrie du contenu. C'est la
 * leçon du 03/09/2026, et elle a coûté une maquette entière.
 *
 * On avait cru pouvoir compter sur la COUTURE : réordonner les sections de l'étape 1 pour que le
 * bas de la lucarne tranche une rangée de pastilles en travers, ce qui se lit tout seul comme
 * « ça continue ». Rejoué sur sept combinaisons réelles de téléphone et de nombre de sièges, la
 * lucarne va de 158 à 451 px et la coupe tombe deux fois sur sept EXACTEMENT sur une frontière de
 * rangée — écran d'apparence terminée. La couture est un accident, pas une propriété : elle
 * dépend de la taille de l'écran, du nombre de joueurs, du type de partie. Victor l'a vu avant moi.
 *
 * Ce module est donc la seule chose qui ne dépende de rien de tout ça : il compare la hauteur du
 * contenu à celle de la lucarne. Trois nombres, une soustraction, et le fondu se dessine au pli
 * quel que soit le pli.
 *
 * ⚠️ IL DOIT S'ABSTENIR TANT QU'IL N'A RIEN MESURÉ. Un fondu affiché « au cas où » promettrait une
 * suite qui n'existe pas sur les écrans courts — et un écran qui ment une fois n'est plus cru.
 * D'où le zéro traité comme « pas mesuré » et non comme « pas de contenu ».
 */

/** Résidu toléré au bout de la course, en pixels.
 *
 *  Un seul, comme dans `MultiCardPicker` (cf. son fondu horizontal) et pour la même raison
 *  mesurée : arrivé en bas, les arrondis laissent parfois une fraction de pixel, et le fondu
 *  clignoterait. */
export const RESIDU_TOLERE = 1;

/** Ce qu'une zone défilante sait d'elle-même. Les trois nombres arrivent ensemble dans un
 *  événement de défilement, et séparément par `onLayout` / `onContentSizeChange`. */
export type MesureDefilement = {
  /** Hauteur totale du contenu. */
  contenu: number;
  /** Hauteur visible — la lucarne. */
  lucarne: number;
  /** Défilement courant, depuis le haut. */
  position: number;
};

export const MESURE_VIERGE: MesureDefilement = { contenu: 0, lucarne: 0, position: 0 };

function mesuree(m: MesureDefilement): boolean {
  const { contenu, lucarne, position } = m;
  if (!Number.isFinite(contenu) || !Number.isFinite(lucarne) || !Number.isFinite(position)) return false;
  // Zéro = rien n'est encore arrivé. Une lucarne de zéro pixel n'existe pas dans une mise en page
  // posée, et un contenu de zéro ne déborde de rien.
  return contenu > 0 && lucarne > 0;
}

/**
 * Combien de contenu reste caché SOUS le bas de la lucarne.
 *
 * Négatif en théorie quand iOS étire la course au-delà de la fin (rebond élastique) : ramené à
 * zéro, parce qu'« il reste −12 px » ne veut rien dire et fausserait tout affichage du reste.
 */
export function resteSousLePli(m: MesureDefilement): number {
  if (!mesuree(m)) return 0;
  return Math.max(0, m.contenu - m.lucarne - m.position);
}

/** Faut-il dessiner le fondu ? */
export function debordeSousLePli(m: MesureDefilement): boolean {
  if (!mesuree(m)) return false;
  return m.contenu - m.lucarne - m.position > RESIDU_TOLERE;
}

/**
 * Fusionne ce qui vient d'arriver dans la mesure courante, en RENVOYANT L'ANCIENNE si rien ne
 * change. C'est ce qui évite un rendu par événement de défilement : `onScroll` tire à 60 images
 * par seconde, et une nouvelle référence à chaque fois relancerait l'écran entier — table comprise.
 */
export function fusionner(courante: MesureDefilement, part: Partial<MesureDefilement>): MesureDefilement {
  const suite: MesureDefilement = {
    contenu: part.contenu ?? courante.contenu,
    lucarne: part.lucarne ?? courante.lucarne,
    position: part.position ?? courante.position,
  };
  if (
    suite.contenu === courante.contenu &&
    suite.lucarne === courante.lucarne &&
    suite.position === courante.position
  ) {
    return courante;
  }
  return suite;
}
