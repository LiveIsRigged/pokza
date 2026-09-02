import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { borders, colors, radius, spacing } from '../../theme/theme';
import type { Group } from '../../data/groups';
import { GroupChoice } from '../../groups/GroupChoice';
import { Chip } from '../Chip';
import { Pressable } from '../../components/ui/Pressable';
import { PlayIcon, TextLinesIcon } from '../../components/ui/icons';
import { WizardScreen } from '../WizardScreen';
import { DESCRIPTION_MAX_LENGTH, type ReviewData } from '../types';
import {
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
  /** Groupes dont l'utilisateur est membre, déjà ordonnés (le plus récemment utilisé en tête). Le
   * chip « Groupe privé » est proposé même quand la liste est vide : c'est en le choisissant qu'on
   * apprend qu'on n'en a aucun, et qu'on peut en créer un sur place. Le cacher escamotait la
   * question au lieu d'y répondre. */
  groups: Group[];
  /** Groupe proposé d'office en choisissant « Groupe privé » : le dernier utilisé, ou rien du tout
   * (cf. `defaultGroupId`). Absent, le bouton « Publier la main » reste fermé jusqu'à un choix
   * explicite — publier dans le mauvais groupe notifie ses membres sans retour possible. */
  defaultGroupId?: string;
  /** Crée un groupe sur place et renvoie son id. Il FAUT que ça se fasse sans quitter l'écran :
   * le créateur n'est monté que le temps de la saisie (cf. `mode === 'create'` dans App), en
   * sortir pour passer par « Mes groupes » perdrait la main déjà saisie. Le parent est chargé
   * d'ajouter le groupe à `groups` — c'est ce qui fait apparaître les chips juste après. */
  onCreateGroup: (name: string) => Promise<string>;
  /** Ouvre le sélecteur plein écran, quand la rangée de chips est repliée. Rendu par le créateur
   * lui-même, au-dessus de l'étape — surtout pas par `App.tsx`. */
  onOpenGroupPicker: () => void;
  /** Publication en cours : verrouille le bouton et le dit. Sans ça, un second appui pendant
   * l'aller-retour réseau publie la main une deuxième fois — et rien côté base ne l'en empêche
   * (vérifié : deux insertions identiques simultanées sont toutes deux acceptées). */
  submitting?: boolean;
  /**
   * Reprise d'une main existante (« Corriger la main ») : le geste n'est pas une première
   * publication, et le bouton doit le dire. Absent = création normale.
   */
  republication?: boolean;
  /**
   * Ouvre l'aperçu plein écran : la main rejouée dans le replayer du feed, commandes comprises
   * (cf. `ApercuMainScreen`). C'est le dernier écran avant la mise en ligne, et le seul endroit
   * d'où l'on peut aller REVOIR le déroulé sans reculer dans l'assistant ni perdre ce qu'on a
   * déjà tapé.
   */
  onRevoirLaMain?: () => void;
  /** Ouvre la main en phrases, à copier ailleurs (cf. `MainEnTexteScreen`). */
  onVoirLeTexte?: () => void;
}

export function ReviewStep({
  value,
  onChange,
  onSubmit,
  onBack,
  step,
  totalSteps,
  groups,
  defaultGroupId,
  onCreateGroup,
  onOpenGroupPicker,
  submitting,
  republication = false,
  onRevoirLaMain,
  onVoirLeTexte,
}: ReviewStepProps) {
  const update = (patch: Partial<ReviewData>) => onChange({ ...value, ...patch });

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
      title={republication ? 'Republier' : 'Publier'}
      subtitle="Derniers détails"
      onNext={onSubmit}
      nextLabel={
        submitting
          ? (republication ? 'Republication…' : 'Publication…')
          : (republication ? 'Republier la main' : 'Publier la main')
      }
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
        {/* La rangée d'outils : ce qui sert à VÉRIFIER la main, avant les champs qui l'habillent.
            En haut parce qu'on vérifie d'abord et qu'on écrit ensuite — un titre se choisit mieux
            quand on vient de revoir le coup. */}
        {onRevoirLaMain || onVoirLeTexte ? (
          <View style={styles.outils}>
            {onRevoirLaMain ? (
              <Pressable style={styles.outil} onPress={onRevoirLaMain}>
                <PlayIcon size={18} color={colors.textPrimary} />
                <Text style={styles.outilTexte}>Revoir la main</Text>
              </Pressable>
            ) : null}
            {onVoirLeTexte ? (
              <Pressable style={styles.outil} onPress={onVoirLeTexte}>
                <TextLinesIcon size={18} color={colors.textPrimary} />
                <Text style={styles.outilTexte}>La main en texte</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Compteur sur le titre comme sur la description : a 80 caracteres la limite ne se
            rencontrait jamais, a 40 on la touche en pleine phrase. Sans ce chiffre, l auteur bute
            sur un mur invisible. Il affiche aussi "52/40" sur une ancienne main trop longue —
            c est voulu : ca lui dit exactement combien enlever pour pouvoir enregistrer. */}
        {/* « (obligatoire) » — constat 8 de l'audit, tranché par Victor le 02/09/2026.
            Le titre vide est la SEULE cause qui estompe « Publier la main », et rien ne le disait :
            le seul indice était une déduction par l'absence — « Description » et « Question au
            vote » portent « (optionnel) », donc ce qui n'en porte pas serait requis. C'est vrai, et
            c'est beaucoup demander à 1 h du matin, après tout le travail, sur le geste qui le
            conclut. Le mot est le contraire exact des deux autres, à la même place. */}
        <View style={styles.labelRow}>
          <Text style={[styles.label, styles.labelNoMargin]}>Titre (obligatoire)</Text>
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
            onPress={() => update({ visibility: 'group', groupId: value.groupId ?? defaultGroupId })}
          />
        </View>

        {value.visibility === 'group' && (
          <GroupChoice
            groups={groups}
            selectedId={value.groupId}
            onSelect={(groupId) => update({ groupId })}
            onCreateGroup={onCreateGroup}
            onOpenPicker={onOpenGroupPicker}
          />
        )}
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  outils: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  outil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: borders.default,
  },
  outilTexte: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
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
