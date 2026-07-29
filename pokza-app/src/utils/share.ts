import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { webOrigin } from '../navigation/deepLink';

/** Origine sur laquelle bâtir les liens partagés (`/invite/:id`, `/post/:id`), désormais gérés par
 * le routage web au chargement de l'app — cf. `navigation/deepLink`. En dev c'est l'URL localhost,
 * en prod le domaine déployé, résolu à l'exécution. */
export const POKZA_WEB_ORIGIN = webOrigin();

export interface ShareContent {
  title: string;
  message: string;
  url: string;
}

export type ShareOutcome = 'shared' | 'copied' | 'unavailable' | 'cancelled';

/**
 * `Share.share` ouvre le partage natif (WhatsApp, Discord, Messages…) sur mobile, et la boîte de
 * partage du navigateur sur web mobile. Sur desktop, où `navigator.share` n'existe pas,
 * react-native-web rejette avec un message précis ("not supported") — c'est le SEUL cas où on
 * bascule sur un copier-coller silencieux ; si la personne annule un vrai partage (autre rejet),
 * on ne fait rien, comme n'importe quel bouton de partage standard.
 */
export async function shareOrCopy(content: ShareContent): Promise<ShareOutcome> {
  try {
    await Share.share(content);
    return 'shared';
  } catch (err) {
    const notSupported = err instanceof Error && err.message.includes('not supported');
    if (!notSupported) return 'cancelled';
    try {
      await Clipboard.setStringAsync(`${content.message}\n${content.url}`);
      return 'copied';
    } catch {
      return 'unavailable';
    }
  }
}
