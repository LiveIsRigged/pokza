import type { Hand } from '../types/poker';
import { abbreviateChips, formatChipAmount, habillerDenomination } from './chipFormat';
import { devise } from './currency';

/**
 * De quoi nommer une partie. Un `Post` remplit ce contrat tel quel ; le créateur, lui, n'a pas
 * encore de post à l'étape « Publier » et passe la main et son contexte à la main.
 */
export interface PartieDecrite {
  hand: Hand;
  location?: string;
  buyIn?: string;
  level?: string;
}

const VARIANT_LABEL: Record<string, string> = { nlhe: 'NLHE', plo: 'PLO', plo5: 'PLO5' };

/**
 * Dénomination de la partie, telle qu'affichée sous l'en-tête.
 *
 * `withLocation` existe parce que cette même chaîne sert à DEUX endroits qui n'ont pas le même
 * contexte. Dans la carte, le lieu est déjà écrit à côté de la date, juste au-dessus : l'ajouter
 * ici l'affichait deux fois à trois pixels d'écart. Dans le message de partage, il n'y a pas
 * d'en-tête — le lieu doit y rester, sinon le destinataire perd l'info.
 */
export function formatContextLine(post: PartieDecrite, { withLocation = true }: { withLocation?: boolean } = {}): string {
  const { hand } = post;
  const parts: string[] = [];
  parts.push(hand.gameType === 'cash' ? 'Cash game' : 'Tournoi');
  // Variante en préfixe de la dénomination : donne "NLHE 2/5€", "PLO 2/5€" ou "PLO bomb pot 5€" en
  // un seul segment fluide, plutôt que des morceaux séparés par des points.
  const variantPrefix = VARIANT_LABEL[hand.variant] ? `${VARIANT_LABEL[hand.variant]} ` : '';
  if (hand.bombPot) {
    // Bomb pot : pas de blindes — le montant de l'ante (stocké comme `bb`, cf. finalize) suffit.
    parts.push(`${variantPrefix}bomb pot ${formatChipAmount(hand.blinds.bb, hand.gameType, undefined, hand.currency)}`);
  } else {
    // Un straddle (simple/double/triple) change le niveau de mise à suivre au-delà de la BB : la
    // dénomination doit le refléter ("5/10/25"), comme on écrirait "1/2/5" pour une table straddlée.
    const straddleAmounts = hand.actions
      .filter((a) => a.type === 'post-straddle')
      .sort((a, b) => a.order - b.order)
      .map((a) => a.amount ?? 0);
    // Blindes de tournoi abrégées comme partout ailleurs ("15M/30M", pas "15000000/30000000") —
    // c'est déjà ce qu'affiche l'écran de création juste avant de publier, et de même pour les
    // devises à grosse dénomination ("20k/40k₫"). La devise se pose une seule fois AUTOUR de la
    // dénomination entière ("2/5€", "$2/5"), d'où le format à la main plutôt que `formatChipAmount`,
    // qui l'accolerait à chacun de ses nombres.
    const abregeable = hand.gameType === 'tournament' || devise(hand.currency).abrege;
    const formatStake = (n: number) => (abregeable ? abbreviateChips(n) : String(n));
    const stakes = habillerDenomination(
      [hand.blinds.sb, hand.blinds.bb, ...straddleAmounts].map(formatStake).join('/'),
      hand.gameType,
      hand.currency
    );
    parts.push(`${variantPrefix}${stakes}`);
  }
  if (withLocation && post.location) parts.push(post.location);
  if (post.buyIn) parts.push(post.buyIn);
  if (post.level) parts.push(post.level);
  return parts.join(' · ');
}
