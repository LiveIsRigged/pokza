import React, { useEffect, useState } from 'react';
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

export function InstallPrompt() {
  if (Platform.OS !== 'web') return null;
  return <InstallPromptWeb />;
}

function InstallPromptWeb() {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<Mode>('ios');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

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

  if (!visible) return null;

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

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 12 }]} pointerEvents="box-none">
      <View style={styles.card}>
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
