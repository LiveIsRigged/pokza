/**
 * LE LIEU ET LA PROVENANCE, SUR LA MÊME LIGNE.
 * ═══════════════════════════════════════════
 * `il y a 2 h · modifié · Winamax (importée)` — la mention se glisse dans la ligne qui existe
 * déjà, exactement comme « modifié » (cf. `postEdited`), et pour la même raison : la carte du feed
 * manque de hauteur (942 px demandés pour 700 disponibles), et une ligne de plus coûterait cher
 * pour dire peu.
 *
 * ⚠️ LA PARENTHÈSE EST UN SUFFIXE DU LIEU. Pas de lieu, pas de parenthèse : le mot reste seul.
 * C'est ce qui règle les trois cas que la seule salle nommable ne couvre pas —
 *   • dialecte reconnu mais salle ANONYME : Betclic n'écrit son nom nulle part, sa signature
 *     (`GAME #… Version:… Uncalled:Y`) est parfaite mais le même logiciel peut servir plusieurs
 *     salles → `importée` ;
 *   • un OUTIL et non une salle (un traqueur de bankroll, un convertisseur) : il ne donne son nom à
 *     rien. Le lieu est alors celui que porte le fichier — un casino, pour une main live passée
 *     par un outil de suivi → `Club Circus (importée)` — ou aucun → `importée` ;
 *   • une grammaire générique sur un site jamais vu → `importée`.
 * Le cas PokerTracker / Holdem Manager se règle tout seul : ces outils réexportent le texte de la
 * salle, donc le dialecte détecté est celui de la salle.
 *
 * ⚠️ « importée » N'EST JAMAIS STOCKÉ DANS `location`. La mention se COMPOSE à l'affichage, à
 * partir du drapeau du jsonb et du lieu, séparément. L'y écrire en ferait un lieu : modifiable,
 * republié comme tel, et parti dans la colonne. Effet secondaire voulu : un auteur qui tape un
 * lieu après coup sur une main Betclic voit la mention s'y accrocher toute seule.
 *
 * Le mot est celui de Victor (04/09/2026), y compris pour le cas sans salle : « garde importée
 * tout court quand la provenance est inconnue ».
 *
 * VOLONTAIREMENT ABSENTE DE LA MAIN EN TEXTE (`mainEnTexte`) : celle-là part hors de Pokza, où
 * « importée » ne veut rien dire pour personne — le lieu, lui, y reste et suffit. Ce n'est pas un
 * oubli.
 */
export function lieuEtProvenance(lieu?: string, importee?: boolean): string {
  const nom = lieu?.trim();
  if (nom) return importee ? ` · ${nom} (importée)` : ` · ${nom}`;
  return importee ? ' · importée' : '';
}
