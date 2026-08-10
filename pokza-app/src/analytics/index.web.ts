import posthog from 'posthog-js';
import type { AnalyticsEvent, AnalyticsProps } from './events';

// Clé absente (bêta actuelle) → tout reste NO-OP : PostHog est dormant tant que
// EXPO_PUBLIC_POSTHOG_KEY n'est pas défini. Accès statique obligatoire pour l'inlining Expo.
const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

let ready = false;

/**
 * Initialise PostHog en mode « mesure d'audience exemptée de consentement » (CNIL) :
 * pas d'autocapture, pas de session replay, profils identifiés seulement, stockage 1st-party
 * (localStorage), pas de partage inter-sous-domaines. L'anonymisation d'IP et la rétention ≤13 mois
 * se règlent côté projet PostHog (dashboard), pas ici.
 */
export function initAnalytics(): void {
  if (ready || !KEY) return;
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
  if (!ready) return;
  posthog.identify(userId);
}

export function trackEvent(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (!ready) return;
  posthog.capture(event, props);
}

/** À la déconnexion / suppression de compte : oublie l'identité locale (§9.5, volet client). */
export function resetAnalytics(): void {
  if (!ready) return;
  posthog.reset();
}
