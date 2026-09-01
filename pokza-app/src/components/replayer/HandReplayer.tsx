import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { Hand } from '../../types/poker';
import { holeCardCount } from '../../types/poker';
import {
  computeHandState,
  describeAction,
  expeditedFoldEventIndices,
  initialReplayStep,
  seatLabel,
  straddleSeatLabel,
  totalReplaySteps,
  type EquitySituation,
} from '../../engine/handEngine';
import { runEquityInSlices, situationKey } from '../../engine/equity';
import { useDisplayUnit } from '../../state/displayUnit';
import { TableVue, type SiegeAffiche } from '../table/TableVue';
import { ActionCallout } from './ActionCallout';
import { PlaybackControls } from './PlaybackControls';
import { UnitToggle, UNIT_TOGGLE_WIDTH } from './UnitToggle';

const AUTOPLAY_INTERVAL_MS = 1400;
/**
 * Durée d'un fold préflop « sans enjeu » (cf. `expeditedFoldEventIndices`) : presque trois fois plus
 * court que le reste. Valeur tranchée avec Victor le 23/08 — assez pour voir le siège s'éteindre et
 * savoir QUI passe. Beaucoup plus bas, la série de folds devient un clignotement illisible.
 */
const AUTOPLAY_FOLD_INTERVAL_MS = 500;

interface HandReplayerProps {
  hand: Hand;
}

/**
 * Équité calculée HORS du chemin de rendu.
 * ────────────────────────────────────────
 * `computeHandState` remplit déjà `state.equities` chaque fois que la valeur est disponible sans
 * bloquer — déjà en cache, ou énumérable exactement à partir du turn. Ce hook ne s'occupe que du
 * cas coûteux, le Monte-Carlo préflop, qu'il fait avancer par tranches en rendant la main au
 * navigateur entre chaque : pendant ce temps l'app reste défilable et les commandes répondent,
 * alors qu'avant le calcul gelait tout pendant 0,4 à 0,8 s sur iPhone.
 *
 * Le calcul est ABANDONNÉ dès que la situation change (l'utilisateur avance ou recule) : le
 * nettoyage du `useEffect` annule les tranches restantes plutôt que de laisser tourner un calcul
 * dont plus personne n'attend le résultat.
 *
 * Une fois un calcul terminé, sa valeur est en cache : tous les rendus suivants la retrouvent
 * SYNCHRONEMENT par `state.equities`, y compris après un aller-retour dans la main. L'état local
 * ci-dessous ne sert donc qu'à afficher le tout premier résultat, celui du calcul qui vient juste
 * de s'achever — sans lui, rien ne redéclencherait de rendu à cet instant précis.
 */
function useEquityHorsRendu(pending: EquitySituation | null): Record<string, number> | null {
  const [fini, setFini] = useState<{ cle: string; valeurs: Record<string, number> } | null>(null);
  // La clé décrit la situation ENTIÈRE (sièges, cartes, board, variante) : deux situations
  // différentes ont forcément deux clés différentes, donc la dépendance du `useEffect` est
  // complète même si `pending` n'y figure pas.
  const cle = pending ? situationKey(pending.contenders, pending.board, pending.variant) : null;

  useEffect(() => {
    if (!pending || cle === null) return;
    return runEquityInSlices(pending.contenders, pending.board, pending.variant, (valeurs) =>
      setFini({ cle, valeurs })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return cle !== null && fini?.cle === cle ? fini.valeurs : null;
}

export function HandReplayer({ hand }: HandReplayerProps) {
  const { useBB, toggleUseBB } = useDisplayUnit();
  const initialStep = useMemo(() => initialReplayStep(hand), [hand]);
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);

  const totalSteps = totalReplaySteps(hand);
  const state = useMemo(() => computeHandState(hand, step), [hand, step]);
  // `revealShowdown` supprime l'équité pour toute la main (cf. le commentaire sur `equityPct`
  // plus bas) : inutile de lancer le moindre calcul dans ce cas.
  const equityAsync = useEquityHorsRendu(hand.revealShowdown ? null : state.equityPending);
  const equities = state.equities ?? equityAsync;
  // "Calcul en cours" est un état À PART de "pas d'équité" : il doit rendre un vide, là où
  // l'absence d'équité retombe sur "ALL-IN". Sans cette distinction, le siège afficherait
  // "ALL-IN" pendant le calcul puis basculerait sur un pourcentage — un clignotement.
  const equityEnCours = !hand.revealShowdown && state.equityPending !== null && equities === null;

  const expeditedFolds = useMemo(() => expeditedFoldEventIndices(hand), [hand]);
  // La durée d'un step, c'est le temps pendant lequel l'event DÉJÀ appliqué reste à l'écran : au
  // step `s`, le dernier event appliqué est `events[s - 1]` (cf. `computeHandState`, qui prend les
  // events jusqu'à `step` exclu). C'est donc bien la durée d'affichage du fold qu'on raccourcit,
  // pas celle de l'action qui le suit.
  const stepDelayMs = expeditedFolds.has(step - 1) ? AUTOPLAY_FOLD_INTERVAL_MS : AUTOPLAY_INTERVAL_MS;

  // Un `setTimeout` relancé à chaque step, et non un `setInterval` unique : c'est ce qui permet à
  // deux steps voisins de ne pas durer le même temps. L'effet ne dépend que de ces quatre valeurs —
  // un calcul d'équité qui se termine provoque un rendu mais ne redémarre pas le compte à rebours.
  useEffect(() => {
    if (!playing) return;
    if (step >= totalSteps) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => s + 1), stepDelayMs);
    return () => clearTimeout(id);
  }, [playing, step, totalSteps, stepDelayMs]);

  // Au step de départ (SB/BB déjà postées), pas de bulle d'action : ce n'est pas une
  // décision du joueur, il n'y a rien à annoncer avant la première vraie action.
  // `allInSeatIds` persiste jusqu'à la fin de la main (cf. handEngine) : cette action précise n'est
  // "le" moment du tapis que si son propre siège vient d'y passer ET qu'elle a un montant (fold et
  // check ne peuvent jamais vider un stack). Ne s'applique que si le step courant EST cette action
  // (pas un event "reveal" qui suit, cf. ci-dessous) — sinon le prochain texte affiché hériterait
  // à tort du rouge du tapis qui vient de se produire juste avant.
  const currentEventIsAction = state.lastEvent?.kind === 'action';
  const lastActionIsAllIn = Boolean(
    currentEventIsAction &&
      state.lastAction &&
      state.allInSeatIds.has(state.lastAction.seatId) &&
      state.lastAction.type !== 'fold' &&
      state.lastAction.type !== 'check'
  );
  // Un event "reveal" reste un step à part entière (cf. `buildReplayEvents` — le segment avance,
  // le board se met à jour, les mises se nettoient), mais n'affiche aucune bulle centrale : la
  // carte qui tombe se voit déjà sur le board, pas besoin de l'annoncer en plus par du texte.
  const actionText =
    step > initialStep && state.lastEvent?.kind === 'action'
      ? describeAction(hand, state.lastEvent.action, { isAllIn: lastActionIsAllIn, useBB })
      : null;

  /**
   * MAIN ARRÊTÉE PAR SON AUTEUR (cf. `Hand.stoppedAtSeatId`) : ce que montre la toute dernière image.
   *
   * Le pot ne bouge pas — `determinePotAwards` renonce en amont, donc `winningSeatIds` est vide et
   * rien ne glisse vers personne. Restent deux choses à dire, et elles se répondent : la BULLE
   * D'ACTION nomme le joueur qui devait parler, et le halo quitte celui qui vient de miser pour se
   * poser sur lui. Le lecteur voit alors la situation exacte : la mise posée devant l'adversaire,
   * et le siège à qui la parole revient — la question, en somme.
   *
   * La bulle plutôt qu'une note sous le board (décision de Victor) : c'est là que le replayer dit
   * ce qui vient de se passer, et une main qui s'arrête est le dernier de ces événements. Elle y
   * reste affichée (`persistent`), au lieu de s'effacer comme une action de passage.
   *
   * Le rouge du tapis ne peut pas la teindre : `lastActionIsAllIn` exige que le step courant SOIT
   * une action, ce que l'event final n'est pas.
   */
  const siegeEnAttente = step >= totalSteps ? hand.stoppedAtSeatId ?? null : null;
  // Un siège introuvable ne devrait jamais arriver (l'assistant n'écrit la marque qu'avec le siège
  // qui parlait), mais mieux vaut une phrase juste qu'un « À  de jouer » si une main venait d'ailleurs.
  const nomEnAttente = siegeEnAttente ? seatLabel(hand, siegeEnAttente) : '';
  const texteArret = siegeEnAttente
    ? nomEnAttente
      ? `À ${nomEnAttente} de jouer`
      : "La main s'arrête ici"
    : null;

  /**
   * L'ÉTAT DE CHAQUE SIÈGE, tel que la table doit le dessiner.
   * Tout ce qui est ici relève de la RELECTURE d'une main publiée — qui a montré, qui a mucké,
   * quelle main est encore cachée jusqu'au showdown. `TableVue` n'en sait rien et n'a pas à le
   * savoir : elle reçoit des états, pas des raisons.
   */
  const sieges: SiegeAffiche[] = hand.seats.map((seat) => {
    // Le libellé "fold" (+ nom estompé) ne concerne qu'un vrai fold, ou le muck classique de fin de
    // main pour un adversaire non gagnant dont on ne connaît PAS les cartes — jamais Hero, jamais un
    // adversaire encore actif (mid-hand) qui n'a simplement pas encore agi.
    const hasWinner = state.winningSeatIds.length > 0;
    const isWinner = state.winningSeatIds.includes(seat.id);
    const villainKnownCards = !seat.isHero && Boolean(seat.holeCards);
    const showFoldLabel =
      state.foldedSeatIds.has(seat.id) || (hasWinner && !isWinner && !seat.isHero && !villainKnownCards);

    // Dos de carte (pas d'opacité touchée, le siège reste normalement actif) : un adversaire dont
    // les cartes sont connues (saisies à l'abattage) mais que le créateur a choisi de ne révéler
    // qu'au showdown (`hand.revealShowdown`) — dos de carte jusqu'à l'event `revealCards`, UN CRAN
    // AVANT que le gagnant ne soit désigné : les mains se dévoilent d'abord, le pot part vers le
    // vainqueur ensuite, deux steps distincts. Désactivé : vraie carte visible dès le début.
    const showCardBacks = villainKnownCards && Boolean(hand.revealShowdown) && !state.cardsRevealed;

    return {
      seat,
      folded: showFoldLabel,
      showCardBacks,
      stackRemaining: state.stacks[seat.id] ?? seat.startingStack,
      currentBet: state.streetContribution[seat.id],
      isActive: siegeEnAttente
        ? seat.id === siegeEnAttente
        : state.lastAction?.seatId === seat.id && !state.foldedSeatIds.has(seat.id),
      // Même condition que la bulle d'action : `state.lastAction` survit aux events qui ne sont pas
      // des actions (révélation d'une street, retournement des mains), le libellé se rallumerait
      // donc à contretemps sans le garde `currentEventIsAction`.
      justFolded:
        currentEventIsAction && state.lastAction?.seatId === seat.id && state.lastAction.type === 'fold',
      justChecked:
        currentEventIsAction && state.lastAction?.seatId === seat.id && state.lastAction.type === 'check',
      isWinner,
      isAllIn: state.allInSeatIds.has(seat.id),
      // L'équité est une comparaison ENTRE toutes les mains en lice : dès qu'une seule main du coup
      // est cachée (`revealShowdown`), le % n'est plus interprétable pour AUCUN siège — y compris
      // Hero, dont le chiffre dépend justement de la main cachée pour avoir un sens. Supprimé pour
      // tout le monde, pas seulement le siège caché. Retombe sur "ALL-IN" (un fait neutre sur le
      // stack, pas sur la main).
      equityPct: hand.revealShowdown ? undefined : equities?.[seat.id],
      straddleLabel: straddleSeatLabel(hand.seats, hand.actions, seat.id),
    };
  });

  return (
    <View style={styles.container}>
      <TableVue
        sieges={sieges}
        board={state.board}
        board2={hand.board2 ? state.board2 : undefined}
        pot={state.potTotal}
        gagnants={state.winningSeatIds}
        potAwards={state.potAwards}
        // Le board ne parle plus que de L'AUTRE fin sans vainqueur : la main est allée à son terme
        // et personne n'a montré. `!texteArret` est indispensable — sans lui, une main arrêtée
        // retomberait ici et s'annoncerait « Mains non révélées », ce qui n'est pas ce qu'elle raconte.
        unresolvedNote={
          step >= totalSteps && state.winningSeatIds.length === 0 && !texteArret ? 'Mains non révélées' : null
        }
        // "Calcul en cours" est un état À PART de "pas d'équité" : il doit rendre un vide, là où
        // l'absence d'équité retombe sur "ALL-IN". Sans cette distinction, le siège afficherait
        // "ALL-IN" pendant le calcul puis basculerait sur un pourcentage — un clignotement.
        equityPending={equityEnCours}
        gameType={hand.gameType}
        currency={hand.currency}
        bb={hand.blinds.bb}
        useBB={useBB}
        holeCardCount={holeCardCount(hand.variant)}
      />

      <View style={styles.calloutRow}>
        <View style={styles.calloutSpacer} />
        <ActionCallout
          text={texteArret ?? actionText}
          stepKey={step}
          danger={lastActionIsAllIn}
          persistent={Boolean(texteArret)}
        />
        <UnitToggle useBB={useBB} onToggle={toggleUseBB} />
      </View>

      <PlaybackControls
        playing={playing}
        step={step - initialStep}
        totalSteps={totalSteps - initialStep}
        canGoBack={step > initialStep}
        canGoForward={step < totalSteps}
        onBack={() => {
          setPlaying(false);
          setStep((s) => Math.max(initialStep, s - 1));
        }}
        onForward={() => {
          setPlaying(false);
          setStep((s) => Math.min(totalSteps, s + 1));
        }}
        onSeek={(i) => {
          setPlaying(false);
          setStep(Math.min(totalSteps, initialStep + i + 1));
        }}
        onTogglePlay={() => {
          setPlaying((p) => {
            if (!p && step >= totalSteps) setStep(initialStep);
            return !p;
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  calloutRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calloutSpacer: {
    width: UNIT_TOGGLE_WIDTH,
  },
});
