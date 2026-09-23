import React, { useEffect, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { trackEvent } from '../analytics';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { BackButton } from '../components/ui/HeaderButton';
import { borders, colors, hitSlopPairLeft, hitSlopPairRight, radius, SCREEN_TOP, spacing } from '../theme/theme';
import { Avatar } from '../components/ui/Avatar';
import {
  acceptFriendRequest,
  deleteFriendRelation,
  fetchPendingRequests,
  type PendingRequest,
} from '../data/friends';
import { acceptGroupInvite, fetchPendingGroupInvites, removeGroupMember, type PendingGroupInvite } from '../data/groups';
import { GroupTableIcon } from '../components/ui/icons';
import { PastilleEtat } from '../components/ui/PastilleEtat';
import { ConfirmSheet } from '../components/ui/ConfirmSheet';
import { useT } from '../i18n';

interface InvitationsScreenProps {
  currentUserId: string;
  onBack: () => void;
  onSelectProfile: (profileId: string) => void;
  /** Prévient App.tsx qu'une invitation vient d'être traitée, pour rafraîchir le badge du menu
   * latéral sans attendre le prochain retour au premier plan de l'app. */
  onInvitationHandled: () => void;
}

/**
 * Vue dédiée aux demandes en attente (amis + groupes privés), séparée du flux Notifications qui
 * les noie parmi likes/commentaires — accessible depuis le menu latéral avec un badge de
 * comptage. Reprend exactement la logique d'acceptation/refus déjà éprouvée dans
 * `NotificationsScreen` (mêmes fonctions data), juste regroupée par type plutôt qu'en flux
 * chronologique unique.
 */
export function InvitationsScreen({ currentUserId, onBack, onSelectProfile, onInvitationHandled }: InvitationsScreenProps) {
  const t = useT();
  const [friendRequests, setFriendRequests] = useState<PendingRequest[]>([]);
  const [groupInvites, setGroupInvites] = useState<PendingGroupInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Une demande traitée RESTE dans la liste, sa pastille à la place des boutons (« ✓ Amis »,
  // « ✓ Membre », « Refusé ») : la ligne qui disparaissait laissait croire que rien n'était fait. Le
  // temps de l'écran seulement : la liste ne recharge que les demandes encore en attente. Clés
  // préfixées, pour qu'un id de profil et un id de groupe ne se confondent jamais.
  const [outcomes, setOutcomes] = useState<Map<string, 'accepted' | 'declined'>>(new Map());
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  // Refuser une invitation de GROUPE passe par une feuille : après un refus, les membres ne pourront
  // plus réinviter, seul le fondateur le pourra (Victor, 17/09/2026). L'invitation visée survit à la
  // fermeture, la feuille met 220 ms à redescendre.
  const [refusCible, setRefusCible] = useState<PendingGroupInvite | null>(null);
  const [refusOpen, setRefusOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchPendingRequests(currentUserId), fetchPendingGroupInvites(currentUserId)])
      .then(([requests, invites]) => {
        if (cancelled) return;
        setFriendRequests(requests);
        setGroupInvites(invites);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  // La pastille n'apparaît qu'une fois la réponse du serveur arrivée ; en attendant, les deux boutons
  // s'estompent et ne reprennent pas d'appui.
  const handle = async (key: string, outcome: 'accepted' | 'declined', action: () => Promise<void>) => {
    setError(null);
    setBusyKeys((s) => new Set(s).add(key));
    try {
      await action();
      // La clé dit déjà de quoi il s'agit (« ami:… » / « groupe:… ») : on ne compte que les
      // demandes d'ami, les invitations de groupe ont leur propre mesure quand elles arriveront.
      if (key.startsWith('ami:')) {
        trackEvent('demande_ami_traitee', {
          issue: outcome === 'accepted' ? 'acceptee' : 'refusee',
          lieu: 'invitations',
        });
      }
      setOutcomes((m) => new Map(m).set(key, outcome));
      onInvitationHandled();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyKeys((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    }
  };

  const renderActions = (key: string, libelleAccepte: string, onDecline: () => void, onAccept: () => void) => {
    const outcome = outcomes.get(key);
    if (outcome) return <PastilleEtat label={outcome === 'accepted' ? libelleAccepte : t('invitations.etat_refuse')} />;
    const busy = busyKeys.has(key);
    return (
      <View style={[styles.actions, busy && styles.actionsBusy]}>
        <Pressable style={styles.declineButton} onPress={onDecline} disabled={busy} hitSlop={hitSlopPairLeft}>
          <Text style={styles.declineButtonText}>{t('commun.refuser')}</Text>
        </Pressable>
        <Pressable style={styles.acceptButton} onPress={onAccept} disabled={busy} hitSlop={hitSlopPairRight}>
          <Text style={styles.acceptButtonText}>{t('commun.accepter')}</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>{t('menu.mes_invitations')}</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <Text style={styles.statusText}>{t('commun.chargement')}</Text>
        ) : (
          <>
            {/* Les deux sections restent affichées même vides : sans elles, un écran qui ne dit que
                « aucune invitation » n'apprend pas ce qu'il est censé contenir. */}
            <Text style={styles.sectionTitle}>{t('invitations.demandes_ami')}</Text>
            {friendRequests.length === 0 ? (
              <Text style={styles.sectionEmpty}>{t('invitations.aucune_demande')}</Text>
            ) : (
              friendRequests.map((req) => (
                <View key={req.senderId} style={styles.row}>
                  <Pressable style={styles.rowInfo} onPress={() => onSelectProfile(req.senderId)}>
                    <Avatar url={req.senderAvatarUrl} name={req.senderDisplayName} size={36} />
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {req.senderDisplayName}
                    </Text>
                  </Pressable>
                  {renderActions(
                    `ami:${req.senderId}`,
                    t('profil.deja_amis'),
                    () => void handle(`ami:${req.senderId}`, 'declined', () => deleteFriendRelation(currentUserId, req.senderId)),
                    () => void handle(`ami:${req.senderId}`, 'accepted', () => acceptFriendRequest(req.senderId, currentUserId))
                  )}
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>{t('invitations.groupes_prives')}</Text>
            {groupInvites.length === 0 ? (
              <Text style={styles.sectionEmpty}>{t('invitations.aucune_invitation')}</Text>
            ) : (
              groupInvites.map((invite) => (
                <View key={invite.groupId} style={styles.row}>
                  <View style={styles.rowInfo}>
                    <View style={styles.groupIconBubble}>
                      <GroupTableIcon size={16} color={colors.textSecondary} />
                    </View>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {invite.groupName}
                    </Text>
                  </View>
                  {renderActions(
                    `groupe:${invite.groupId}`,
                    t('invitations.etat_membre'),
                    () => {
                      setRefusCible(invite);
                      setRefusOpen(true);
                    },
                    () => void handle(`groupe:${invite.groupId}`, 'accepted', () => acceptGroupInvite(invite.groupId, currentUserId))
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={refusOpen}
        icon={GroupTableIcon}
        title={t('groupe.refuser_titre', { groupe: refusCible?.groupName ?? '?' })}
        message={t('groupe.refuser_message', { nom: refusCible?.ownerName ?? '?' })}
        confirmLabel={t('commun.refuser')}
        cancelLabel={t('commun.annuler')}
        // Orange : le fondateur peut réinviter, on peut donc revenir dessus.
        destructive={false}
        loading={!!refusCible && busyKeys.has(`groupe:${refusCible.groupId}`)}
        onCancel={() => setRefusOpen(false)}
        onConfirm={async () => {
          if (!refusCible) return;
          const groupId = refusCible.groupId;
          await handle(`groupe:${groupId}`, 'declined', () => removeGroupMember(groupId, currentUserId));
          setRefusOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: SCREEN_TOP,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: 14,
    paddingBottom: 40,
  },
  statusText: {
    marginTop: 20,
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  sectionEmpty: {
    fontSize: 14,
    color: colors.textSecondary,
    paddingVertical: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 6,
  },
  row: {
    // Écart entre le bloc « profil » (étiré, cf. `flex: 1`) et le bouton d'action : au moins le
    // débordement de sa zone de touche (`HIT_SLOP`), sinon elle mord sur le bloc profil.
    gap: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  rowInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  groupIconBubble: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tableFelt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupIconText: {
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // Réponse du serveur en attente : même estompe qu'« Inviter » pendant son envoi.
  actionsBusy: {
    opacity: 0.6,
  },
  declineButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  declineButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  acceptButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  acceptButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
});
