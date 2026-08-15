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

/** Main : texte principal */
export const TITLE_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 600;

/** Main : contexte. Ces trois champs s'affichent côte à côte sur une seule ligne sous le titre —
 *  des valeurs longues s'y chevaucheraient. */
export const LOCATION_MAX_LENGTH = 40;
export const BUY_IN_MAX_LENGTH = 16;

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
