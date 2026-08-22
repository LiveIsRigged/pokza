import type { AnalyticsEvent, AnalyticsProps } from './events';

/**
 * Implémentation NO-OP par défaut : utilisée sur natif (pas encore de SDK) et comme source des
 * types pour les sites d'appel. L'implémentation web réelle (posthog-js) vit dans `index.web.ts`
 * et est résolue automatiquement par Metro sur la cible web. Les signatures DOIVENT rester
 * identiques entre les deux fichiers.
 */
export function initAnalytics(): void {}
export function trackEvent(_event: AnalyticsEvent, _props?: AnalyticsProps): void {}
export function resetAnalytics(): void {}
