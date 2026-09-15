// L'empreinte d'un texte : la clé du cache des traductions.
// ─────────────────────────────────────────────────────────
// SHA-256, en hexadécimal, des octets UTF-8 du texte. ⚠️ C'EST LA MÊME FORMULE qu'en SQL, et elle
// doit le rester : le jour où une vue voudra joindre `traductions`, elle calculera
//   encode(sha256(convert_to(coalesce(<texte>, ''), 'UTF8')), 'hex')
// et devra tomber sur la même chaîne que celle écrite ici. `scripts/test-traduction.mjs` fige deux
// empreintes connues pour que personne ne change l'une sans voir l'autre.
//
// La clé est le TEXTE et non l'id d'un post : un titre corrigé change d'empreinte et se retraduit
// de lui-même, et « gg » écrit par dix personnes ne coûte qu'une traduction par langue.

export async function empreinte(texte: string): Promise<string> {
  const hache = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(hache), (o) => o.toString(16).padStart(2, '0')).join('');
}
