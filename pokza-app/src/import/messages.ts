import type { CodeDeRefus } from './formeNeutre';

/**
 * CE QU'ON DIT À L'AUTEUR QUAND UNE MAIN EST REFUSÉE.
 * ═════════════════════════════════════════════════
 * `importerMain` rend un message TECHNIQUE, fait pour un test et pour un diagnostic
 * (« marqueur inconnu : *** SECOND FLOP *** »). Ces messages-ci sont l'autre moitié : ce que
 * l'écran montre. Séparés exprès — un message qui doit servir aux deux finit par mal servir les
 * deux.
 *
 * ⚠️ LE TON EST CELUI D'UN REFUS QUI EST UN SUCCÈS. Une lecture douteuse est détectée et n'est
 * jamais publiée : c'est ce qui permet d'ouvrir la lecture à des formats qu'on ne garantit pas.
 * Le message ne doit donc pas s'excuser — il doit dire ce qui s'est passé et, quand il y a quelque
 * chose à faire, quoi faire.
 *
 * PAS DE « ENVOYER CET EXEMPLE » : tranché par Victor le 04/09/2026 — un refus explique et s'arrête
 * là. Rien de ce texte ne quitte l'appareil, ce qui reste la promesse de l'architecture (une hand
 * history porte les pseudos et les tapis de gens qui n'ont rien demandé).
 */
const MESSAGES: Record<CodeDeRefus, string> = {
  'texte-vide': "Il n'y a rien à lire.",
  'fichier-trop-gros': "Ce fichier est trop gros pour être une hand history.",
  // ⚠️ REFUS DÉCIDÉ PAR VICTOR le 04/09/2026. Un cashout (GGPoker) fait payer au joueur une prime
  // pour encaisser son équité avant la fin : sur la main mesurée, il a réellement touché UN QUART
  // de moins que le pot affiché (10,09 de prime sur 41,87). Le déroulé du coup est exact, mais le
  // résultat en argent ne l'est pas — et Pokza n'a aucun endroit pour le dire.
  'main-avec-cashout':
    "Cette main a été encaissée avant la fin (cashout) : le gagnant n'a pas touché le pot affiché.",
  /**
   * ⚠️ LE SEUL REFUS QUI APPELLE UNE SUITE, ET ELLE N'EST PAS ENTRE LES MAINS DE L'AUTEUR : sa
   * salle n'est pas lue, il n'y peut rien. La phrase commence donc par CE QU'IL PEUT FAIRE
   * MAINTENANT — il est bloqué, c'est sa question — et l'envoi vient après, comme un service qu'il
   * se rend à lui-même.
   *
   * ⚠️ ON NOMME L'ADRESSE, PAS LE CHEMIN. « Réglages › Signaler un problème » ouvre le même mail,
   * mais y envoyer quelqu'un EN PLEINE CRÉATION lui ferait quitter le créateur et perdre sa main.
   * Une adresse se lit et se recopie sans bouger de l'écran.
   *
   * Le mot est « room », pas « salle » : c'est celui que les joueurs emploient en français
   * (Victor, deux fois plutôt qu'une). Et « cette room » plutôt que « ta room » — ce qui n'est pas
   * reconnu, c'est un FORMAT, pas forcément la salle où joue l'auteur.
   *
   * ⚠️ ET ON NE PROMET PLUS UNE LISTE DE SALLES. La version d'avant disait « Winamax et Betclic
   * sont lus, et beaucoup d'autres salles aussi » : depuis la grammaire générique, la couverture
   * est une propriété par MAIN et non par SITE — on ne peut ni nommer toutes celles qui marchent,
   * ni jurer que celles qu'on nomme marchent toujours. Écarté par Victor le 04/09/2026.
   *
   * L'envoi est fait PAR L'AUTEUR, par courrier, en voyant ce qu'il envoie. Ce n'est pas le
   * « envoyer cet exemple » qu'il avait écarté : là, rien ne quitte l'appareil tout seul.
   */
  'format-inconnu':
    "Pokza n'a pas reconnu ce format : il faut saisir la main toi-même.\n"
    + "Envoie-nous un exemple à contact@pokza.app pour qu'on ajoute cette room.",
  // ⚠️ JAMAIS LU : `messageDeRefus` traite `plusieurs-mains` à part, parce que sa phrase dépend du
  // nombre de mains ET de la provenance (un fichier de session ne s'ouvre pas comme un collage se
  // recolle). L'entrée n'existe que pour que `Record<CodeDeRefus, string>` reste exhaustif — ce
  // filet vient d'ailleurs d'attraper sa suppression accidentelle.
  'plusieurs-mains': "Colle une seule main.",
  'variante-non-prise-en-charge': "Pokza ne lit que le Hold'em pour l'instant.",
  'trop-de-joueurs': 'Cette table a plus de dix joueurs.',
  'pas-assez-de-joueurs': "Il n'y a pas assez de joueurs dans ce texte.",
  'bouton-introuvable': "Le bouton n'est indiqué nulle part dans ce texte.",
  /**
   * Pokza a toujours exactement un héros : sans point de vue, la main n'a personne à désigner.
   *
   * ⚠️ LA PHRASE D'AVANT ÉTAIT FAUSSE DANS UN CAS SUR DEUX, et c'est une vraie main qui l'a montré
   * (06/09/2026) : elle disait « ce texte ne montre les cartes de personne » devant une main d'outil
   * de suivi qui en montre QUATRE — l'auteur y connaît les cartes de plusieurs joueurs sans être
   * aucun d'eux. Les deux causes sont bien la même (aucun point de vue), mais une seule des deux
   * formulations est vraie des deux côtés. Le détail technique, lui, dit toujours laquelle des deux
   * c'est (« ce texte ne montre les cartes de personne » / « aucun siège n'est marqué Hero ») — et
   * c'est exactement à ça que sert la ligne grise sous le message.
   */
  'hero-introuvable': "Rien n'indique quelle place est la tienne dans cette main.",
  'joueur-inconnu': "Un joueur agit sans être assis à la table.",
  'noms-en-double': 'Deux joueurs portent le même nom à cette table.',
  'mise-forcee-inconnue': "Cette main contient une mise forcée que Pokza ne sait pas encore lire.",
  'ligne-incomprise': "Une ligne de ce texte n'a pas pu être lue.",
  'sans-petite-blinde': "Personne ne poste la petite blinde dans cette main.",
  // LE message du chantier. Il ne dit pas « erreur » : il dit qu'on a préféré refuser.
  'controle-echoue': "Pokza a lu cette main, mais les comptes ne tombent pas juste. Mieux vaut refuser que publier une main fausse.",
};

/**
 * CE QU'ON DIT QUAND LA MAIN EST LUE MAIS QUE QUELQUE CHOSE N'A PAS SUIVI.
 *
 * ⚠️ CE N'EST PAS UN REFUS, ET LE TON NE DOIT PAS EN AVOIR L'AIR : la main est bonne, elle part.
 * Tout ce qui est signalé se corrige à l'ÉTAPE 1, sans rien perdre du déroulé — d'où une phrase qui
 * dit où aller, et des lignes en dessous qui disent quoi. Deux natures s'y rangent :
 *   • ce que le MONTAGE a laissé tomber : un nom d'épreuve plus long que son champ, un buy-in trop
 *     long pour le sien ;
 *   • ce que la NOTATION ne dit pas et qu'un dialecte a dû trancher par défaut — le type de partie
 *     de la notation par positions, qui n'écrit nulle part s'il s'agit de cash ou de tournoi.
 *
 * ⚠️ ET ÇA SE DIT MAINTENANT OU JAMAIS : une fois la main rendue au créateur, cet écran disparaît
 * et il n'existe plus aucun endroit pour le dire. Le montage produisait déjà ces avertissements
 * (« jamais bloquant, mais à dire à l'auteur ») et PERSONNE ne les lisait — la perte était
 * silencieuse, ce que ce chantier refuse partout ailleurs.
 *
 * « si besoin » n'est pas une politesse : la plupart du temps le défaut sera le bon (une main de
 * cash lue comme du cash), et la phrase ne doit pas faire croire à une erreur.
 */
export function messageDAvertissement(nombre: number): string {
  return nombre > 1
    ? `La main est lue. ${nombre} choses à corriger si besoin, en remontant à l'étape 1 :`
    : "La main est lue. Une chose à corriger si besoin, en remontant à l'étape 1 :";
}

/** D'où vient le texte — la seule chose qui change un message, et elle n'en change qu'un. */
export type Provenance = 'collage' | 'fichier';

/**
 * @param nombreDeMains renseigné pour `plusieurs-mains` seulement — savoir qu'il y en avait 47
 *   explique le refus mieux que la consigne seule.
 * @param provenance change la SUITE à donner, pas la cause : « colle une seule main » n'a aucun
 *   sens devant un fichier de session, où le geste utile est d'ouvrir le fichier. C'est le seul
 *   message où la provenance compte — tous les autres décrivent la main, pas le geste.
 */
export function messageDeRefus(
  code: CodeDeRefus,
  nombreDeMains?: number,
  provenance: Provenance = 'collage'
): string {
  if (code === 'plusieurs-mains') {
    const combien = nombreDeMains && nombreDeMains > 1 ? `${nombreDeMains} mains` : 'plusieurs mains';
    return provenance === 'fichier'
      ? `Ce fichier contient ${combien}. Pokza n'en importe qu'une : ouvre-le et colle celle que tu veux.`
      : `Il y a ${combien} dans ce texte. Colle une seule main.`;
  }
  return MESSAGES[code] ?? "Ce texte n'a pas pu être lu.";
}
