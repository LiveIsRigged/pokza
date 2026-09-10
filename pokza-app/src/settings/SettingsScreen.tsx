import React, { useImperativeHandle, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing } from '../theme/theme';
import { errorMessage } from '../utils/errorMessage';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { LegalScreen } from '../legal/LegalScreen';
import { NotificationSettingsScreen } from './NotificationSettingsScreen';
import { LanguageSettingsScreen } from './LanguageSettingsScreen';
import { deleteOwnAccount } from '../data/profiles';
import { supabase } from '../lib/supabase';
import appJson from '../../app.json';
import { TrashIcon } from '../components/ui/icons';
import { useT } from '../i18n';

const CONTACT_EMAIL = 'contact@pokza.app';

interface SettingsScreenProps {
  userId: string;
  onBack: () => void;
  onOpenBlocked: () => void;
}

export interface SettingsScreenHandle {
  /**
   * Ferme le panneau ouvert par-dessus Réglages (document légal ou détail des notifications) s'il y
   * en a un, et renvoie `true` dans ce cas. `App.tsx` s'en sert pour le glissement de bord
   * (`Screen`) : ces panneaux sont des overlays LOCAUX à `SettingsScreen`, invisibles du geste
   * attaché bien plus haut autour de tout l'écran — sans ce relais, le glissement saute directement
   * au feed au lieu de refermer d'abord le panneau (même bug déjà corrigé pour `GroupScreen`, cf.
   * `GroupScreenHandle`).
   */
  handleBack: () => boolean;
}

/**
 * Écran Réglages, ouvert depuis le menu latéral. Regroupe ce qui était jusqu'ici dispersé : les
 * notifications (détail dans son propre écran, cf. `NotificationSettingsScreen` — sinon l'appareil
 * et les 5 familles à eux seuls occupaient plus de la moitié de la page), les comptes bloqués et la
 * suppression de compte (« Modifier mon profil »), et les informations légales (entrée à part
 * entière du menu). Décisions verrouillées le 16/08 : les interrupteurs par famille ne filtrent QUE
 * le push (l'historique in-app reste complet), pas de réglage de confidentialité du profil, pas de
 * thème sombre.
 */
export const SettingsScreen = React.forwardRef<SettingsScreenHandle, SettingsScreenProps>(function SettingsScreen(
  { userId, onBack, onOpenBlocked },
  ref
) {
  const t = useT();
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [languageOpen, setLanguageOpen] = useState(false);

  const [legalOpen, setLegalOpen] = useState(false);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      handleBack: () => {
        if (notificationsOpen) {
          setNotificationsOpen(false);
          return true;
        }
        if (languageOpen) {
          setLanguageOpen(false);
          return true;
        }
        if (legalOpen) {
          setLegalOpen(false);
          return true;
        }
        return false;
      },
    }),
    [notificationsOpen, languageOpen, legalOpen]
  );

  const openLegalIndex = () => setLegalOpen(true);

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

  if (notificationsOpen) {
    return <NotificationSettingsScreen userId={userId} onBack={() => setNotificationsOpen(false)} />;
  }

  if (languageOpen) {
    return <LanguageSettingsScreen onBack={() => setLanguageOpen(false)} />;
  }

  if (legalOpen) {
    return <LegalScreen onBack={() => setLegalOpen(false)} />;
  }

  return (
    <View style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topRow}>
          <Pressable onPress={onBack} hitSlop={8}>
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('reglages.titre')}</Text>
        </View>

        <Text style={styles.sectionTitle}>{t('reglages.section_notifications')}</Text>
        <Pressable style={styles.linkRow} onPress={() => setNotificationsOpen(true)}>
          <Text style={styles.linkRowLabel}>{t('reglages.ligne_notifications')}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('reglages.section_langue')}</Text>
        <Pressable style={styles.linkRow} onPress={() => setLanguageOpen(true)}>
          <Text style={styles.linkRowLabel}>{t('reglages.ligne_langue')}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('reglages.section_confidentialite')}</Text>
        <Pressable style={styles.linkRow} onPress={onOpenBlocked}>
          <Text style={styles.linkRowLabel}>{t('reglages.ligne_comptes_bloques')}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>

        <Text style={styles.sectionTitle}>{t('reglages.section_a_propos')}</Text>
        <Pressable style={styles.linkRow} onPress={openLegalIndex}>
          <Text style={styles.linkRowLabel}>{t('reglages.ligne_informations_legales')}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        <Pressable style={styles.linkRow} onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}`)}>
          <Text style={styles.linkRowLabel}>{t('reglages.ligne_signaler_probleme')}</Text>
          <Text style={styles.linkRowChevron}>›</Text>
        </Pressable>
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>{t('reglages.version', { version: appJson.expo.version })}</Text>
        </View>

        {deleteError && <Text style={styles.error}>{deleteError}</Text>}

        <View style={styles.dangerZone}>
          <Pressable onPress={() => setConfirmingDelete(true)} hitSlop={8}>
            <Text style={styles.deleteLink}>{t('reglages.supprimer_mon_compte')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={confirmingDelete}
        icon={TrashIcon}
        title={t('reglages.suppression_titre')}
        message={t('reglages.suppression_message')}
        confirmLabel={t('reglages.suppression_bouton')}
        loading={deletingAccount}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={handleDeleteAccount}
      />
    </View>
  );
});

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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 24,
    marginBottom: 6,
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
    borderBottomColor: borders.hairline,
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
