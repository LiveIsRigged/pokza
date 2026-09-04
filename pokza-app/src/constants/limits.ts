// Limites de saisie — source unique
// =================================
// Ces valeurs sont arbitrées produit (validées le 2026-08-15), pas techniques. Elles étaient
// jusqu'ici dispersées dans les écrans, parfois dupliquées (pseudo et bio étaient déclarés deux
// fois), et le plus souvent absentes — titre, lieu, buy-in, niveau et question de vote
// n'avaient AUCUNE limite.
//
// ⚠️ CHAQUE valeur ici a un jumeau en base, dans docs/dev/securite-lot6.sql. Les deux doivent
// rester identiques. Une limite d'interface seule ne protège rien : l'API REST est joignable
// directement avec la clé publique de l'app, et accepte alors un champ de plusieurs mégaoctets
// qui casserait l'affichage du feed pour TOUS les lecteurs, pas seulement pour son auteur.
//
// Pourquoi le MÊME nombre des deux côtés, et pas une marge en base : le comptage de JavaScript
// (unités UTF-16) est plus strict que celui de PostgreSQL (points de code) — un emoji compte
// pour 2 côté interface et pour 1 côté base. La base ne refusera donc jamais quelque chose que
// l'interface a laissé passer.

/** Profil */
export const PSEUDO_MAX_LENGTH = 24;
export const BIO_MAX_LENGTH = 150;

/** Main : texte principal.
 *  Le titre s'affiche sur UNE ligne dans le feed (19 px, gras). Mesuré sur SF Pro Bold : une
 *  phrase française y tient à ~9,2 px par caractère, soit 37 caractères dans les 343 px utiles
 *  d'un iPhone SE — le plus étroit des appareils visés. 40 est donc le seuil au-delà duquel un
 *  titre commence à être tronqué à l'affichage plutôt qu'à la saisie : mieux vaut que l'auteur
 *  le voie dans le compteur du formulaire que de découvrir sa main coupée dans le feed.
 *  Le titre complet reste lisible en entier sur l'écran d'une main (`PostScreen`). */
export const TITLE_MAX_LENGTH = 40;
export const DESCRIPTION_MAX_LENGTH = 600;

/** Nom personnalisé d'un adversaire à table. Contrainte par le BADGE DE SIÈGE, pas par le
 *  formulaire : le bloc d'un siège fait 80 px de large et le nom y est sur une seule ligne.
 *  Mesuré sur la fonte système (12 px, gras) : 7,05 px par caractère en moyenne, soit 11
 *  caractères — « Jean-Michel » passe à 5 px près, « LeBossDuPoker » est coupé. La bulle
 *  d'action tombe au même endroit : dans son libellé le plus long (« X poste la grosse
 *  blinde (5€) »), il reste 80 px pour le nom, soit ~10 caractères.
 *
 *  ⚠️ SEULE limite du produit qui n'a PAS de jumelle en base. Les noms vivent dans le JSON de
 *  la main (colonne `hand`), pas dans une colonne : une contrainte `CHECK` ne peut pas y faire
 *  de sous-requête, il faudrait une fonction immuable ou un déclencheur. La colonne `hand`
 *  elle-même n'a d'ailleurs aucune limite de taille — sujet ouvert, distinct de celui-ci. */
export const OPPONENT_NAME_MAX_LENGTH = 12;

/** Main : contexte. Ces trois champs s'affichent côte à côte sur une seule ligne sous le titre —
 *  des valeurs longues s'y chevaucheraient. */
export const LOCATION_MAX_LENGTH = 40;
export const BUY_IN_MAX_LENGTH = 16;

/** Nom de l'épreuve, en tournoi seulement (« Main Event », « #5 - W SERIES - MILLION EVENT »).
 *  Contraint par la LIGNE DE CONTEXTE, où il s'affiche entre le type de partie et le niveau.
 *
 *  44 et non 40 comme `LOCATION_MAX_LENGTH` : le plus long nom réel relevé sur une vraie hand
 *  history en fait 41 (« #5 - W SERIES - MILLION EVENT - KO - DAY 1 »), et l'aligner sur le lieu
 *  l'aurait coupé d'un caractère. Les noms de MTT en ligne sont longs par nature — ils empilent le
 *  numéro d'épreuve, la série, le format et le jour.
 *
 *  ⚠️ Ce champ est le seul du contexte qui puisse faire passer la ligne sur DEUX lignes, donc
 *  varier la hauteur d'une carte du feed. C'est assumé (Victor, 04/09/2026) : brider la ligne à une
 *  seule aurait fait tomber les blindes, le bout le plus utile. */
export const TOURNAMENT_NAME_MAX_LENGTH = 44;

/** Niveau de blindes. Ce qui est STOCKÉ est la chaîne complète « Niveau 12 », pas le seul nombre
 *  (cf. LevelNumberInput) : 7 caractères de préfixe + 3 chiffres. Le niveau ne dépasse jamais
 *  999 en tournoi, d'où les 3 chiffres. */
export const LEVEL_DIGITS_MAX = 3;
export const LEVEL_MAX_LENGTH = 'Niveau '.length + LEVEL_DIGITS_MAX;

/** Main : sondage */
export const VOTE_QUESTION_MAX_LENGTH = 80;
export const VOTE_OPTION_MAX_LENGTH = 20;

/** Commentaire. Plus généreux que le reste : c'est le seul endroit où on argumente vraiment une
 *  main, une limite basse y serait frustrante. */
export const COMMENT_MAX_LENGTH = 1000;

/** Groupes */
export const GROUP_NAME_MAX_LENGTH = 30;
export const GROUP_DESCRIPTION_MAX_LENGTH = 300;

/** Modération */
export const REPORT_DETAILS_MAX_LENGTH = 500;
