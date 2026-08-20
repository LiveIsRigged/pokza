import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../../theme/theme';
import type { IconProps } from './icons';

export interface ConfirmSheetProps {
  visible: boolean;
  /** Icône affichée dans le rond en tête de feuille (cf. `icons.tsx`) — même convention que
   *  celles d'`OverflowMenu`. La feuille lui impose sa propre teinte, rouge ou orange selon
   *  `destructive`, pour que le rond et le bouton de confirmation restent accordés. */
  icon: React.ComponentType<IconProps>;
  title: string;
  /** Explique la conséquence en une ligne (ex: « Elle ne verra plus les mains partagées ici… »).
   * Facultatif : certaines confirmations (déconnexion) n'ont rien à ajouter à la question. */
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Rouge (perte de données ou de relation) par défaut. `false` pour une action neutre (ex:
   * déconnexion), qui passe alors en orange (`colors.action`) plutôt qu'en rouge. */
  destructive?: boolean;
  /** Confirmation en cours (ex: suppression de compte) : le bouton de confirmation devient un
   * indicateur, les deux boutons se désactivent — jamais de double-appui ni de fermeture pendant
   * l'envoi. */
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Feuille remontant du bas, à l'ancre fixe (contrairement à l'ancienne rangée « Non / Oui » inline,
 * qui apparaissait là où était le bouton déclencheur — hors champ si l'écran avait défilé). Seul
 * point d'entrée pour toute confirmation destructrice de l'app : un texte + deux boutons pleine
 * largeur, visible et identique partout, plutôt qu'une variante par écran.
 */
export function ConfirmSheet({
  visible,
  icon: Icon,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  destructive = true,
  loading = false,
  onCancel,
  onConfirm,
}: ConfirmSheetProps) {
  const anim = useRef(new Animated.Value(0)).current;
  // Reste monté le temps de l'animation de fermeture (sinon la feuille disparaît d'un coup).
  const [rendered, setRendered] = useState(visible);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) setRendered(true);
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setRendered(false);
    });
  }, [visible, anim]);

  if (!rendered) return null;

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
  const tint = destructive ? colors.cardTextRed : colors.action;
  const tintBg = destructive ? 'rgba(192,57,43,0.1)' : 'rgba(232,87,31,0.1)';

  return (
    <Modal visible transparent animationType="none" onRequestClose={onCancel}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill as any} onPress={loading ? undefined : onCancel} />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          { paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.sm), transform: [{ translateY }] },
        ]}
      >
        <View style={styles.grabber} />
        <View style={[styles.iconCircle, { backgroundColor: tintBg }]}>
          <Icon size={24} color={tint} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {message && <Text style={styles.message}>{message}</Text>}
        <Pressable
          style={[styles.confirmButton, { backgroundColor: tint }, loading && styles.buttonDisabled]}
          onPress={onConfirm}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>{confirmLabel}</Text>}
        </Pressable>
        <Pressable
          style={[styles.cancelButton, loading && styles.buttonDisabled]}
          onPress={onCancel}
          disabled={loading}
        >
          <Text style={styles.cancelText}>{cancelLabel}</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: 'rgba(14,24,48,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.feedBackground,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: 'rgba(22,35,61,0.15)',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  confirmButton: {
    width: '100%',
    height: 46,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  cancelButton: {
    width: '100%',
    height: 46,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  cancelText: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
