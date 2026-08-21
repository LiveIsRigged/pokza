import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Pressable } from '../../components/ui/Pressable';
import { borders, colors, hitSlopPairLeft, hitSlopPairRight, radius, spacing } from '../../theme/theme';
import type { Group } from '../../data/groups';
import { errorMessage } from '../../utils/errorMessage';
import { Chip } from '../Chip';
import { WizardScreen } from '../WizardScreen';
import { DESCRIPTION_MAX_LENGTH, type ReviewData } from '../types';
import {
  GROUP_NAME_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  VOTE_OPTION_MAX_LENGTH,
  VOTE_QUESTION_MAX_LENGTH,
} from '../../constants/limits';

const MAX_VOTE_OPTIONS = 4;

interface ReviewStepProps {
  value: ReviewData;
  onChange: (value: ReviewData) => void;
  onSubmit: () => void;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
  /** Groupes dont l'utilisateur est membre. Le chip « Groupe privé » est proposé même quand la
   * liste est vide : c'est en le choisissant qu'on apprend qu'on n'en a aucun, et qu'on peut en
   * créer un sur place (cf. plus bas). Le cacher escamotait la question au lieu d'y répondre. */
  groups: Group[];
  /** Crée un groupe sur place et renvoie son id. Il FAUT que ça se fasse sans quitter l'écran :
   * le créateur n'est monté que le temps de la saisie (cf. `mode === 'create'` dans App), en
   * sortir pour passer par « Mes groupes » perdrait la main déjà saisie. Le parent est chargé
   * d'ajouter le groupe à `groups` — c'est ce qui fait apparaître les chips juste après. */
  onCreateGroup: (name: string) => Promise<string>;
  /** Publication en cours : verrouille le bouton et le dit. Sans ça, un second appui pendant
   * l'aller-retour réseau publie la main une deuxième fois — et rien côté base ne l'en empêche
   * (vérifié : deux insertions identiques simultanées sont toutes deux acceptées). */
  submitting?: boolean;
}

export function ReviewStep({
  value,
  onChange,
  onSubmit,
  onBack,
  step,
  totalSteps,
  groups,
  onCreateGroup,
  submitting,
}: ReviewStepProps) {
  const update = (patch: Partial<ReviewData>) => onChange({ ...value, ...patch });

  // Création d'un groupe depuis l'étape « Publier », quand l'auteur n'en a aucun.
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [groupSubmitting, setGroupSubmitting] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const submitNewGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    setGroupSubmitting(true);
    setGroupError(null);
    try {
      const groupId = await onCreateGroup(name);
      setCreatingGroup(false);
      setNewGroupName('');
      // Le groupe qu'on vient de créer devient la destination de la main : c'est la seule raison
      // pour laquelle on le crée ici. L'auteur peut encore revenir sur Public/Privé après coup.
      update({ visibility: 'group', groupId });
    } catch (err) {
      setGroupError(errorMessage(err));
    } finally {
      setGroupSubmitting(false);
    }
  };

  const voteOptions = value.voteOptions ?? ['', ''];
  const hasVoteQuestion = (value.voteQuestion ?? '').trim().length > 0;

  const updateOption = (index: number, text: string) => {
    const next = [...voteOptions];
    next[index] = text;
    update({ voteOptions: next });
  };

  const filledOptions = voteOptions.map((o) => o.trim()).filter(Boolean);
  // `maxLength` empêche de dépasser à la saisie, mais pas de coller un texte plus long ni de
  // reprendre une main d'avant la limite : la base refuserait la publication, l'interface ne
  // disait rien. Le compteur passe au rouge et le bouton se ferme.
  const titleTooLong = value.title.length > TITLE_MAX_LENGTH;

  return (
    <WizardScreen
      title="Publier"
      subtitle="Derniers détails"
      onNext={onSubmit}
      nextLabel={submitting ? 'Publication…' : 'Publier la main'}
      nextDisabled={
        submitting ||
        !value.title.trim() ||
        titleTooLong ||
        (value.visibility === 'group' && !value.groupId)
      }
      onBack={onBack}
      step={step}
      totalSteps={totalSteps}
    >
      <View>
        {/* Compteur sur le titre comme sur la description : a 80 caracteres la limite ne se
            rencontrait jamais, a 40 on la touche en pleine phrase. Sans ce chiffre, l auteur bute
            sur un mur invisible. Il affiche aussi "52/40" sur une ancienne main trop longue —
            c est voulu : ca lui dit exactement combien enlever pour pouvoir enregistrer. */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelNoMargin]}>Titre</Text>
          <Text style={[styles.counter, titleTooLong && styles.counterOver]}>
            {value.title.length}/{TITLE_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          style={styles.input}
          placeholder="Ex : Hero call contre un reg"
          maxLength={TITLE_MAX_LENGTH}
          value={value.title}
          onChangeText={(t) => update({ title: t })}
        />

        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelNoMargin]}>Description (optionnel)</Text>
          <Text style={styles.counter}>
            {(value.description ?? '').length}/{DESCRIPTION_MAX_LENGTH}
          </Text>
        </View>
        <TextInput
          style={[styles.input, styles.descriptionInput]}
          placeholder="Contexte, action street par street, ce que vous demandez aux lecteurs…"
          value={value.description ?? ''}
          onChangeText={(t) => update({ description: t.slice(0, DESCRIPTION_MAX_LENGTH) })}
          maxLength={DESCRIPTION_MAX_LENGTH}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Question au vote (optionnel)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex : Tu payes cette river ?"
          maxLength={VOTE_QUESTION_MAX_LENGTH}
          value={value.voteQuestion ?? ''}
          onChangeText={(t) => update({ voteQuestion: t })}
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

            {filledOptions.length > 0 && (
              <>
                <Text style={styles.label}>Aperçu du vote</Text>
                <View style={styles.previewRow}>
                  {filledOptions.slice(0, MAX_VOTE_OPTIONS).map((opt, i) => (
                    <View key={i} style={styles.previewBubble}>
                      <Text style={styles.previewBubbleText}>{opt}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}

        <Text style={styles.label}>Visibilité</Text>
        <View style={styles.row}>
          <Chip label="Public" selected={value.visibility === 'public'} onPress={() => update({ visibility: 'public', groupId: undefined })} />
          <Chip label="Privé" selected={value.visibility === 'private'} onPress={() => update({ visibility: 'private', groupId: undefined })} />
          <Chip
            label="Groupe privé"
            selected={value.visibility === 'group'}
            onPress={() => update({ visibility: 'group', groupId: value.groupId ?? groups[0]?.id })}
          />
        </View>

        {value.visibility === 'group' && (
          <>
            {/* Choisir « Groupe privé » n'est jamais une impasse : ou bien on a des groupes et on
                en désigne un, ou bien on n'en a aucun et on l'apprend ici. Dans les deux cas la
                création se fait sur place — en sortir perdrait la main saisie. Tant qu'aucune
                destination n'est choisie, « Publier la main » reste fermé (cf. `nextDisabled`). */}
            {groups.length > 0 ? (
              <>
                <Text style={styles.label}>Quel groupe privé ?</Text>
                <View style={styles.row}>
                  {groups.map((g) => (
                    <Chip key={g.id} label={g.name} selected={value.groupId === g.id} onPress={() => update({ groupId: g.id })} />
                  ))}
                </View>
                {/* Sous la rangée, sans contour et plus petit : désigner un groupe existant est le
                    geste courant, en créer un est l'exception. Les deux au même plan feraient lire
                    « + Nouveau groupe » comme un groupe de plus dans la liste. */}
                {!creatingGroup && (
                  <Pressable style={styles.newGroupLink} onPress={() => setCreatingGroup(true)} hitSlop={8}>
                    <Text style={styles.newGroupLinkText}>+ Nouveau groupe</Text>
                  </Pressable>
                )}
              </>
            ) : (
              <View style={styles.noGroupBlock}>
                <Text style={styles.noGroupHint}>
                  Tu n'es encore dans aucun groupe privé. Crées-en un ici : cette main y sera publiée.
                </Text>
                {!creatingGroup && (
                  <Pressable style={styles.createGroupButton} onPress={() => setCreatingGroup(true)}>
                    <Text style={styles.createGroupButtonText}>+ Créer un groupe privé</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Même formulaire dans les deux cas — seule la porte d'entrée change. */}
            {creatingGroup && (
              <View style={styles.newGroupForm}>
                <TextInput
                  style={styles.input}
                  placeholder="Nom du groupe privé"
                  value={newGroupName}
                  onChangeText={(t) => setNewGroupName(t.slice(0, GROUP_NAME_MAX_LENGTH))}
                  maxLength={GROUP_NAME_MAX_LENGTH}
                  autoFocus
                />
                <View style={styles.newGroupActions}>
                  <Pressable
                    style={styles.cancelButton}
                    onPress={() => {
                      setCreatingGroup(false);
                      setNewGroupName('');
                      setGroupError(null);
                    }}
                    hitSlop={hitSlopPairLeft}
                  >
                    <Text style={styles.cancelButtonText}>Annuler</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.confirmButton,
                      (!newGroupName.trim() || groupSubmitting) && styles.confirmButtonDisabled,
                    ]}
                    onPress={() => void submitNewGroup()}
                    disabled={!newGroupName.trim() || groupSubmitting}
                    hitSlop={hitSlopPairRight}
                  >
                    <Text style={styles.confirmButtonText}>{groupSubmitting ? 'Création…' : 'Créer'}</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {groupError && <Text style={styles.groupError}>{groupError}</Text>}
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
  noGroupBlock: {
    marginTop: spacing.xs,
  },
  // Écarté de 12 pt de la rangée au-dessus (4 ici + les 8 de marge basse des chips) : au moins
  // autant que le `hitSlop` du lien, sinon sa zone de touche mordrait sur le dernier chip.
  newGroupLink: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  newGroupLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.action,
  },
  newGroupForm: {
    marginTop: spacing.xs,
  },
  noGroupHint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  // Bouton discret et non pleine largeur, contrairement à celui de « Mes groupes » : ici le seul
  // bouton plein doit rester « Publier la main », en bas de l'écran.
  createGroupButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  createGroupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.action,
  },
  newGroupActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  cancelButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  confirmButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.action,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  groupError: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.error,
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewBubble: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: borders.default,
  },
  previewBubbleText: {
    fontSize: 12,
    color: colors.textPrimary,
  },
});
