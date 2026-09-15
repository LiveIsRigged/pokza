// Garde-fous : ce qu'une traduction n'a JAMAIS le droit de changer.
// ─────────────────────────────────────────────────────────────────
// La consigne DEMANDE de garder les cartes, les montants et les emojis. Ce fichier VÉRIFIE. Une
// traduction qui échoue ici n'est pas montrée : un lecteur qui voit « AK suited » là où l'auteur a
// écrit « AKs », ou « 25 » là où il a écrit « 250 », lit une AUTRE main — le pire défaut possible,
// parce qu'il est plausible. Mieux vaut l'original que ça.
//
// Chaque contrôle est volontairement TOLÉRANT sur la forme et STRICT sur le fond : « 1 000 » et
// « 1,000 » sont le même nombre, « 2,5bb » et « 2.5bb » aussi ; « As » (l'as, en français) ou « 3h »
// (trois heures) ne sont PAS comptés comme des cartes, faute de quoi on rejetterait des traductions
// justes. Un garde-fou qui crie à tort finit ignoré.

import { langueDeBase } from './consigne.ts';

export type Defaut = 'vide' | 'cartes' | 'nombres' | 'emojis' | 'liens' | 'longueur' | 'balises' | 'bavardage';

// Rangs en majuscule, couleurs en minuscule ou en symbole, jamais au milieu d'un mot.
const CARTES = new RegExp(
  '(?<![\\p{L}\\p{N}])(?:' +
    [
      '(?:10|[2-9TJQKA])[♠♥♦♣]', //       un symbole de couleur : aucune ambiguïté
      '(?:(?:10|[2-9TJQKA])[shdc]){2,}', // des cartes collées : AhKd, Qs8h3h
      '[TJQK][shdc]', //                  une figure seule : Qs, Kd — mais pas « As », pas « 3h »
      '[2-9TJQKA]{2}[so]\\+?', //         une classe de main : AKs, T9s, 72o, QJs+
      '([2-9TJQKA])\\1\\+?', //           une paire : QQ, 77, TT+
      '[AKQJT]{2}', //                    deux figures : AK, KQ
    ].join('|') +
    ')(?![\\p{L}\\p{N}])',
  'gu',
);
const EMOJIS = /\p{Extended_Pictographic}/gu;
const LIENS = /https?:\/\/[^\s<>"]+/g;
const BALISES = /<\/?t-[0-9a-f]+|<\/?think>/i;
const PREAMBULES = /^\s*(?:here(?:'s| is| are)\b|sure\b|certainly\b|translation\b|voici\b|traduction\b|hier ist\b|übersetzung\b|aquí (?:está|tienes)\b|traducción\b)/i;
const ECRITURES_DENSES = new Set(['zh', 'ja', 'ko']);

function compter(motif: RegExp, texte: string): Map<string, number> {
  const n = new Map<string, number>();
  for (const m of texte.matchAll(motif)) n.set(m[0], (n.get(m[0]) ?? 0) + 1);
  return n;
}

/** Ce que la source contient plus de fois que la traduction. */
function manquants(source: Map<string, number>, traduction: Map<string, number>): string[] {
  return [...source].filter(([k, v]) => (traduction.get(k) ?? 0) < v).map(([k]) => k);
}

export function cartesDe(texte: string): Map<string, number> {
  return compter(CARTES, texte);
}

/** Les nombres, séparateurs de milliers retirés et virgule décimale ramenée au point. */
export function nombresDe(texte: string): Map<string, number> {
  let t = texte;
  for (let avant = ''; avant !== t; ) {
    avant = t;
    t = t.replace(/(\d)[\s  .,’'](\d{3})(?!\d)/g, '$1$2');
  }
  t = t.replace(/(\d),(\d)/g, '$1.$2');
  return compter(/\d+(?:\.\d+)?/g, t);
}

/**
 * Les défauts d'une traduction ; tableau vide = montrable.
 * `source` est la langue que le modèle a reconnue — elle ne sert qu'à juger la longueur.
 */
export function verifierTraduction(original: string, traduction: string, cible: string, source: string): Defaut[] {
  const defauts: Defaut[] = [];
  const o = original.trim();
  const t = traduction.trim();

  if (o.length > 0 && t.length === 0) return ['vide'];
  if (BALISES.test(t)) defauts.push('balises');
  if (PREAMBULES.test(t) && !PREAMBULES.test(o)) defauts.push('bavardage');
  if (manquants(cartesDe(o), cartesDe(t)).length > 0) defauts.push('cartes');
  if (manquants(nombresDe(o), nombresDe(t)).length > 0) defauts.push('nombres');
  if (manquants(compter(EMOJIS, o), compter(EMOJIS, t)).length > 0) defauts.push('emojis');
  if (manquants(compter(LIENS, o), compter(LIENS, t)).length > 0) defauts.push('liens');

  // L'allemand allonge d'un tiers, le chinois divise par trois : les bornes ne jugent que
  // l'absurde (une réponse à la question posée, une phrase avalée), pas le style.
  if (o.length >= 25) {
    const min = ECRITURES_DENSES.has(langueDeBase(cible)) ? 0.15 : 0.35;
    const max = ECRITURES_DENSES.has(langueDeBase(source)) ? 6 : 2.5;
    if (t.length < o.length * min || t.length > o.length * max) defauts.push('longueur');
  } else if (t.length > o.length * 4 + 20) {
    defauts.push('longueur');
  }
  return defauts;
}
