import type { SourceDeSeed } from '../creator/rehydrate';
import { ErreurDeLecture, type CodeDeRefus, type Dialecte, type MainLue } from './formeNeutre';
import { winamax } from './dialectes/winamax';
import { betclic } from './dialectes/betclic';
import { party888 } from './dialectes/party888';
import { positions } from './dialectes/positions';
import { generique } from './dialectes/generique';
import { monter } from './montage';
import { verifier, type Controle } from './verification';

/**
 * « COLLER UNE MAIN » — LE PIPELINE, D'UN BOUT À L'AUTRE.
 * ════════════════════════════════════════════════════
 *   texte → découpe → détection du dialecte → forme neutre → montage → vérification → seed
 *
 * L'AVAL EXISTE DÉJÀ, ET C'EST CE QUI CHANGE TOUT : `postToSeed` → `seedStart` →
 * `LiveHandCreator initial={seed}` ouvre directement l'étape « Publier », tout rempli, avec
 * public/privé/groupe, et le « ‹ » redescend dans les 4 étapes précédentes. C'est le chemin de
 * « Corriger la main », en production et couvert par `test-rehydrate.js`. Ce module ne fait donc
 * qu'une chose : produire la forme que ce chemin attend déjà.
 *
 * Ce que l'auteur remplit lui-même, et que le parseur NE PROPOSE JAMAIS (décisions du 04/09) : le
 * titre, la description, le sondage, l'audience — c'est ce qui fait un POST, pas ce que contient
 * une main. Et aucun pseudo n'est importé.
 *
 * ⚠️ TOUT TOURNE SUR L'APPAREIL. Une hand history contient les pseudos et les tapis de gens qui
 * n'ont rien demandé : rien de ce texte ne doit partir sur un réseau. C'est aussi ce qui tient la
 * contrainte de coût à 0 — le modèle de langage a servi à ÉCRIRE les dialectes, il ne sert pas à
 * les exécuter.
 */

/**
 * L'ORDRE COMPTE, ET IL EST DÉLIBÉRÉ : les dialectes DÉDIÉS d'abord, la grammaire générique en
 * DERNIER. `importerMain` prend le premier qui reconnaît le texte — un dialecte mesuré sait des
 * choses que la famille ne sait pas (l'équation du pot de sa salle, la place de ses cartes, son
 * témoin de positions), et il ne doit jamais se faire coiffer par une lecture approximative qui,
 * elle, marcherait aussi.
 */
const DIALECTES: Dialecte[] = [winamax, betclic, party888, positions, generique];

export interface Provenance {
  /** Identifiant interne du dialecte reconnu. */
  dialecte: string;
  /** La salle, quand elle est NOMMABLE (cf. décision nº 4). Absente = le lieu restera vide. */
  salle?: string;
}

export type ResultatImport =
  | {
      ok: true;
      /** Prêt pour `postToSeed` → `seedStart` → `LiveHandCreator`. */
      source: SourceDeSeed;
      provenance: Provenance;
      /** Les six contrôles, tous passés — gardés pour pouvoir dire CE QUI a été prouvé (un
       *  contrôle sans témoin ne garantit rien, cf. `Controle.temoin`). */
      controles: Controle[];
      /** Ce que le montage a laissé tomber : jamais bloquant, mais à dire à l'auteur. */
      avertissements: string[];
    }
  | {
      ok: false;
      code: CodeDeRefus;
      message: string;
      /** Renseignés quand le refus vient de la vérification et non de la lecture. */
      controles?: Controle[];
      dialecte?: string;
    };

/**
 * Lit UNE main et la rend publiable — ou explique pourquoi elle ne l'est pas.
 *
 * ⚠️ REFUSER EST UN SUCCÈS. C'est ce qui autorise à tenter une lecture sur un format jamais vu :
 * une lecture fausse est DÉTECTÉE et n'est jamais publiée. Sans ce filet, il faudrait garantir
 * chaque site avant de l'ouvrir ; avec lui, la couverture est une propriété par MAIN.
 */
export function importerMain(texteBrut: string): ResultatImport {
  const texte = sansMarqueDOctets(texteBrut);
  if (!texte.trim()) {
    return { ok: false, code: 'texte-vide', message: 'Rien à lire.' };
  }

  const dialecte = DIALECTES.find((d) => d.reconnait(texte));
  if (!dialecte) {
    // Le détail technique est la PREMIÈRE LIGNE du texte, et non une redite du refus : c'est elle
    // qui identifie une salle, c'est elle qu'un futur dialecte lira en premier, et c'est elle qu'un
    // auteur nous enverra. Répéter « format non reconnu » sous « format non reconnu » n'apprenait
    // rien à personne.
    const premiere = texte.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    return {
      ok: false, code: 'format-inconnu',
      message: premiere.slice(0, 120) || 'aucune ligne lisible',
    };
  }

  // PAS D'IMPORT EN SÉRIE, JAMAIS (décision nº 6 du 04/09 : « sur Pokza on importe une main, une
  // seule »). Un fichier de session entier est donc un refus explicite, pas une prise du premier
  // élément — l'auteur doit savoir laquelle des mains part.
  const mains = dialecte.decoupe(texte);
  if (mains.length === 0) {
    return { ok: false, code: 'format-inconnu', message: "Aucune main dans ce texte.", dialecte: dialecte.id };
  }
  if (mains.length > 1) {
    return {
      ok: false, code: 'plusieurs-mains', dialecte: dialecte.id,
      message: `${mains.length} mains dans ce texte : Pokza n'en importe qu'une à la fois.`,
    };
  }

  let lue: MainLue;
  try {
    lue = dialecte.lit(mains[0]);
  } catch (e) {
    if (e instanceof ErreurDeLecture) {
      return { ok: false, code: e.code, message: e.message, dialecte: dialecte.id };
    }
    throw e;
  }

  try {
    const montage = monter(lue);
    const controles = verifier(lue, montage);
    const echecs = controles.filter((c) => !c.ok);
    if (echecs.length > 0) {
      return {
        ok: false, code: 'controle-echoue', controles, dialecte: dialecte.id,
        message: echecs.map((c) => `nº ${c.numero} ${c.nom} — ${c.detail}`).join(' | '),
      };
    }
    return {
      ok: true,
      source: {
        hand: montage.hand,
        location: montage.location,
        tournamentName: montage.tournamentName,
        buyIn: montage.buyIn,
        level: montage.level,
        // Le TITRE n'est jamais proposé : la dernière étape se remplit à la main, c'est de la
        // création de post pure, pas de la lecture de fichier.
        title: '',
        // L'audience se choisit à la dernière étape, comme pour toute main. `public` est le
        // défaut du formulaire, pas une décision de l'import.
        visibility: 'public',
      },
      provenance: { dialecte: lue.dialecte, salle: lue.salle },
      controles,
      avertissements: montage.avertissements,
    };
  } catch (e) {
    if (e instanceof ErreurDeLecture) {
      return { ok: false, code: e.code, message: e.message, dialecte: dialecte.id };
    }
    throw e;
  }
}

/** Combien de mains ce texte contient, selon le premier dialecte qui le reconnaît. Sert à l'écran
 *  (lot 2) pour dire « colle une seule main » avant même de tenter la lecture. */
export function compterLesMains(texteBrut: string): number {
  const texte = sansMarqueDOctets(texteBrut);
  const dialecte = DIALECTES.find((d) => d.reconnait(texte));
  return dialecte ? dialecte.decoupe(texte).length : 0;
}

/**
 * LA MARQUE D'ORDRE DES OCTETS (U+FEFF) N'EST JAMAIS SIGNIFIANTE — et elle casse toutes les
 * signatures, qui sont ancrées en début de ligne.
 *
 * ⚠️ ET IL PEUT Y EN AVOIR PLUSIEURS, PAS SEULEMENT UNE EN TÊTE : mesuré sur des fichiers de
 * session, où chaque main recollée traîne la sienne au milieu du texte. On les retire donc toutes,
 * pour tous les dialectes, plutôt que la première seulement.
 */
function sansMarqueDOctets(texte: string): string {
  return texte.replace(/\uFEFF/g, '');
}

export type { Controle } from './verification';
export type { CodeDeRefus } from './formeNeutre';
