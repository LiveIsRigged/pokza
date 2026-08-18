import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../theme/theme';

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
          <View style={styles.arrowLeft} />
        </Pressable>

        <Pressable onPress={onTogglePlay} style={styles.mainButton}>
          <Text style={styles.mainIcon}>{playing ? '❚❚' : '▶'}</Text>
        </Pressable>

        <Pressable
          onPress={onForward}
          disabled={!canGoForward}
          style={[styles.sideButton, !canGoForward && styles.disabled]}
        >
          <View style={styles.arrowRight} />
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
    backgroundColor: 'rgba(22,35,61,0.1)',
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
  arrowLeft: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderRightWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderRightColor: '#fff',
    marginRight: 1,
  },
  arrowRight: {
    width: 0,
    height: 0,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 10,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: '#fff',
    marginLeft: 1,
  },
  mainButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.action,
  },
  mainIcon: {
    fontSize: 24,
    color: '#fff',
  },
  disabled: {
    opacity: 0.35,
  },
});
