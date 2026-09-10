import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { markPostRead } from '../data/postViews';
import { avancerLecture, type Boite } from '../utils/lectureVisibilite';

/** Cadence du minuteur. Une seconde : assez fin pour 8 s, assez lâche pour ne rien coûter. */
const TICK_MS = 1000;

/**
 * Décide quand une main du fil est LUE, et le signale.
 * ────────────────────────────────────────────────────
 * Deux chemins, et un seul suffit :
 *   · le DÉROULÉ — l'utilisateur avance le replayer de la carte (`marquerDeroule`) ;
 *   · la DURÉE — 8 s avec la moitié de la carte à l'écran (cf. `lectureVisibilite`, qui porte
 *     toute l'arithmétique et est éprouvé au banc).
 *
 * La visibilité vient des `onLayout` des cartes et de la position de défilement, et non d'un
 * `IntersectionObserver` : celui-ci n'existe pas en natif, et le passage au natif est déjà au
 * programme. Le même calcul tourne donc sur les deux plateformes.
 *
 * ⚠️ Le minuteur est suspendu en arrière-plan. Les navigateurs continuent de faire tourner un
 * `setInterval` dans un onglet caché : sans ce garde, une main laissée à l'écran pendant qu'on
 * fait autre chose serait comptée comme lue.
 */
export function useReadTracking(postIds: string[], actif: boolean) {
  const boites = useRef(new Map<string, Boite>());
  const fenetre = useRef({ offset: 0, height: 0 });
  const cumul = useRef(new Map<string, number>());
  const ids = useRef<string[]>(postIds);

  // Sans tableau de dépendances : la liste change à chaque page chargée, et la recopier est
  // moins cher que de la comparer.
  useEffect(() => {
    ids.current = postIds;
  });

  /** Position d'une carte DANS le contenu défilant — `onLayout` la donne relative à son parent,
   * qui est ici le conteneur du ScrollView : la même origine que `contentOffset`. */
  const mesurer = useCallback((postId: string, y: number, h: number) => {
    boites.current.set(postId, { y, h });
  }, []);

  const suivreDefilement = useCallback((offset: number, height: number) => {
    fenetre.current = { offset, height };
  }, []);

  /** Le déroulé n'attend pas le minuteur : c'est déjà la preuve qu'on a lu. */
  const marquerDeroule = useCallback((postId: string) => {
    void markPostRead(postId);
  }, []);

  useEffect(() => {
    if (!actif) return undefined;
    const timer = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      for (const postId of avancerLecture(
        ids.current,
        boites.current,
        fenetre.current,
        cumul.current,
        TICK_MS
      )) {
        void markPostRead(postId);
      }
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [actif]);

  return { mesurer, suivreDefilement, marquerDeroule };
}
