import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing } from '../theme/theme';
import { Chip } from '../creator/Chip';
import { NewGroupForm } from './NewGroupForm';
import type { Group } from '../data/groups';

/**
 * Au-delà de ce nombre, la rangée cesse d'être lisible d'un coup d'œil et repousse le bouton de
 * l'écran : mesuré sur iPhone (339 px utiles), 6 chips font 3 lignes en noms courants et 6 lignes
 * en noms longs. On bascule alors sur les derniers utilisés + le sélecteur complet.
 * Valeurs produit arbitrées le 2026-08-21.
 */
const INLINE_GROUPS_MAX = 6;
const RECENT_GROUPS_SHOWN = 4;

interface GroupChoiceProps {
  /** Déjà ordonnés, le plus récemment utilisé en tête (cf. `orderGroupsByLastUsed`). */
  groups: Group[];
  selectedId?: string;
  onSelect: (groupId: string) => void;
  /** Crée le groupe et renvoie son id. Lève en cas d'échec — le formulaire affiche le message. */
  onCreateGroup: (name: string) => Promise<string>;
  /** Ouvre le sélecteur plein écran (recherche + liste complète + création). */
  onOpenPicker: () => void;
}

/** Le groupe sélectionné doit rester visible : sans ça, en choisir un dans le sélecteur le ferait
 *  disparaître de la rangée dès la fermeture, et l'auteur publierait sans voir sa destination. */
function visibleGroups(groups: Group[], selectedId?: string): Group[] {
  const recent = groups.slice(0, RECENT_GROUPS_SHOWN);
  if (!selectedId || recent.some((g) => g.id === selectedId)) return recent;
  const selected = groups.find((g) => g.id === selectedId);
  if (!selected) return recent;
  return [selected, ...recent.slice(0, RECENT_GROUPS_SHOWN - 1)];
}

/**
 * Choix du groupe de destination d'une main. Partagé entre l'étape « Publier » du créateur et la
 * modification d'une main, qui avaient jusqu'ici deux copies divergentes du même bloc.
 */
export function GroupChoice({ groups, selectedId, onSelect, onCreateGroup, onOpenPicker }: GroupChoiceProps) {
  const [creating, setCreating] = useState(false);

  const create = async (name: string) => {
    const groupId = await onCreateGroup(name);
    onSelect(groupId);
    setCreating(false);
  };

  if (groups.length === 0) {
    return (
      <View style={styles.emptyBlock}>
        <Text style={styles.emptyHint}>
          Tu n'es encore dans aucun groupe privé. Crées-en un ici : cette main y sera publiée.
        </Text>
        {creating ? (
          <NewGroupForm onCreate={create} onCancel={() => setCreating(false)} />
        ) : (
          <Pressable style={styles.createButton} onPress={() => setCreating(true)}>
            <Text style={styles.createButtonText}>+ Créer un groupe privé</Text>
          </Pressable>
        )}
      </View>
    );
  }

  const collapsed = groups.length > INLINE_GROUPS_MAX;
  const shown = collapsed ? visibleGroups(groups, selectedId) : groups;

  return (
    <>
      <Text style={styles.label}>Quel groupe privé ?</Text>
      <View style={styles.row}>
        {shown.map((g) => (
          <Chip key={g.id} label={g.name} selected={selectedId === g.id} onPress={() => onSelect(g.id)} />
        ))}
      </View>
      {/* Sous la rangée, sans contour et plus petit : désigner un groupe est le geste courant,
          en chercher un autre ou en créer un est l'exception. Un seul lien à la fois — repliée,
          la rangée renvoie au sélecteur, qui porte lui-même la création. */}
      {collapsed ? (
        <Pressable style={styles.link} onPress={onOpenPicker} hitSlop={8}>
          <Text style={styles.linkText}>Choisir un autre groupe</Text>
        </Pressable>
      ) : creating ? (
        <NewGroupForm onCreate={create} onCancel={() => setCreating(false)} />
      ) : (
        <Pressable style={styles.link} onPress={() => setCreating(true)} hitSlop={8}>
          <Text style={styles.linkText}>+ Nouveau groupe</Text>
        </Pressable>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 14,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emptyBlock: {
    marginTop: spacing.xs,
  },
  emptyHint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  createButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  createButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.action,
  },
  // Écarté de 12 pt de la rangée (4 ici + les 8 de marge basse des chips) : au moins autant que le
  // `hitSlop` du lien, sinon sa zone de touche mordrait sur le dernier chip.
  link: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.action,
  },
});
