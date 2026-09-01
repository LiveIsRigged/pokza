// UN FAUX DISQUE, pour tester `derniereTableStockage` hors de React Native.
// ────────────────────────────────────────────────────────────────────────
// `@react-native-async-storage/async-storage` n'existe pas sous node (et ses node_modules vivent
// dans `pokza-app/`, hors de portée d'un script lancé depuis la racine). Le test réoriente donc la
// résolution de ce seul module vers ce fichier — cf. l'en-tête de `test-derniere-table-stockage.js`.
//
// Il sait aussi TOMBER EN PANNE, ce qui est la moitié de l'intérêt : le module doit encaisser un
// disque muet sans jamais interrompre une publication.

const memoire = new Map();

const api = {
  /** 'lecture' | 'ecriture' | null — fait échouer l'opération correspondante. */
  panne: null,
  vider() {
    memoire.clear();
    api.panne = null;
  },
  brut(cle) {
    return memoire.has(cle) ? memoire.get(cle) : null;
  },
  poser(cle, valeur) {
    memoire.set(cle, valeur);
  },
  async getItem(cle) {
    if (api.panne === 'lecture') throw new Error('disque muet');
    return memoire.has(cle) ? memoire.get(cle) : null;
  },
  async setItem(cle, valeur) {
    if (api.panne === 'ecriture') throw new Error('disque plein');
    memoire.set(cle, valeur);
  },
  async removeItem(cle) {
    memoire.delete(cle);
  },
};

module.exports = api;
// Le TS compilé sans `esModuleInterop` lit `.default` d'un import par défaut ; avec, il lit l'objet.
// On répond aux deux plutôt que de dépendre d'un drapeau de compilation.
module.exports.default = api;
