import React, { useEffect, useMemo, useState } from 'react';
import { errorMessage } from '../utils/errorMessage';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, radius, spacing, typography } from '../theme/theme';
import { createGroup, fetchMyGroups, type Group } from '../data/groups';
import { Avatar } from '../components/ui/Avatar';
import { NewGroupForm } from './NewGroupForm';
import { formatRelativeDate } from '../utils/relativeDate';
import { formatBadgeCount } from '../components/ui/SideMenu';
import { useT } from '../i18n';
import { t } from '../i18n/traduire';

/**
 * Nombre de groupes à partir duquel le champ de recherche apparaît. Une ligne fait 64 pt et
 * l'écran en montre 9 (iPhone SE) à 11 (iPhone standard) : à 15, la liste vient tout juste de
 * cesser de tenir sur un écran. En dessous, un pouce suffit et le champ ne serait qu'un rang de
 * plus à traverser. Valeur produit arbitrée le 2026-08-21.
 */
const SEARCH_FROM = 15;

/** « Hier » et « Lundi » arrivent capitalisés de `formatRelativeDate` (ils y commencent une
 *  phrase) ; ici ils sont au milieu d'une, d'où la minuscule. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function subtitle(group: Group): string {
  const members = group.memberCount ?? 0;
  const membersLabel = t('groupe.membres_compte', { count: members });
  const activity = group.lastPostAt ? t('groupe.derniere_main', { quand: lowerFirst(formatRelativeDate(group.lastPostAt)) }) : t('groupe.aucune_main');
  return `${membersLabel} · ${activity}`;
}

interface GroupsListScreenProps {
  currentUserId: string;
  onBack: () => void;
  onSelectGroup: (groupId: string) => void;
}

export function GroupsListScreen({ currentUserId, onBack, onSelectGroup }: GroupsListScreenProps) {
  const t = useT();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMyGroups()
      .then((data) => {
        if (!cancelled) {
          setGroups(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(errorMessage(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  // Le nouveau groupe s'ouvre aussitôt : c'est là qu'on invite des joueurs, et un groupe vide
  // n'a rien à montrer dans la liste.
  const handleCreate = async (name: string) => {
    const groupId = await createGroup(name);
    setCreating(false);
    onSelectGroup(groupId);
  };

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t('menu.mes_groupes_prives')}</Text>
      </View>

      {error && <Text style={styles.statusText}>{error}</Text>}

      {/* Le champ n'apparaît qu'au-delà de `SEARCH_FROM`, et hors de la liste : en en-tête de
          `FlatList` il perdrait le focus à chaque frappe, la liste se re-rendant à chaque lettre. */}
      {groups.length >= SEARCH_FROM && (
        <TextInput
          autoComplete="off"
          style={styles.search}
          placeholder={t('groupe.rechercher')}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />
      )}

      {/* `FlatList` et non `ScrollView` : celui-ci montait toutes les lignes et tous leurs avatars
          d'un coup, donc autant de chargements d'images simultanés qu'il y a de groupes. */}
      <FlatList
        data={filtered}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListEmptyComponent={
          <Text style={styles.statusText}>
            {loading
              ? t('commun.chargement')
              : query.trim()
                ? t('groupe.aucun_resultat')
                : t('groupe.aucun_groupe')}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.groupRow} onPress={() => onSelectGroup(item.id)}>
            <Avatar url={item.avatarUrl} name={item.name} size={40} shape="square" />
            <View style={styles.groupTexts}>
              <Text style={styles.groupName} numberOfLines={1}>
                {item.name}
              </Text>
              {/* Deux groupes peuvent porter le même nom, rien ne l'interdit : cette ligne est ce
                  qui permet de les distinguer. */}
              <Text style={styles.groupMeta} numberOfLines={1}>
                {subtitle(item)}
              </Text>
            </View>
            {/* Mains publiées ici depuis la dernière visite, les siennes exclues. Même pastille que
                celles du menu latéral — un seul objet « compteur » dans le produit. */}
            {item.unseenCount != null && item.unseenCount > 0 && (
              <View style={styles.unseenBadge}>
                <Text style={styles.unseenBadgeText}>{formatBadgeCount(item.unseenCount)}</Text>
              </View>
            )}
          </Pressable>
        )}
        ListFooterComponent={
          creating ? (
            <NewGroupForm onCreate={handleCreate} onCancel={() => setCreating(false)} />
          ) : (
            <Pressable style={styles.createButton} onPress={() => setCreating(true)}>
              <Text style={styles.createButtonText}>{t('groupe.creer')}</Text>
            </Pressable>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: 10,
  },
  backArrow: {
    fontSize: 22,
    color: colors.textPrimary,
    paddingHorizontal: 4,
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
  search: {
    marginHorizontal: 14,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: borders.hairline,
  },
  // `flex: 1` et non `flexShrink: 1` seul : sans quoi le bloc de texte s'arrête à sa largeur de
  // contenu et la pastille se colle contre lui au lieu de tenir le bout de la ligne.
  groupTexts: {
    flex: 1,
  },
  groupName: {
    ...typography.authorName,
    color: colors.textPrimary,
  },
  groupMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Valeurs reprises telles quelles de `rowBadge` (SideMenu) : les deux pastilles du produit
  // doivent être le même objet, pas deux dessins voisins.
  unseenBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    backgroundColor: colors.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unseenBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  createButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 12,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
