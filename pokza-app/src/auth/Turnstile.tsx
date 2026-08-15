// Widget Cloudflare Turnstile (CAPTCHA)
// =====================================
// Remplace la confirmation par e-mail à l'inscription : sans lui, n'importe qui peut créer des
// comptes en boucle avec des adresses inventées, et marteler la connexion pour tester des mots
// de passe. Turnstile est gratuit et sans quota, contrairement à l'envoi d'e-mails.
//
// ⚠️ TROIS PIÈGES, dans l'ordre où ils mordent :
//
// 1. Le réglage CAPTCHA de Supabase est au niveau du PROJET, pas du client. Dès qu'il est activé
//    dans le dashboard, les TROIS points d'entrée (inscription, connexion, mot de passe oublié)
//    doivent envoyer un jeton, sinon plus personne ne se connecte. C'est pour ça que ce composant
//    est branché aux trois endroits dans AuthScreen, et pas seulement à l'inscription.
//
// 2. Un jeton Turnstile est à USAGE UNIQUE. Après chaque tentative — réussie ou non — il faut
//    réinitialiser le widget, sinon la deuxième tentative échoue avec une erreur incompréhensible
//    (« captcha protection: request disallowed »). D'où la méthode `reset()` exposée ici.
//
// 3. Si la clé publique n'est pas renseignée (EXPO_PUBLIC_TURNSTILE_SITE_KEY vide), ce composant
//    ne rend rien et ne bloque rien. C'est volontaire : le développement local et le projet DEV
//    continuent de fonctionner sans configurer Cloudflare. Le jour où le CAPTCHA est activé côté
//    Supabase, il FAUT renseigner la clé — sinon l'authentification est cassée en production.
//
// NATIF : Turnstile n'a pas de SDK React Native. Sur iOS/Android ce composant ne rend rien. Le
// jour où l'app part sur les stores, il faudra l'implémenter via une WebView, SINON l'app native
// ne pourra plus s'authentifier du tout (cf. piège n°1 : le réglage est côté projet).

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, View } from 'react-native';

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** Le CAPTCHA n'est actif que sur le web et seulement si une clé publique est configurée. */
export const captchaEnabled = Platform.OS === 'web' && SITE_KEY.length > 0;

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

function turnstileApi(): TurnstileApi | undefined {
  return (globalThis as { turnstile?: TurnstileApi }).turnstile;
}

// Le script n'est chargé qu'à l'affichage de l'écran de connexion, pas au démarrage de l'app :
// inutile d'imposer un script tiers à quelqu'un qui est déjà connecté. La promesse est mise en
// cache au niveau du module pour qu'un aller-retour connexion ↔ inscription ne le recharge pas.
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (turnstileApi()) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null; // permet une nouvelle tentative au prochain montage
        reject(new Error('Turnstile injoignable'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

export interface TurnstileHandle {
  /** À appeler après CHAQUE tentative d'authentification : le jeton précédent est brûlé. */
  reset: () => void;
}

interface Props {
  /** Reçoit le jeton, ou `null` quand il expire / est réinitialisé. */
  onToken: (token: string | null) => void;
  /** Appelé si le widget ne peut pas se charger (réseau, bloqueur de scripts). */
  onError?: (message: string) => void;
}

export const Turnstile = forwardRef<TurnstileHandle, Props>(function Turnstile(
  { onToken, onError },
  ref,
) {
  // On cible le conteneur par son `id` DOM plutôt que par une ref React : sous react-native-web,
  // la ref d'une `View` renvoie une instance interne, pas l'élément DOM que Turnstile attend
  // (vérifié — `render()` ne créait aucun widget). `nativeID` produit un vrai attribut `id`.
  const domId = useRef(`turnstile-${Math.random().toString(36).slice(2)}`).current;
  const widgetId = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Les rappels sont lus via une ref : le widget Turnstile est monté une seule fois, et on ne veut
  // pas le détruire/recréer à chaque re-rendu du formulaire (chaque recréation coûte un challenge).
  const callbacks = useRef({ onToken, onError });
  callbacks.current = { onToken, onError };

  useImperativeHandle(ref, () => ({
    reset: () => {
      const api = turnstileApi();
      if (api && widgetId.current) {
        api.reset(widgetId.current);
        callbacks.current.onToken(null);
      }
    },
  }));

  useEffect(() => {
    if (!captchaEnabled) return;
    let cancelled = false;

    loadScript()
      .then(() => {
        const api = turnstileApi();
        const el = document.getElementById(domId);
        if (cancelled || !api || !el || widgetId.current) return;

        widgetId.current = api.render(el, {
          sitekey: SITE_KEY,
          language: 'fr',
          callback: (token: string) => callbacks.current.onToken(token),
          // Un jeton Turnstile expire au bout de 5 minutes. Sans ce rappel, un formulaire laissé
          // ouvert enverrait un jeton périmé et l'utilisateur verrait un refus inexplicable.
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () => callbacks.current.onToken(null),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
        callbacks.current.onError?.(
          "La vérification anti-robot n'a pas pu se charger. Vérifie ta connexion ou désactive ton bloqueur de scripts.",
        );
      });

    return () => {
      cancelled = true;
      const api = turnstileApi();
      if (api && widgetId.current) {
        api.remove(widgetId.current);
        widgetId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!captchaEnabled || failed) return null;

  // `minHeight` réserve la place du widget avant son affichage, pour éviter que le bouton
  // « Se connecter » ne saute sous le doigt au moment où le challenge apparaît.
  return <View nativeID={domId} style={{ minHeight: 65, marginBottom: 12 }} />;
});
