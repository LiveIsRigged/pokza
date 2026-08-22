import React, { useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Post, Visibility } from '../types/poker';
import type { Group } from '../data/groups';
import { GroupChoice } from '../groups/GroupChoice';
import { GroupPickerScreen } from '../groups/GroupPickerScreen';
import { defaultGroupId, loadLastUsedGroupIds, orderGroupsByLastUsed } from '../groups/lastUsedGroups';
import { Chip } from '../creator/Chip';
import { WizardScreen } from '../creator/WizardScreen';
import { DESCRIPTION_MAX_LENGTH } from '../creator/types';
import {
  BUY_IN_MAX_LENGTH,
  LEVEL_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  VOTE_OPTION_MAX_LENGTH,
  VOTE_QUESTION_MAX_LENGTH,
} from '../constants/limits';
import { borders, colors } from '../theme/theme';

export interface PostEdits {
  title: string;
  description?: string;
  location?: string;
  buyIn?: string;
  level?: string;
  voteQuestion?: string;
  voteOptions?: string[];
  visibility: Visibility;
  groupId?: string;
}

interface EditPostScreenProps {
  post: Post;
  onSave: (edits: PostEdits) => void;
  onCancel: () => void;
  groups: Group[];
  /** Crée un groupe sans quitter l'écran et renvoie son id — même raison qu'au créateur : partir
   * vers « Mes groupes » démonterait cet écran et jetterait les modifications en cours. */
  onCreateGroup: (name: string) => Promise<string>;
}

export interface EditPostScreenHandle {
  /**
   * Referme le sélecteur de groupe s'il est ouvert, et renvoie `true` dans ce cas. `App.tsx` s'en
   * sert pour le glissement de bord (`Screen`) : sans ça, ce geste ignore le sélecteur — rendu en
   * overlay LOCAL, invisible du geste attaché bien plus haut — et quitte la modification en
   * emportant les changements saisis. Même mécanique que `GroupScreenHandle`.
   */
  handleBack: () => boolean;
}

/**
 * Ne touche qu'au texte/contexte du post (titre, description, vote, lieu, buy-in, niveau,
 * visibilité) — le déroulé de la main (cartes, actions, board) est un fait déjà arrivé, il ne se
 * réécrit pas après publication. D'où un formulaire dédié plutôt que de rouvrir tout le wizard de
 * création, qui contient plein de champs (blindes, sièges...) qui ne devraient plus bouger ici.
 */
export const EditPostScreen = React.forwardRef<EditPostScreenHandle, EditPostScreenProps>(function EditPostScreen(
  { post, onSave, onCancel, groups, onCreateGroup },
  ref
) {
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description ?? '');
  const [location, setLocation] = useState(post.location ?? '');
  const [buyIn, setBuyIn] = useState(post.buyIn ?? '');
  const [level, setLevel] = useState(post.level ?? '');
  const [voteQuestion, setVoteQuestion] = useState(post.voteQuestion ?? '');
  const [voteOptions, setVoteOptions] = useState<string[]>(post.voteOptions ?? ['', '']);
  const [visibility, setVisibility] = useState<Visibility>(post.visibility);
  const [groupId, setGroupId] = useState<string | undefined>(post.groupId);
  const [lastUsedGroupIds, setLastUsedGroupIds] = useState<string[]>([]);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadLastUsedGroupIds().then((ids) => {
      if (!cancelled) setLastUsedGroupIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      handleBack: () => {
        if (groupPickerOpen) {
          setGroupPickerOpen(false);
          return true;
        }
        return false;
      },
    }),
    [groupPickerOpen]
  );

  const orderedGroups = useMemo(() => orderGroupsByLastUsed(groups, lastUsedGroupIds), [groups, lastUsedGroupIds]);
  const preselectedGroupId = defaultGroupId(orderedGroups, lastUsedGroupIds);

  const isTournament = post.hand.gameType === 'tournament';
  const hasVoteQuestion = voteQuestion.trim().length > 0;

  const updateOption = (index: number, text: string) => {
    const next = [...voteOptions];
    next[index] = text;
    setVoteOptions(next);
  };

  const handleSave = () => {
    onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      buyIn: buyIn.trim() || undefined,
      level: level.trim() || undefined,
      voteQuestion: voteQuestion.trim() || undefined,
      voteOptions: hasVoteQuestion ? voteOptions.map((o) => o.trim()).filter(Boolean) : undefined,
      visibility,
      groupId: visibility === 'group' ? groupId : undefined,
    });
  };

  // Une main publiée avant l'entrée en vigueur de la limite peut afficher « 52/40 » : le compteur
  // passe au rouge et l'enregistrement reste fermé tant que le texte n'a pas été raccourci, plutôt
  // que de laisser la base refuser l'écriture.
  const titleTooLong = title.length > TITLE_MAX_LENGTH;

  return (
    <>
      <WizardScreen
        title="Modifier le post"
        subtitle="Le déroulé de la main ne change pas, seulement le texte"
        onNext={handleSave}
        nextLabel="Enregistrer"
        nextDisabled={!title.trim() || titleTooLong || (visibility === 'group' && !groupId)}
        onBack={onCancel}
      >
        <View>
          {/* Compteur sur le titre comme sur la description : a 80 caracteres la limite ne se
              rencontrait jamais, a 40 on la touche en pleine phrase. Sans ce chiffre, l auteur bute
              sur un mur invisible. Il affiche aussi "52/40" sur une ancienne main trop longue —
              c est voulu : ca lui dit exactement combien enlever pour pouvoir enregistrer. */}
          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelNoMargin]}>Titre</Text>
            <Text style={[styles.counter, titleTooLong && styles.counterOver]}>
              {title.length}/{TITLE_MAX_LENGTH}
            </Text>
          </View>
          <TextInput style={styles.input} maxLength={TITLE_MAX_LENGTH} value={title} onChangeText={setTitle} />

          <View style={styles.labelRow}>
            <Text style={[styles.label, styles.labelNoMargin]}>Description (optionnel)</Text>
            <Text style={styles.counter}>
              {description.length}/{DESCRIPTION_MAX_LENGTH}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESCRIPTION_MAX_LENGTH))}
            maxLength={DESCRIPTION_MAX_LENGTH}
            multiline
            textAlignVertical="top"
          />

          <Text style={styles.label}>Lieu (optionnel)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : Club Circus, Bruxelles"
            maxLength={LOCATION_MAX_LENGTH}
            value={location}
            onChangeText={setLocation}
          />

          {isTournament && (
            <>
              <Text style={styles.label}>Buy-in (optionnel)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex : 100€"
                maxLength={BUY_IN_MAX_LENGTH}
                value={buyIn}
                onChangeText={setBuyIn}
              />
              <Text style={styles.label}>Niveau de blindes (optionnel)</Text>
              {/* Champ libre ici, alors que la création impose un numéro seul (LevelNumberInput).
                  La limite couvre le format réellement stocké — « Niveau » + 3 chiffres. */}
              <TextInput
                style={styles.input}
                placeholder="Ex : Niveau 12"
                maxLength={LEVEL_MAX_LENGTH}
                value={level}
                onChangeText={setLevel}
              />
            </>
          )}

          <Text style={styles.label}>Question au vote (optionnel)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : Tu payes cette river ?"
            maxLength={VOTE_QUESTION_MAX_LENGTH}
            value={voteQuestion}
            onChangeText={setVoteQuestion}
          />

          {hasVoteQuestion && (
            <>
              <Text style={styles.label}>Réponses possibles (2 à 4)</Text>
              {[0, 1, 2, 3].map((i) => (
                <TextInput
                  key={i}
                  style={[styles.input, styles.optionInput]}
                  placeholder={i < 2 ? `Réponse ${i + 1}` : `Réponse ${i + 1} (optionnel)`}
                  value={voteOptions[i] ?? ''}
                  onChangeText={(t) => updateOption(i, t)}
                  maxLength={VOTE_OPTION_MAX_LENGTH}
                />
              ))}
            </>
          )}

          <Text style={styles.label}>Visibilité</Text>
          <View style={styles.row}>
            <Chip label="Public" selected={visibility === 'public'} onPress={() => setVisibility('public')} />
            <Chip label="Privé" selected={visibility === 'private'} onPress={() => setVisibility('private')} />
            <Chip
              label="Groupe privé"
              selected={visibility === 'group'}
              onPress={() => {
                setVisibility('group');
                setGroupId((g) => g ?? preselectedGroupId);
              }}
            />
          </View>

          {visibility === 'group' && (
            <GroupChoice
              groups={orderedGroups}
              selectedId={groupId}
              onSelect={setGroupId}
              onCreateGroup={onCreateGroup}
              onOpenPicker={() => setGroupPickerOpen(true)}
            />
          )}
        </View>
      </WizardScreen>
      {/* Hors du `WizardScreen` : ses enfants sont rendus dans un `ScrollView`, où un overlay
          absolu défilerait avec le contenu et serait rogné. Le glissement de bord d'`App`, lui,
          est neutralisé par `handleBack` plus haut. */}
      {groupPickerOpen && (
        <GroupPickerScreen
          groups={orderedGroups}
          selectedId={groupId}
          onSelect={(id) => {
            setVisibility('group');
            setGroupId(id);
            setGroupPickerOpen(false);
          }}
          onCreateGroup={onCreateGroup}
          onBack={() => setGroupPickerOpen(false)}
        />
      )}
    </>
  );
});

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
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 14,
    marginBottom: 6,
  },
  labelNoMargin: {
    marginTop: 0,
    marginBottom: 0,
  },
  counter: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  counterOver: {
    color: colors.cardTextRed,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
  },
  descriptionInput: {
    minHeight: 88,
  },
  optionInput: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
