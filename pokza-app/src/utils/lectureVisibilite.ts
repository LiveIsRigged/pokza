/**
 * Quand une main du fil est-elle LUE ? — la décision, sans React ni réseau.
 * ────────────────────────────────────────────────────────────────────────
 * Tranché le 10/09/2026 : **déroulée OU 8 s à l'écran**, moitié de carte visible, minuteur
 * suspendu en arrière-plan. Ce fichier ne porte que le second chemin, celui de la durée — le
 * déroulé est un évènement, il n'a rien à calculer.
 *
 * Isolé ici pour être éprouvé au banc (`scripts/test-lecture-visibilite.js`) : c'est le seul
 * endroit du chantier où une erreur d'arithmétique serait INVISIBLE — une main mal comptée ne
 * fait rien de spectaculaire, elle se met juste à descendre dans le fil sans raison.
 */

export interface Boite {
  /** Position du haut de la carte DANS le contenu défilant. */
  y: number;
  /** Hauteur de la carte. */
  h: number;
}

export interface Fenetre {
  /** Défilement courant, même origine que `y`. */
  offset: number;
  /** Hauteur visible. */
  height: number;
}

/** Durée d'affichage au-delà de laquelle une main compte comme lue, faute de déroulé. */
export const READ_DWELL_MS = 8_000;

/** Fraction exigée — de la carte, ou de l'écran. Cf. `estAssezVisible`. */
export const READ_VISIBLE_RATIO = 0.5;

/** Hauteur de carte réellement à l'écran, en pixels. Jamais négative. */
export function partVisible(boite: Boite, fenetre: Fenetre): number {
  const haut = Math.max(boite.y, fenetre.offset);
  const bas = Math.min(boite.y + boite.h, fenetre.offset + fenetre.height);
  return Math.max(0, bas - haut);
}

/**
 * ⚠️ DEUX BRANCHES : « la moitié de la carte est à l'écran » OU « la carte occupe la moitié de
 * l'écran ». C'est la règle de l'IAB pour les grands formats.
 *
 * MESURÉ, parce que je l'avais d'abord écrit faux : une carte de main fait environ 942 px pour
 * ~700 px de fenêtre (cf. l'étude de compression du fil), et 700 dépasse largement la moitié de
 * 942. La première branche suffit donc au cas COURANT — contrairement à ce que je croyais.
 *
 * La seconde ne sert qu'au-delà de DEUX FOIS la hauteur d'écran, soit ~1400 px : une main longue
 * dont la description est dépliée et les commentaires ouverts y arrive. Sans elle, ces cartes-là
 * — celles qu'on lit le plus attentivement — ne seraient JAMAIS comptées comme lues. Le banc
 * garde la frontière exacte (`scripts/test-lecture-visibilite.js`).
 */
export function estAssezVisible(boite: Boite, fenetre: Fenetre): boolean {
  if (boite.h <= 0 || fenetre.height <= 0) return false;
  const visible = partVisible(boite, fenetre);
  return visible >= boite.h * READ_VISIBLE_RATIO || visible >= fenetre.height * READ_VISIBLE_RATIO;
}

/**
 * Fait avancer les minuteurs d'un tour et renvoie les mains qui viennent d'atteindre le seuil.
 *
 * `cumul` est MUTÉ : c'est un compteur de millisecondes, pas un état de rendu — le recopier à
 * chaque seconde pour dix cartes ne servirait qu'à faire travailler le ramasse-miettes. Les
 * mains rendues voient leur compteur remis à zéro : l'anti-rebond de 12 h vit en base, c'est lui
 * qui décide si une seconde lecture compte, et ce n'est pas à l'écran d'en juger.
 */
export function avancerLecture(
  ids: readonly string[],
  boites: ReadonlyMap<string, Boite>,
  fenetre: Fenetre,
  cumul: Map<string, number>,
  deltaMs: number
): string[] {
  const lues: string[] = [];
  for (const id of ids) {
    const boite = boites.get(id);
    if (!boite || !estAssezVisible(boite, fenetre)) continue;
    const tenu = (cumul.get(id) ?? 0) + deltaMs;
    if (tenu < READ_DWELL_MS) {
      cumul.set(id, tenu);
      continue;
    }
    cumul.set(id, 0);
    lues.push(id);
  }
  return lues;
}
