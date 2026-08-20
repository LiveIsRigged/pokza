import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from '../ui/Pressable';
import { colors, radius, tints } from '../../theme/theme';
import { PauseIcon, PlayIcon } from '../ui/icons';

// Les trois boutons partagent le même triangle : le pas arrière n'est que `PlayIcon` en miroir.
// Avant, le pas à pas était dessiné avec des bordures CSS et la lecture était le caractère « ▶ »
// de la police système — trois rendus différents pour la même forme, côte à côte.
const MAIN_ICON_SIZE = 26;
const SIDE_ICON_SIZE = 20;

interface PlaybackControlsProps {
  playing: boolean;
  step: number;
  totalSteps: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onTogglePlay: () => void;
  /** Va directement à l'état juste après l'action n° `index + 1` (segment cliqué). */
  onSeek: (index: number) => void;
}

export function PlaybackControls({
  playing,
  step,
  totalSteps,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onTogglePlay,
  onSeek,
}: PlaybackControlsProps) {
  return (
    <View style={styles.container}>
      <View style={styles.segmentsRow}>
        {Array.from({ length: totalSteps }).map((_, i) => (
        <Pressable key={i} style={styles.segmentTouchable} onPress={() => onSeek(i)} hitSlop={8}>
            <View style={[styles.segment, i < step && styles.segmentFilled]} />
        </Pressable>
        ))}
      </View>

      <View style={styles.row}>
        <Pressable
          onPress={onBack}
          disabled={!canGoBack}
          style={[styles.sideButton, !canGoBack && styles.disabled]}
        >
          <View style={styles.mirrored}>
            <PlayIcon size={SIDE_ICON_SIZE} color="#fff" />
          </View>
        </Pressable>

        <Pressable onPress={onTogglePlay} style={styles.mainButton}>
          {playing ? (
            <PauseIcon size={MAIN_ICON_SIZE} color="#fff" />
          ) : (
            <PlayIcon size={MAIN_ICON_SIZE} color="#fff" />
          )}
        </Pressable>

        <Pressable
          onPress={onForward}
          disabled={!canGoForward}
          style={[styles.sideButton, !canGoForward && styles.disabled]}
        >
          <PlayIcon size={SIDE_ICON_SIZE} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

// Passe de densite A (2026-08-18) — on ne rogne QUE des espaces blancs, aucun element n'est
// reduit : ni la table, ni les cartes, ni les tailles de texte, ni les cibles tactiles. Les
// valeurs d'origine etaient toutes des jetons `spacing` par defaut, jamais choisies pour cette
// carte en particulier. Reversible d'un seul `git revert` (commit isole).
// `segmentTouchable` garde ses 8 px de padding : c'est la zone tactile de la barre de seek, deja
// a 19 px de haut. La rogner ferait gagner 4 px contre une cible plus dure a viser — mauvais echange.
const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  segmentsRow: {
    flexDirection: 'row',
    gap: 3,
    marginBottom: 4,
  },
  // La barre visible ne fait que 3px de haut ; ce padding vertical élargit la zone cliquable
  // sans changer l'apparence, pour une cible tactile confortable sur mobile.
  segmentTouchable: {
    flex: 1,
    paddingVertical: 8,
  },
  segment: {
    height: 3,
    borderRadius: radius.full,
    backgroundColor: tints.light,
  },
  segmentFilled: {
    backgroundColor: colors.gold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  sideButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  // Triangle plein dessiné via l'astuce des bordures (plutôt qu'un glyphe texte ‹/› dont
  // l'épaisseur/le rendu varie selon la police) : forme géométrique nette et identique partout.
  mainButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  // Le pas arrière réutilise le triangle de lecture retourné.
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
  disabled: {
    opacity: 0.35,
  },
});
