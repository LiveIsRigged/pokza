/**
 * Événements analytics VOLONTAIREMENT explicites — pas d'autocapture (mesure d'audience minimale,
 * exemptée de consentement CNIL). Pour émettre un nouvel événement, ajoute d'abord son nom ici.
 */
export type AnalyticsEvent =
  | 'signed_up'
  | 'hand_created'
  | 'hand_corrected'
  /** Republication d'une copie devant une autre audience — la sortie de secours du verrou
   *  d'audience. Sa fréquence dit si l'interdiction de changer de public gêne vraiment. */
  | 'hand_duplicated'
  | 'report_submitted';

/** Propriétés simples attachées à un événement (jamais de données personnelles). */
export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;
