import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/theme';

/**
 * Bandeau « Installe Pokza » — web uniquement. Sur natif l'app est déjà installée : on ne rend rien.
 *
 * S'adapte tout seul :
 * - iPhone/Safari (pas encore installé) → guide (Partager → « Sur l'écran d'accueil »), car iOS
 *   n'expose AUCUNE API d'installation : impossible d'avoir un vrai bouton, on explique le geste.
 * - Android/Chrome (ou desktop Chrome) → vrai bouton « Installer » via l'événement
 *   `beforeinstallprompt` (pop-up native en un tap).
 * - Navigateur intégré (Instagram, Messenger…) → « Sur l'écran d'accueil » n'existe pas : on invite
 *   à rouvrir dans Safari/Chrome.
 * - Déjà installé (standalone) ou déjà refusé → rien.
 *
 * Astuce QA : `?install=ios|android|inapp` force l'affichage d'une variante pour prévisualiser.
 */

const DISMISS_KEY = 'pokza.installPromptDismissed';

type Mode = 'ios' | 'android' | 'inapp';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Hauteur, en pixels, que le bandeau occupe en bas de l'écran — 0 quand il n'est pas affiché.
 *
 * Le bandeau flotte PAR-DESSUS le contenu (`position: absolute`), ce qui l'avait fait recouvrir le
 * lien « Pas de compte ? Crée-en un » sur un écran de 375×812 : le tap atterrissait sur le bandeau,
 * et c'est le tout premier geste d'un nouveau venu — exactement le public à qui le bandeau
 * s'affiche. Plutôt que de masquer le bandeau sur l'écran de connexion (les testeurs doivent
 * justement installer l'app avant d'essayer, sur iOS les notifications n'existent que dans la PWA
 * installée), l'écran concerné réserve cette hauteur en bas et remonte son contenu d'autant.
 *
 * La valeur est MESURÉE (`onLayout`) et non écrite en dur : la carte change de hauteur selon le
 * message affiché, qui dépend lui-même du navigateur.
 */
const InstallPromptInsetContext = createContext(0);

export function useInstallPromptInset(): number {
  return useContext(InstallPromptInsetContext);
}

/**
 * Monte le bandeau au-dessus de `children` et publie la hauteur à réserver.
 * `Platform.OS` est constant pendant toute la vie de l'app : cette branche ne change jamais d'un
 * rendu à l'autre, l'ordre des hooks est donc stable.
 */
export function InstallPromptProvider({ children }: { children: React.ReactNode }) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return <InstallPromptWeb>{children}</InstallPromptWeb>;
}

function InstallPromptWeb({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('ios');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const cardId = useRef(`pokza-install-card-${Math.random().toString(36).slice(2)}`).current;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Prévisualisation QA : ?install=ios|android|inapp
    const forced = new URLSearchParams(window.location.search).get('install') as Mode | null;
    if (forced === 'ios' || forced === 'android' || forced === 'inapp') {
      setMode(forced);
      setVisible(true);
      return;
    }

    const standalone =
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return; // déjà installé

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      /* stockage indisponible (mode privé) : on affichera quand même */
    }
    if (dismissed) return;

    const ua = window.navigator.userAgent || '';
    const isInApp = /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|Pinterest|MicroMessenger/i.test(ua);
    const isIOS =
      /iPhone|iPad|iPod/.test(ua) ||
      (window.navigator.platform === 'MacIntel' && (window.navigator as Navigator).maxTouchPoints > 1);

    // Chrome (Android/desktop) émet cet événement quand l'app est installable : on le capte pour
    // proposer un vrai bouton, et on empêche la mini-infobar par défaut.
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setMode('android');
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isInApp) {
      setMode('inapp');
      setVisible(true);
    } else if (isIOS) {
      setMode('ios');
      setVisible(true);
    }
    // Sinon (Chrome sans signal encore) : on attend `beforeinstallprompt`.

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    dismiss();
  };

  const message =
    mode === 'android'
      ? "Ajoute Pokza à ton écran d'accueil en un tap."
      : mode === 'inapp'
        ? 'Ouvre ce lien dans Safari (ou Chrome) pour installer Pokza.'
        : 'Appuie sur le bouton Partager de Safari, puis « Sur l’écran d’accueil ».';

  // Distance entre le bas de l'écran et le bas de la carte.
  const gap = insets.bottom + 12;

  // ⚠️ Mesure via un vrai nœud DOM, PAS via `onLayout` : essayé, il ne se déclenche jamais sur
  // cette carte sous react-native-web, et la hauteur restait bloquée à 0 (donc aucune réserve).
  // C'est le même piège que dans `Turnstile.tsx` — une `ref` de `View` renvoie une instance interne
  // et non l'élément DOM ; `nativeID` produit un vrai attribut `id`, lui exploitable.
  // `ResizeObserver` plutôt qu'une mesure unique : la carte change de hauteur quand le message
  // change (iOS / Android / navigateur intégré) ou quand la largeur de la fenêtre la fait passer
  // sur deux lignes.
  useEffect(() => {
    if (!visible) {
      setCardHeight(0);
      return;
    }
    const el = typeof document === 'undefined' ? null : document.getElementById(cardId);
    if (!el) return;
    const mesurer = () => setCardHeight(el.getBoundingClientRect().height);
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(mesurer);
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, cardId, message]);

  return (
    <InstallPromptInsetContext.Provider value={visible ? gap + cardHeight : 0}>
      {children}
      {visible && (
        <View style={[styles.wrap, { bottom: gap }]} pointerEvents="box-none">
          <View nativeID={cardId} style={styles.card}>
            <Text style={styles.icon}>📲</Text>
            <View style={styles.body}>
              <Text style={styles.title}>Installe Pokza</Text>
              <Text style={styles.text}>{message}</Text>
            </View>
            {mode === 'android' ? (
              <Pressable style={styles.cta} onPress={install}>
                <Text style={styles.ctaText}>Installer</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.close} onPress={dismiss} hitSlop={8}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </View>
      )}
    </InstallPromptInsetContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    alignItems: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.tableFelt,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    fontSize: 22,
  },
  body: {
    flex: 1,
  },
  title: {
    color: colors.textOnFelt,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  text: {
    color: 'rgba(237,234,226,0.75)',
    fontSize: 12,
    lineHeight: 16,
  },
  cta: {
    backgroundColor: colors.action,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ctaText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  close: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  closeText: {
    color: 'rgba(237,234,226,0.7)',
    fontSize: 14,
    fontWeight: '700',
  },
});
