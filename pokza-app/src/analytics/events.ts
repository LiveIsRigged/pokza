/**
 * Événements analytics VOLONTAIREMENT explicites — pas d'autocapture (mesure d'audience minimale,
 * exemptée de consentement CNIL). Pour émettre un nouvel événement, ajoute d'abord son nom ici.
 */
export type AnalyticsEvent = 'signed_up' | 'hand_created' | 'report_submitted';

/** Propriétés simples attachées à un événement (jamais de données personnelles). */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
