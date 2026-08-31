import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { Card, GameType, Seat } from '../../types/poker';
import type { PotAward } from '../../engine/handEngine';
import {
  boardCardSize,
  boardVerticalOffset,
  GABARIT_FEED,
  layoutSeats,
  POT_PILL_HEIGHT,
  type Gabarit,
} from '../../engine/layout';
import { colors } from '../../theme/theme';
import type { CodeDevise } from '../../utils/currency';
import { Pressable } from '../ui/Pressable';
import { TableSurface } from '../replayer/TableSurface';
import { BoardView } from '../replayer/BoardView';
import { SeatView } from '../replayer/SeatView';

/**
 * LA TABLE, SANS CE QUI LA FAIT BOUGER.
 * ─────────────────────────────────────
 * Extraite de `HandReplayer` pour qu'un DEUXIÈME appelant puisse la remplir : le créateur de main,
 * qui doit montrer en direct ce qu'on est en train de construire. Le replayer y branche l'état
 * calculé par `computeHandState` sur une main publiée ; le créateur y branchera ce qu'il a déjà
 * sous la main (sièges actifs, contributions de la street, stacks restants, siège qui parle).
 * Un seul rendu, deux alimentations.
 *
 * Ce composant ne SAIT rien : ni qui a gagné, ni pourquoi un siège est couché, ni où en est la
 * relecture. On lui dit ce qu'il faut dessiner, il s'occupe d'OÙ le dessiner — l'ellipse des
 * sièges, le recentrage du board, le trajet des jetons vers le vainqueur. Toute la géométrie vit
 * ici, toute la sémantique reste chez l'appelant.
 *
 * Il vit dans `components/table/` et non `components/replayer/` pour une raison qui compte au
 * moment de le relire : le créateur n'a rien à importer d'un dossier qui s'appelle « replayer ».
 * Ses briques (`TableSurface`, `SeatView`, `BoardView`), elles, n'ont pas bougé — les déplacer
 * n'aurait rien apporté et aurait touché du code qui marche.
 */

/** Ce qu'il faut dire d'un siège pour le dessiner. Aucun champ ne dit POURQUOI il est dans cet état. */
export interface SiegeAffiche {
  seat: Seat;
  /** Couché (ou mucké) : libellé « fold », nom estompé, cartes qui s'effacent. */
  folded?: boolean;
  /** Dos de carte à la place de la vraie main, sans rien estomper (cf. `SeatView`). */
  showCardBacks?: boolean;
  /** Vient de se coucher / de checker à cet instant précis — libellé ponctuel. */
  justFolded?: boolean;
  justChecked?: boolean;
  stackRemaining: number;
  /** Mise posée devant lui sur la street en cours. */
  currentBet?: number;
  /** C'est à lui de parler : halo doré. */
  isActive?: boolean;
  isWinner?: boolean;
  isAllIn?: boolean;
  equityPct?: number;
  straddleLabel?: string | null;
  /** Ses cartes manquantes sont ATTENDUES : pointillés à leur place, pas des dos (cf. `SeatView`). */
  cartesAttendues?: boolean;
  /** Sa mise affichée est une SAISIE EN COURS : jeton creux, montant italique, et `stackRemaining`
   *  vaut alors le tapis PROJETÉ (cf. `SeatView`). */
  miseFantome?: boolean;
  /** Toucher une de ses cartes fermées (index dans la main affichée). Absent, elles sont inertes. */
  onCartePress?: (index: number) => void;
}

export interface TableVueProps {
  /** Dans l'ordre où l'appelant les a : `layoutSeats` les replace lui-même depuis le héros. */
  sieges: SiegeAffiche[];
  /** Les cartes du board. Un trou (`undefined`) dans la longueur fournie est une carte ATTENDUE,
   *  dessinée en pointillés à sa place (cf. `BoardView`). */
  board: (Card | undefined)[];
  /** Second board (bomb pot double board) — absent = un seul board. */
  board2?: (Card | undefined)[];
  pot: number;
  /** Sièges gagnants : leurs jetons cessent de glisser vers le pot et repartent vers eux. */
  gagnants?: string[];
  /** Répartition détaillée du pot (double board : les parts ne sont pas égales). */
  potAwards?: PotAward[];
  /** Ce que dit la pastille centrale quand la main s'achève sans vainqueur. */
  unresolvedNote?: string | null;
  equityPending?: boolean;
  gameType: GameType;
  currency?: CodeDevise;
  bb: number;
  useBB?: boolean;
  holeCardCount: number;
  /**
   * Hauteur imposée, en px. Absente, la table garde la proportion du replayer
   * (largeur × 1,25, cf. `aspectRatio: 0.8`) — c'est ce que fait le feed depuis toujours.
   * Le créateur, lui, la calcule : il n'a pas la place d'une table de vitrine.
   */
  hauteur?: number;
  /** Taille de ce qu'on dessine (cf. `Gabarit`). Absent = le gabarit du feed, inchangé. */
  gabarit?: Gabarit;
  /**
   * Cette table montre un RÉGLAGE en cours d'édition, pas une main qui se déroule : les mises
   * forcées y apparaissent et disparaissent au gré des cases cochées, sans qu'aucune street ne se
   * termine. Les jetons ne glissent donc pas vers le pot quand ils s'en vont (cf. `SeatView`).
   */
  sansGeste?: boolean;
  /**
   * Toucher UNE carte du board (index dans la rangée). Fourni, chaque emplacement en jeu devient une
   * cible : les cartes ne vivent plus dans un formulaire, elles vivent sur le feutre, et c'est là
   * qu'on tape pour les changer — y compris celles d'une street déjà passée.
   * Absent (le feed), rien n'est cliquable et la table reste inerte, comme avant.
   */
  onCarteBoardPress?: (index: number) => void;
  /** Idem pour le second board d'un bomb pot double board. */
  onCarteBoard2Press?: (index: number) => void;
  /**
   * La main n'a pas commencé : aucune rangée de board, seulement la pastille de pot. Les étapes de
   * réglage du créateur (contexte, cartes de Hero) l'utilisent pour gagner la hauteur que des
   * emplacements vides ne méritent pas.
   */
  sansBoard?: boolean;
}

/**
 * Décalage des jetons vers le centre quand ils repartent chez un vainqueur : sans lui, la pastille
 * de pot atterrit pile sur les cartes du gagnant plutôt qu'à côté, illisible dès qu'il y a un split.
 */
const WINNER_TARGET_NUDGE = 48;

export function TableVue({
  sieges,
  board,
  board2,
  pot,
  gagnants = [],
  potAwards = [],
  unresolvedNote = null,
  equityPending,
  gameType,
  currency,
  bb,
  useBB = false,
  holeCardCount,
  hauteur,
  gabarit = GABARIT_FEED,
  sansGeste = false,
  onCarteBoardPress,
  onCarteBoard2Press,
  sansBoard = false,
}: TableVueProps) {
  /**
   * LA MESURE DE LA TABLE — `onLayout`, avec un filet.
   *
   * `onLayout` reste le chemin normal, en natif comme sur le web, et il n'y a rien à lui reprocher
   * en production. Mais il repose sur un `ResizeObserver`, qui ne tourne pas dans un onglet non
   * peint : dans un navigateur automatisé à panneau masqué, il ne se déclenche jamais et la table
   * reste à 0×0 — invisible, sans la moindre erreur en console, le seul signe étant une zone vide
   * de la bonne hauteur. Deux heures de fausse piste le 30/08/2026.
   *
   * D'où ce filet : une mesure DOM directe, UNE SEULE FOIS après le montage, et seulement si
   * `onLayout` n'a rien donné (en react-native-web, la ref d'une `View` EST le nœud DOM). Pas de
   * `ResizeObserver` en plus — le feed affiche autant de tables que de posts, et il n'y a aucune
   * raison d'en payer un par table pour un cas qui ne se produit pas chez l'utilisateur.
   */
  const [size, setSize] = useState({ width: 0, height: 0 });
  const zone = useRef<View | null>(null);
  const majTaille = (width: number, height: number) =>
    setSize((s) => (s.width === width && s.height === height ? s : { width, height }));
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    majTaille(width, height);
  };

  useLayoutEffect(() => {
    if (size.width > 0) return;
    const el = zone.current as unknown as HTMLElement | null;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const r = el.getBoundingClientRect();
    // Arrondi À L'ENTIER, comme le fait `onLayout` : sans lui la mesure DOM est plus fine (487,5 là
    // où `onLayout` annonce 488) et toute la table se décalerait d'un demi-pixel selon le chemin
    // emprunté — deux rendus différents pour la même table, ce qu'on veut justement éviter.
    if (r.width > 0 && r.height > 0) majTaille(Math.round(r.width), Math.round(r.height));
  }, [size.width]);

  const seats = useMemo(() => sieges.map((s) => s.seat), [sieges]);
  const seatCoords = useMemo(
    () => (size.width > 0 ? layoutSeats(seats, size.width, size.height, 0.16, gabarit) : []),
    [seats, size.width, size.height, gabarit]
  );
  const tableCenter = { x: size.width / 2, y: size.height / 2 };

  const nudgeTowardCenter = (sc: { x: number; y: number }) => {
    const dx = tableCenter.x - sc.x;
    const dy = tableCenter.y - sc.y;
    const dist = Math.hypot(dx, dy) || 1;
    return { x: sc.x + (dx / dist) * WINNER_TARGET_NUDGE, y: sc.y + (dy / dist) * WINNER_TARGET_NUDGE };
  };

  // Coordonnées ABSOLUES (repère table) de CHAQUE siège gagnant — plusieurs en cas de split pot.
  const winnerCoordsList = gagnants
    .map((id) => seatCoords.find((sc) => sc.seat.id === id))
    .filter((sc): sc is (typeof seatCoords)[number] => Boolean(sc))
    .map((sc) => ({ ...sc, ...nudgeTowardCenter(sc) }));

  // Parts de pot à faire glisser vers chaque vainqueur, avec leur MONTANT réel — gère le double
  // board où les parts ne sont pas égales (0,5/0,5, scoop, ou 0,25/0,75). Les montants sont calculés
  // à l'unité près (centime en cash, jeton en tournoi) et le reste d'arrondi va à la dernière part,
  // pour que la somme des parts égale exactement le pot.
  const potUnit = gameType === 'cash' ? 100 : 1;
  const totalPotUnits = Math.round(pot * potUnit);
  let allocatedUnits = 0;
  const winnerShares = potAwards
    .map((award, i) => {
      const sc = seatCoords.find((s) => s.seat.id === award.seatId);
      if (!sc) return null;
      const units =
        i === potAwards.length - 1 ? totalPotUnits - allocatedUnits : Math.round(totalPotUnits * award.fraction);
      allocatedUnits += units;
      const nudged = nudgeTowardCenter(sc);
      return { x: nudged.x - tableCenter.x, y: nudged.y - tableCenter.y, amount: units / potUnit };
    })
    .filter((s): s is { x: number; y: number; amount: number } => s !== null);

  // Chaque SeatView ne prend qu'UNE cible (cf. son système de glissement à deux segments) : on lui
  // donne le vainqueur le plus proche plutôt que de fragmenter visuellement le petit tas de jetons
  // d'un siège perdant entre plusieurs destinations. La pastille du pot, elle, se scinde réellement
  // en plusieurs parts (cf. `BoardView`) — c'est elle qui porte le vrai montant.
  function nearestWinnerPos(seatX: number, seatY: number): { x: number; y: number } | null {
    if (winnerCoordsList.length === 0) return null;
    let best = winnerCoordsList[0];
    let bestDist = Math.hypot(best.x - seatX, best.y - seatY);
    for (let i = 1; i < winnerCoordsList.length; i++) {
      const d = Math.hypot(winnerCoordsList[i].x - seatX, winnerCoordsList[i].y - seatY);
      if (d < bestDist) {
        bestDist = d;
        best = winnerCoordsList[i];
      }
    }
    return { x: best.x, y: best.y };
  }

  const parSiege = useMemo(() => new Map(sieges.map((s) => [s.seat.id, s])), [sieges]);

  const leBoard = (
    <BoardView
      cards={board}
      cards2={board2}
      pot={pot}
      winnerShares={winnerShares}
      unresolvedNote={unresolvedNote}
      gameType={gameType}
      currency={currency}
      tableWidth={size.width}
      gabarit={gabarit}
      // Sans rangée de board, la pastille de pot prend LA PLACE des cartes du board plutôt
      // que de flotter au-dessus du vide qu'elles auraient laissé. Mesuré : recentrée
      // naïvement, elle mordait le jeton de la grosse blinde, qui descend jusqu'où le board
      // l'arrêtait — les 53 px libérés ne sont pas libres n'importe où, ils le sont là.
      verticalOffset={
        sansBoard
          ? boardVerticalOffset(undefined, gabarit) +
            boardCardSize(size.width, gabarit).height / 2 +
            POT_PILL_HEIGHT / 2
          : boardVerticalOffset(undefined, gabarit)
      }
      bb={bb}
      useBB={useBB}
      onCartePress={onCarteBoardPress}
      onCartePress2={onCarteBoard2Press}
    />
  );

  return (
    <View
      ref={zone}
      style={[styles.tableArea, hauteur !== undefined ? { height: hauteur } : styles.proportionFeed]}
      onLayout={onLayout}
    >
      <TableSurface width={size.width} height={size.height} />

      {size.width > 0 && (
        <View
          style={[styles.boardWrapper, { width: size.width, height: size.height }]}
          // `box-none` et non `none` : le calque laisse passer les touchers partout SAUF sur ses
          // enfants — donc seules les cartes du board, petites et centrées, deviennent des cibles.
          // Le reste du feutre continue de ne rien intercepter.
          //
          // L'enveloppe tactile de chaque carte n'existe QUE si quelqu'un l'a demandée (cf.
          // `BoardView`). Mesuré le 31/08 : un `Pressable` désactivé reste un nœud dans l'arbre, et
          // il suffisait à décaler les 159 éléments du replayer. Le feed ne paye rien pour une
          // fonction du créateur.
          pointerEvents={onCarteBoardPress || onCarteBoard2Press ? 'box-none' : 'none'}
        >
          {leBoard}
        </View>
      )}

      {seatCoords.map(({ seat, x, y }) => {
        const s = parSiege.get(seat.id);
        if (!s) return null;
        return (
          <SeatView
            key={seat.id}
            seat={seat}
            x={x}
            y={y}
            tableCenter={tableCenter}
            folded={Boolean(s.folded)}
            showCardBacks={s.showCardBacks}
            stackRemaining={s.stackRemaining}
            currentBet={s.currentBet}
            isActive={Boolean(s.isActive)}
            justFolded={s.justFolded}
            justChecked={s.justChecked}
            isWinner={s.isWinner}
            isAllIn={s.isAllIn}
            equityPct={s.equityPct}
            equityPending={equityPending}
            winnerSeatPos={nearestWinnerPos(x, y)}
            gameType={gameType}
            currency={currency}
            bb={bb}
            useBB={useBB}
            straddleLabel={s.straddleLabel}
            holeCardCount={holeCardCount}
            gabarit={gabarit}
            sansGeste={sansGeste}
            miseFantome={s.miseFantome}
            cartesAttendues={s.cartesAttendues}
            onCartePress={s.onCartePress}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tableArea: {
    width: '100%',
    position: 'relative',
    backgroundColor: colors.feedBackground,
  },
  // Ovale plus HAUT que large : c'est ce qui crée l'anneau de felt entre les sièges et le board
  // central. Sans cette hauteur, le board (large) touche presque les sièges de côté et il n'existe
  // aucun espace "devant le joueur" pour poser une mise sans chevaucher — aucun algorithme de
  // placement ne peut inventer de l'espace inexistant.
  proportionFeed: {
    aspectRatio: 0.8,
  },
  boardWrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    justifyContent: 'center',
    alignItems: 'center',
    // Le pot doit toujours rester visible au-dessus des jetons de mise "posés" (SeatView), même si
    // un siège vient après lui dans le JSX — le zIndex interne de la pastille ne suffit pas, il ne
    // joue que face à ses propres frères, pas face à un autre arbre de composants.
    zIndex: 10,
  },
});
