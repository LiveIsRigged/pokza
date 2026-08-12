import { Platform } from 'react-native';

/**
 * Web uniquement. Expo (bundler Metro, app single-page) ne génère qu'un `<head>` minimal : ni
 * manifest, ni icône d'accueil iOS, ni balises « app plein écran ». On les injecte donc au démarrage.
 *
 * Pourquoi au runtime plutôt qu'en HTML statique : le CLI Expo n'expose pas de template `<head>`
 * pour une app non-router, et le build Cloudflare peut appeler `expo export` directement (sans passer
 * par un script post-build). L'injection JS, elle, part avec le bundle quel que soit le build. iOS lit
 * le DOM COURANT au moment du « Sur l'écran d'accueil » (après chargement), donc les balises injectées
 * sont bien prises en compte pour l'icône et le nom du raccourci.
 *
 * NB : le passage en plein écran SOUS la barre d'état (viewport-fit=cover + status-bar-style
 * black-translucent) est volontairement laissé à la phase « edge-to-edge » — il impose que tous les
 * écrans gèrent l'inset du haut. Ici on reste en `default` (bande d'état classique).
 */

const THEME_COLOR = '#EDEAE2'; // parchemin, cohérent avec le fond de l'app

function upsertMeta(name: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertLink(rel: string, href: string, attrs: Record<string, string> = {}) {
  const sizesSel = attrs.sizes ? `[sizes="${attrs.sizes}"]` : '';
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]${sizesSel}`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
}

export function installPwaMeta() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  document.title = 'Pokza';

  upsertLink('manifest', '/manifest.json');
  upsertLink('apple-touch-icon', '/icons/apple-touch-icon.png', { sizes: '180x180' });
  upsertLink('icon', '/icons/icon-192.png', { type: 'image/png', sizes: '192x192' });

  // App installable + plein écran (Android via manifest `display`, iOS via ces meta).
  upsertMeta('apple-mobile-web-app-capable', 'yes');
  upsertMeta('mobile-web-app-capable', 'yes');
  upsertMeta('apple-mobile-web-app-title', 'Pokza');
  upsertMeta('apple-mobile-web-app-status-bar-style', 'default');
  upsertMeta('application-name', 'Pokza');
  upsertMeta('theme-color', THEME_COLOR);
}
