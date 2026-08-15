import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { Post, Visibility } from '../types/poker';
import type { Group } from '../data/groups';
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
import { colors } from '../theme/theme';

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
}

/**
 * Ne touche qu'au texte/contexte du post (titre, description, vote, lieu, buy-in, niveau,
 * visibilité) — le déroulé de la main (cartes, actions, board) est un fait déjà arrivé, il ne se
 * réécrit pas après publication. D'où un formulaire dédié plutôt que de rouvrir tout le wizard de
 * création, qui contient plein de champs (blindes, sièges...) qui ne devraient plus bouger ici.
 */
export function EditPostScreen({ post, onSave, onCancel, groups }: EditPostScreenProps) {
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description ?? '');
  const [location, setLocation] = useState(post.location ?? '');
  const [buyIn, setBuyIn] = useState(post.buyIn ?? '');
  const [level, setLevel] = useState(post.level ?? '');
  const [voteQuestion, setVoteQuestion] = useState(post.voteQuestion ?? '');
  const [voteOptions, setVoteOptions] = useState<string[]>(post.voteOptions ?? ['', '']);
  const [visibility, setVisibility] = useState<Visibility>(post.visibility);
  const [groupId, setGroupId] = useState<string | undefined>(post.groupId);

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

  return (
    <WizardScreen
      title="Modifier le post"
      subtitle="Le déroulé de la main ne change pas, seulement le texte"
      onNext={handleSave}
      nextLabel="Enregistrer"
      nextDisabled={!title.trim() || (visibility === 'group' && !groupId)}
      onBack={onCancel}
    >
      <View>
        <Text style={styles.label}>Titre</Text>
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
          {groups.length > 0 && (
            <Chip
              label="Groupe privé"
              selected={visibility === 'group'}
              onPress={() => {
                setVisibility('group');
                setGroupId((g) => g ?? groups[0].id);
              }}
            />
          )}
        </View>

        {visibility === 'group' && groups.length > 0 && (
          <>
            <Text style={styles.label}>Quel groupe privé ?</Text>
            <View style={styles.row}>
              {groups.map((g) => (
                <Chip key={g.id} label={g.name} selected={groupId === g.id} onPress={() => setGroupId(g.id)} />
              ))}
            </View>
          </>
        )}
      </View>
    </WizardScreen>
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
  input: {
    borderWidth: 1,
    borderColor: 'rgba(22,35,61,0.25)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
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
