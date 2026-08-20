import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, spacing, tints } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { enablePush, disablePush, isDeviceSubscribed, pushState, pushSupported, type PushState } from '../web/push';
import { fetchNotificationPrefs, updateNotificationPrefs, type NotificationPrefs } from '../data/notificationPrefs';

const FAMILY_ROWS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'likes', label: "J'aime" },
  { key: 'comments', label: 'Commentaires et réponses' },
  { key: 'friends', label: 'Amis (demandes et acceptations)' },
  { key: 'groups', label: 'Groupes (invitations et acceptations)' },
  { key: 'posted', label: 'Mains partagées (amis et groupes)' },
];

interface NotificationSettingsScreenProps {
  userId: string;
  onBack: () => void;
}

/**
 * Détail des réglages de notifications, ouvert depuis la ligne unique « Notifications » de
 * `SettingsScreen` — l'appareil (on/off) et les 5 familles vivaient auparavant en clair dans
 * Réglages et occupaient à eux seuls plus de la moitié de l'écran ; ce détail n'est plus chargé
 * (ni ses deux appels réseau) tant qu'on ne l'ouvre pas.
 */
export function NotificationSettingsScreen({ userId, onBack }: NotificationSettingsScreenProps) {
  const [perm, setPerm] = useState<PushState>(() => pushState());
  // `null` = encore en cours de lecture de l'abonnement réel (cf. `isDeviceSubscribed`) : distinct
  // de la permission navigateur, qui elle ne redescend JAMAIS à `false` depuis le code.
  const [deviceOn, setDeviceOn] = useState<boolean | null>(null);
  const [togglingDevice, setTogglingDevice] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [savingFamily, setSavingFamily] = useState<keyof NotificationPrefs | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationPrefs(userId)
      .then((data) => {
        if (!cancelled) setPrefs(data);
      })
      .catch((err) => {
        if (!cancelled) setPrefsError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    isDeviceSubscribed().then((on) => {
      if (!cancelled) setDeviceOn(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggleDevice = async (on: boolean) => {
    setTogglingDevice(true);
    setPrefsError(null);
    try {
      if (on) {
        const result = await enablePush(userId);
        setPerm(result);
        setDeviceOn(result === 'granted');
      } else {
        await disablePush();
        setDeviceOn(false);
      }
    } catch (err) {
      setPrefsError(errorMessage(err));
    } finally {
      setTogglingDevice(false);
    }
  };

  const handleToggleFamily = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingFamily(key);
    setPrefsError(null);
    try {
      await updateNotificationPrefs(userId, { [key]: value });
    } catch (err) {
      setPrefs(previous);
      setPrefsError(errorMessage(err));
    } finally {
      setSavingFamily(null);
    }
  };

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>

        {pushSupported() ? (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Notifications sur cet appareil</Text>
              {perm === 'denied' ? (
                <Text style={styles.deniedHint}>Bloquées</Text>
              ) : (
                <Switch
                  value={!!deviceOn}
                  onValueChange={handleToggleDevice}
                  disabled={togglingDevice || deviceOn === null}
                  trackColor={{ false: tints.switchTrack, true: colors.action }}
                  thumbColor="#fff"
                  ios_backgroundColor={tints.switchTrack}
                  {...({ activeThumbColor: '#fff' } as object)}
                />
              )}
            </View>
            {perm === 'denied' && (
              <Text style={styles.hint}>
                Bloquées dans les réglages de ton navigateur — Pokza ne peut plus te les redemander directement.
              </Text>
            )}

            <Text style={styles.subLabel}>Recevoir un push pour…</Text>
            {FAMILY_ROWS.map((f) => (
              <View key={f.key} style={[styles.row, !deviceOn && styles.rowMuted]}>
                <Text style={styles.rowLabel}>{f.label}</Text>
                <Switch
                  value={prefs ? prefs[f.key] : true}
                  onValueChange={(v) => handleToggleFamily(f.key, v)}
                  // Éditer ces préférences n'a aucun effet tant que le push est coupé au niveau de
                  // l'appareil — les griser évite de laisser croire qu'elles font quelque chose.
                  disabled={!prefs || savingFamily === f.key || !deviceOn}
                  trackColor={{ false: tints.switchTrack, true: colors.action }}
                  thumbColor="#fff"
                  ios_backgroundColor={tints.switchTrack}
                  {...({ activeThumbColor: '#fff' } as object)}
                />
              </View>
            ))}
            {prefsError && <Text style={styles.error}>{prefsError}</Text>}
          </>
        ) : (
          <Text style={styles.hint}>Les notifications ne sont pas disponibles sur cet appareil.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.feedBackground,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 50,
    paddingBottom: 60,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 20,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
  },
  // 18px noir : le standard des écrans empilés (Mes groupes privés, Mes amis, Mes invitations,
  // Ajouter des amis, Informations légales, Signalements, Journal d'audit). Ces deux écrans de
  // réglages étaient les seuls à 22px bleu marine, sans raison apparente à la navigation.
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  subLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  rowMuted: {
    opacity: 0.4,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  deniedHint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.cardTextRed,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 17,
  },
  error: {
    color: colors.cardTextRed,
    fontSize: 13,
    marginTop: 10,
  },
});
