import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { colors, radius, spacing } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { LegalScreen } from '../legal/LegalScreen';
import type { LegalDocId } from '../legal/legalContent';
import { deleteOwnAccount } from '../data/profiles';
import { supabase } from '../lib/supabase';
import { enablePush, disablePush, pushState, pushSupported, type PushState } from '../web/push';
import {
  fetchNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
} from '../data/notificationPrefs';
import appJson from '../../app.json';

const CONTACT_EMAIL = 'contact@pokza.app';

const FAMILY_ROWS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'likes', label: "J'aime" },
  { key: 'comments', label: 'Commentaires et réponses' },
  { key: 'friends', label: 'Amis' },
  { key: 'groups', label: 'Groupes' },
];

interface SettingsScreenProps {
  userId: string;
  onBack: () => void;
  onOpenBlocked: () => void;
}

/**
 * Écran Réglages, ouvert depuis le menu latéral. Regroupe ce qui était jusqu'ici dispersé :
 * l'activation du push (bannière du panneau Notifications, qui ne permettait pas de le COUPER une
 * fois accordé), les comptes bloqués et la suppression de compte (« Modifier mon profil »), et les
 * informations légales (entrée à part entière du menu). Décisions verrouillées le 16/08 : les
 * interrupteurs par famille ne filtrent QUE le push (l'historique in-app reste complet), pas de
 * réglage de confidentialité du profil, pas de thème sombre.
 */
export function SettingsScreen({ userId, onBack, onOpenBlocked }: SettingsScreenProps) {
  const [perm, setPerm] = useState<PushState>(() => pushState());
  const [togglingDevice, setTogglingDevice] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [savingFamily, setSavingFamily] = useState<keyof NotificationPrefs | null>(null);

  const [legalOpen, setLegalOpen] = useState(false);
  const [legalInitialDocId, setLegalInitialDocId] = useState<LegalDocId | undefined>(undefined);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const handleToggleDevice = async (on: boolean) => {
    setTogglingDevice(true);
    setPrefsError(null);
    try {
      if (on) {
        setPerm(await enablePush(userId));
      } else {
        await disablePush();
        setPerm(pushState());
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

  const openLegalIndex = () => {
    setLegalInitialDocId(undefined);
    setLegalOpen(true);
  };
  const openJeuResponsable = () => {
    setLegalInitialDocId('jeu-responsable');
    setLegalOpen(true);
  };

  const handleDeleteAccount = async () => {
    setDeleteError(null);
    setDeletingAccount(true);
    try {
      await deleteOwnAccount(userId);
      await supabase.auth.signOut();
    } catch (err) {
      setDeletingAccount(false);
      setConfirmingDelete(false);
      setDeleteError(errorMessage(err));
    }
  };

  if (legalOpen) {
    return <LegalScreen initialDocId={legalInitialDocId} onBack={() => setLegalOpen(false)} />;
  }

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Réglages</Text>
        </View>

        <Text style={styles.sectionTitle}>Notifications</Text>

        {pushSupported() ? (
          <>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Notifications sur cet appareil</Text>
              {perm === 'denied' ? (
                <Text style={styles.deniedHint}>Bloquées</Text>
              ) : (
                <Switch
                  value={perm === 'granted'}
                  onValueChange={handleToggleDevice}
                  disabled={togglingDevice}
                  trackColor={{ false: 'rgba(22,35,61,0.18)', true: colors.action }}
                  thumbColor="#fff"
                  ios_backgroundColor="rgba(22,35,61,0.18)"
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
              <View key={f.key} style={styles.row}>
                <Text style={styles.rowLabel}>{f.label}</Text>
                <Switch
                  value={prefs ? prefs[f.key] : true}
                  onValueChange={(v) => handleToggleFamily(f.key, v)}
                  disabled={!prefs || savingFamily === f.key}
                  trackColor={{ false: 'rgba(22,35,61,0.18)', true: colors.action }}
                  thumbColor="#fff"
                  ios_backgroundColor="rgba(22,35,61,0.18)"
                  {...({ activeThumbColor: '#fff' } as object)}
                />
              </View>
            ))}
            {prefsError && <Text style={styles.error}>{prefsError}</Text>}
          </>
        ) : (
          <Text style={styles.hint}>Les notifications ne sont pas disponibles sur cet appareil.</Text>
        )}

        <Text style={styles.sectionTitle}>Confidentialité</Text>
        <Pressable style={styles.linkRow} onPress={onOpenBlocked}>
          <Text style={styles.linkRowLabel}>Comptes bloqués</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>À propos</Text>
        <Pressable style={styles.linkRow} onPress={openJeuResponsable}>
          <Text style={styles.linkRowLabel}>Jeu responsable</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={openLegalIndex}>
          <Text style={styles.linkRowLabel}>Informations légales</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
          <Text style={styles.linkRowLabel}>Signaler un problème</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>Pokza {appJson.expo.version}</Text>
        </View>

        {deleteError && <Text style={styles.error}>{deleteError}</Text>}

        <View style={styles.dangerZone}>
          <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8}>
            <Text style={styles.deleteLink}>Supprimer mon compte</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={confirmingDelete}
        icon="🗑"
        title="Supprimer ton compte ?"
        message="Ton compte, tes mains et tes commentaires seront définitivement supprimés."
        confirmLabel="Supprimer définitivement"
        loading={deletingAccount}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDeleteAccount}
      />
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.tableFelt,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 6,
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
    borderBottomColor: 'rgba(22,35,61,0.15)',
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
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(22,35,61,0.15)',
  },
  linkRowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  linkRowChevron: {
    fontSize: 20,
    color: colors.textSecondary,
  },
  versionRow: {
    paddingVertical: 14,
  },
  versionText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  dangerZone: {
    marginTop: 32,
    alignItems: 'center',
  },
  deleteLink: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
