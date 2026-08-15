import posthog from 'posthog-js';
import type { AnalyticsEvent, AnalyticsProps } from './events';

// Clé absente (bêta actuelle) → tout reste NO-OP : PostHog est dormant tant que
// EXPO_PUBLIC_POSTHOG_KEY n'est pas défini. Accès statique obligatoire pour l'inlining Expo.
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

/**
 * F-17 — la divergence entre production et local.
 *
 * La clé n'existe que dans les réglages de build Cloudflare, jamais dans le `.env` du Mac. La
 * mesure d'audience tourne donc en production et dort en développement — ce qui veut dire que ce
 * fichier n'est JAMAIS exercé pendant qu'on développe. Un évènement mal nommé, une propriété
 * oubliée, un appel placé au mauvais endroit : rien ne se voyait avant la mise en ligne.
 *
 * En développement et sans clé, on trace donc les évènements dans la console. **Rien n'est
 * envoyé nulle part** — c'est le chemin de code qui est parcouru, et on voit noir sur blanc ce
 * qui partirait en production. En production, `__DEV__` est faux : aucune trace, aucun coût.
 */
const TRACE = !KEY && __DEV__;

let ready = false;

/**
 * Initialise PostHog en mode « mesure d'audience exemptée de consentement » (CNIL) :
 * pas d'autocapture, pas de session replay, profils identifiés seulement, stockage 1st-party
 * (localStorage), pas de partage inter-sous-domaines. L'anonymisation d'IP et la rétention ≤13 mois
 * se règlent côté projet PostHog (dashboard), pas ici.
 */
export function initAnalytics(): void {
  if (ready) return;
  if (!KEY) {
    if (TRACE) {
      console.info(
        '[analytics] dormant — aucune EXPO_PUBLIC_POSTHOG_KEY. Les evenements seront traces ici, ' +
          'sans etre envoyes. En production la cle vient des reglages de build Cloudflare.'
      );
    }
    return;
  }
  posthog.init(KEY, {
    api_host: HOST,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    // Mesure d'audience STRICTE : on coupe aussi tout ce que PostHog active par défaut côté serveur
    // (web vitals, sondages, dead clicks, heatmaps, capture d'exceptions) — hors périmètre exemption.
    capture_performance: false,
    disable_surveys: true,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    person_profiles: 'identified_only',
    persistence: 'localStorage',
    cross_subdomain_cookie: false,
  });
  ready = true;
}

/** Lie les événements suivants à l'utilisateur connecté (son id Supabase, pas d'e-mail/pseudo). */
export function identifyUser(userId: string): void {
  if (!ready) {
    if (TRACE) console.info('[analytics] identify', userId);
    return;
  }
  posthog.identify(userId);
}

export function trackEvent(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!ready) {
    if (TRACE) console.info('[analytics] evenement', event, props ?? {});
    return;
  }
  posthog.capture(event, props);
}

/** À la déconnexion / suppression de compte : oublie l'identité locale (§9.5, volet client). */
export function resetAnalytics(): void {
  if (!ready) {
    if (TRACE) console.info('[analytics] reset');
    return;
  }
  posthog.reset();
}
