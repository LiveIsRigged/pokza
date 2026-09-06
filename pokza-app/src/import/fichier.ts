import { refuser } from './formeNeutre';

/**
 * LIRE UNE HAND HISTORY DEPUIS UN FICHIER.
 * ══════════════════════════════════════
 * C'est le geste du BUREAU, et c'est là que vivent vraiment les hand histories : un fichier sur le
 * disque, glissé dans la fenêtre. Le collage reste le geste du téléphone.
 *
 * Ce module ne fait que transformer des octets en texte — c'est `importerMain` qui lit ensuite,
 * exactement comme pour un collage. Il n'y a donc AUCUN chemin de lecture propre au fichier : un
 * fichier et un collage donnent rigoureusement la même main, et se refusent pour les mêmes raisons.
 *
 * ⚠️ UN FICHIER DE SESSION CONTIENT TOUTE UNE SESSION, donc des dizaines de mains — et Pokza n'en
 * importe qu'une (décision nº 6, confirmée par Victor le 04/09/2026 pour le fichier comme pour le
 * collage). Un fichier à plusieurs mains est donc REFUSÉ, avec un message qui dit quoi faire. Le
 * dépôt sert alors les exports d'UNE main, que les clients savent produire (« partager la main »).
 */

/**
 * Plafond de taille. Un fichier de session d'une soirée pèse quelques centaines de kilooctets ;
 * huit mégaoctets couvrent très large. Ce n'est pas une valeur produit — rien ne l'affiche — juste
 * un garde-fou : au-delà, on ne lit pas des mains de poker, et décoder un fichier de cent
 * mégaoctets figerait l'onglet.
 */
export const TAILLE_MAX_OCTETS = 8 * 1024 * 1024;

/**
 * LES OCTETS EN TEXTE, avec le repli d'encodage qui compte.
 *
 * ⚠️ TOUS LES CLIENTS N'ÉCRIVENT PAS EN UTF-8. Les anciens clients Windows écrivent en
 * windows-1252, et un pseudo accentué y devient du charabia (« Gòra » pour « Góra ») — ce dépôt
 * porte déjà les traces d'un épisode de mojibake (`dev-cleanup-mojibake.sql`). Or un nom mal
 * décodé n'est PAS rattrapé par les contrôles : les lignes d'action se reconnaissent contre les
 * noms lus dans le même fichier, donc un charabia cohérent avec lui-même se lit très bien, et la
 * main se publierait avec des pseudos illisibles.
 *
 * D'où la lecture STRICTE d'abord (`fatal: true`) : si les octets ne forment pas de l'UTF-8 valide,
 * c'est qu'ils sont dans un autre encodage, et windows-1252 est le seul autre qu'on rencontre. Ce
 * test-là est fiable — une séquence d'octets valide en UTF-8 par hasard est extrêmement rare, et
 * l'inverse (du latin-1 pris pour de l'UTF-8) est justement ce qu'on élimine.
 */
export function decoderTexte(octets: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets);
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/** Un fichier trop gros, ou vide, n'est pas une hand history. */
export function verifierTaille(octets: number): void {
  if (octets === 0) refuser('texte-vide', 'fichier vide');
  if (octets > TAILLE_MAX_OCTETS) {
    refuser('fichier-trop-gros', `${Math.round(octets / 1024 / 1024)} Mo`);
  }
}

/**
 * Le texte d'un fichier déposé ou choisi. Lève une `ErreurDeLecture` comme le reste du pipeline,
 * pour que l'écran n'ait qu'un seul chemin d'échec à traiter.
 */
export async function texteDuFichier(fichier: File): Promise<string> {
  verifierTaille(fichier.size);
  const octets = await fichier.arrayBuffer();
  const texte = decoderTexte(octets);
  if (!texte.trim()) refuser('texte-vide', 'fichier sans texte');
  return texte;
}
