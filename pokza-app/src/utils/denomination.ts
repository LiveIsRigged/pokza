import type { Hand } from '../types/poker';
import { abbreviateChips, formatChipAmount, habillerDenomination, SEUIL_ABREGEMENT } from './chipFormat';
import { devise } from './currency';

/**
 * De quoi nommer une partie. Un `Post` remplit ce contrat tel quel ; le créateur, lui, n'a pas
 * encore de post à l'étape « Publier » et passe la main et son contexte à la main.
 */
export interface PartieDecrite {
  hand: Hand;
  location?: string;
  /** Nom de l'épreuve, en tournoi seulement (cf. `TOURNAMENT_NAME_MAX_LENGTH`). */
  tournamentName?: string;
  buyIn?: string;
  level?: string;
}

const VARIANT_LABEL: Record<string, string> = { nlhe: 'NLHE', plo: 'PLO', plo5: 'PLO5' };

/**
 * Dénomination de la partie, telle qu'affichée sous l'en-tête.
 *
 * LES DEUX FORMES, tranchées par Victor le 04/09/2026, et pourquoi elles diffèrent :
 *
 *   Cash game · NLHE 2/5€ (1€) · Club Circus
 *   Tournoi NLHE · Winamax · Main Event 250€ · Niveau 12 : 700-1400 (160)
 *
 * • **La variante.** En cash elle fait bloc avec l'enjeu (« NLHE 2/5€ »), qui est la convention des
 *   salles. Un tournoi n'a pas d'enjeu à qualifier, et ses blindes vivent désormais dans le groupe
 *   du niveau, où « NLHE 700-1400 » n'aurait plus de sens : elle y qualifie donc la PARTIE.
 * • **Le tiret des blindes de tournoi** contre la barre du cash. Ce n'est pas une incohérence, c'est
 *   l'usage réel — et il tombe bien : le straddle n'existe qu'en cash (« 2/5/10€ »), donc la barre
 *   lui reste libre et le tiret ne rencontre jamais trois nombres.
 * • **L'ante entre parenthèses**, des deux côtés. Il n'était affiché NULLE PART auparavant, alors
 *   qu'il change le pot de départ. ⚠️ La parenthèse dit le MONTANT, pas QUI le poste : « 2/5€ (5€) »
 *   s'écrit pareil pour un BB ante (un seul joueur paie) et pour un ante par joueur (tout le monde
 *   paie), alors que le pot de départ va du simple au sextuple à six joueurs. Point laissé ouvert.
 * • **Deux groupes seulement en tournoi**, l'épreuve et le niveau, sans point médian à l'intérieur.
 *
 * `withLocation` existe parce que cette même chaîne sert à DEUX endroits qui n'ont pas le même
 * contexte. Dans la carte, le lieu est déjà écrit à côté de la date, juste au-dessus : l'ajouter
 * ici l'affichait deux fois à trois pixels d'écart. Dans le message de partage, il n'y a pas
 * d'en-tête — le lieu doit y rester, sinon le destinataire perd l'info.
 */
export function formatContextLine(
  post: PartieDecrite,
  { withLocation = true }: { withLocation?: boolean } = {}
): string {
  const { hand } = post;
  const variante = VARIANT_LABEL[hand.variant] ?? '';
  const parts: string[] = [];

  if (hand.gameType === 'tournament') {
    parts.push(variante ? `Tournoi ${variante}` : 'Tournoi');
    if (withLocation && post.location) parts.push(post.location);
    const epreuve = nommerEpreuve(post.tournamentName, post.buyIn);
    if (epreuve) parts.push(epreuve);
    parts.push(niveauEtBlindes(hand, post.level));
    return parts.join(' · ');
  }

  parts.push('Cash game');
  const prefixe = variante ? `${variante} ` : '';
  // Le bomb pot est du cash game par construction (l'interrupteur n'existe pas en tournoi, et
  // basculer sur « Tournoi » l'éteint) : il n'a donc pas de jumeau dans la branche du dessus.
  // Pas de blindes — le montant de l'ante, rangé dans `bb` par `construitMain`, suffit.
  parts.push(
    hand.bombPot
      ? `${prefixe}bomb pot ${formatChipAmount(hand.blinds.bb, hand.gameType, undefined, hand.currency)}`
      : `${prefixe}${enjeuxCash(hand)}`
  );
  if (withLocation && post.location) parts.push(post.location);
  // Ni l'un ni l'autre n'existe dans le formulaire en cash game — ils ne peuvent venir que d'une
  // main publiée avant que ces champs ne deviennent propres au tournoi. On les affiche quand même
  // plutôt que de faire disparaître du contenu déjà publié.
  if (post.buyIn) parts.push(post.buyIn);
  if (post.level) parts.push(post.level);
  return parts.join(' · ');
}

/**
 * « Niveau 12 : 700-1400 (160) », ou les seules blindes quand le niveau n'est pas renseigné.
 *
 * LE DEUX-POINTS N'EST PAS UN SÉPARATEUR, c'est un lien : le niveau VAUT ces blindes. Il est là
 * pour une raison mesurée — « Niveau 12 700-1400 » se lit « niveau 12 700 », et la collision est
 * systématique dès que les blindes ont quatre chiffres, ce qui est le cas de tout tournoi passé le
 * premier palier.
 */
function niveauEtBlindes(hand: Hand, level?: string): string {
  const { sb, bb, ante } = hand.blinds;
  // ABRÉGER LE GROUPE ENTIER, OU AUCUN DE SES NOMBRES, et c'est le plus grand qui tranche. Abréger
  // nombre par nombre donnerait « 15k-30k (3000) » : trois montants du même palier écrits dans deux
  // langues, sur cinq centimètres. Le seuil est celui du champ de saisie (`SEUIL_ABREGEMENT`), et
  // pour son motif d'origine — sous 10 000, le nombre entier se lit mieux que son abrégé.
  const abreger = Math.max(sb, bb, ante ?? 0) >= SEUIL_ABREGEMENT;
  const ecrire = (n: number) => (abreger ? abbreviateChips(n) : String(n));
  const blindes = `${ecrire(sb)}-${ecrire(bb)}`;
  const corps = ante ? `${blindes} (${ecrire(ante)})` : blindes;
  return level ? `${level} : ${corps}` : corps;
}

/** « NLHE 2/5€ » sans le préfixe : les blindes, les straddles, et l'ante entre parenthèses. */
function enjeuxCash(hand: Hand): string {
  // Un straddle change le niveau de mise à suivre au-delà de la BB : la dénomination doit le
  // refléter ("2/5/10€"), comme on écrirait "1/2/5" pour une table straddlée.
  const straddles = hand.actions
    .filter((a) => a.type === 'post-straddle')
    .sort((a, b) => a.order - b.order)
    .map((a) => a.amount ?? 0);
  // Le sigle se pose une seule fois AUTOUR de la dénomination entière ("2/5€", "$2/5"), d'où
  // `habillerDenomination` plutôt que `formatChipAmount`, qui l'accolerait à chacun des nombres.
  const abregeable = devise(hand.currency).abrege;
  const format = (n: number) => (abregeable ? abbreviateChips(n) : String(n));
  const habiller = (texte: string) => habillerDenomination(texte, 'cash', hand.currency);
  const enjeux = habiller([hand.blinds.sb, hand.blinds.bb, ...straddles].map(format).join('/'));
  return hand.blinds.ante ? `${enjeux} (${habiller(format(hand.blinds.ante))})` : enjeux;
}

/**
 * « Main Event 250€ » — l'épreuve et son prix, collés, sans point médian entre eux.
 *
 * ON N'ÉCRIT PAS DEUX FOIS LE MÊME PRIX. Les salles en ligne nomment leurs tournois d'après leur
 * buy-in (« Flash Twister 5€ », buy-in 5€), et l'import remplit les deux champs depuis la même
 * hand history : sans cette règle, la ligne dirait « Flash Twister 5€ 5€ ».
 */
function nommerEpreuve(nom?: string, buyIn?: string): string {
  const epreuve = nom?.trim();
  const prix = buyIn?.trim();
  if (!epreuve) return prix ?? '';
  if (!prix) return epreuve;
  return prixDejaDansLeNom(epreuve, prix) ? epreuve : `${epreuve} ${prix}`;
}

/**
 * La comparaison s'arrête à une frontière de nombre, et c'est indispensable : « Main Event 250€ »
 * se termine littéralement par « 50€ », et un buy-in de 50€ y disparaîtrait sans ce garde-fou.
 */
function prixDejaDansLeNom(nom: string, prix: string): boolean {
  if (!nom.endsWith(prix)) return false;
  const avant = nom[nom.length - prix.length - 1];
  return avant === undefined || !/[\d.,]/.test(avant);
}
