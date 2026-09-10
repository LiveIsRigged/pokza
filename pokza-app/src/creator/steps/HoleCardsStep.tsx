import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { Card, HeroCardsVisibility } from '../../types/poker';
import { Chip } from '../Chip';
import { MultiCardPicker } from '../MultiCardPicker';
import { WizardScreen } from '../WizardScreen';
import { TableVue } from '../../components/table/TableVue';
import { GABARIT_ATELIER, hauteurTableCartes } from '../../engine/layout';
import { potDeReglage, siegesDeReglage } from '../tableReglage';
import type { ContextData } from '../types';
import { useT, type Cle } from '../../i18n';

interface HoleCardsStepProps {
  /** Nombre de cartes à choisir selon la variante : 2 (Hold'em), 4 (PLO) ou 5 (PLO5). */
  count: number;
  cards: (Card | undefined)[];
  onChange: (cards: (Card | undefined)[]) => void;
  onNext: () => void;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
  /** Correction en cours : « Valider » publie directement au lieu de continuer l'assistant. */
  nextLabel?: string;
  /** La phrase collée au bouton, qui annonce ce que le changement en cours va coûter. */
  footerNote?: string | null;
  /** Empêche de valider une correction qui ne change rien — elle coûterait ses réactions pour rien. */
  nextBloque?: boolean;
  /** La table réglée à l'étape précédente : les cartes choisies ici s'y posent devant Hero. */
  context: ContextData;
  /** Ce que le lecteur verra de cette main, et quand (cf. `Hand.heroCardsVisibility`). */
  visibility: HeroCardsVisibility;
  onChangeVisibility: (v: HeroCardsVisibility) => void;
}

/**
 * TROIS ÉTATS, PAS DEUX INTERRUPTEURS (Victor, 08/09/2026).
 * ────────────────────────────────────────────────────────
 * Deux besoins ont donné cet écran : « j'étais à table mais pas dans le coup » — les cartes ne
 * comptent pas, on ne veut pas les chercher — et « devine ce que j'avais ». La première version
 * proposait deux boutons (« ne pas rentrer » / « cacher »), qui s'excluaient l'un l'autre : quatre
 * combinaisons pour trois états valides, plus un état illégal à empêcher. C'est une question
 * unique — QU'EST-CE QUE LE LECTEUR VOIT DE TA MAIN ? — et elle se pose en une rangée.
 *
 * ⚠️ « NE PAS RENTRER SES CARTES » N'EST PAS UNE QUATRIÈME PASTILLE, et ce n'est pas un oubli. Du
 * point de vue du LECTEUR, « cachées » et « pas rentrées » sont rigoureusement la même chose : dos
 * de carte, pour toujours. La seule différence est côté moteur — avec les cartes, l'abattage se
 * départage ; sans elles, non. D'où : sous « Cachées », le sélecteur devient FACULTATIF, et
 * remplir sans montrer devient un vrai gain plutôt qu'un pis-aller.
 *
 * L'ordre va du plus montré au moins montré — la rangée se lit comme un variateur — et la première
 * pastille reste celle qu'on veut presque toujours, ce qui est la leçon déjà payée sur l'écran
 * d'abattage : qui lit vite prend la première.
 *
 * AUCUNE PHRASE D'EXPLICATION SOUS LA RANGÉE, et ce n'est pas un oubli (Victor, 08/09/2026). Il y
 * en avait une par choix ; deux répétaient leur étiquette mot pour mot (« Visibles » → « visibles
 * dès le début », « Cachées » → « personne ne les verra »). Le seul fait qui ne se devine pas —
 * que le sélecteur devienne FACULTATIF sous « Cachées » — est porté par le sous-titre, qui passe
 * alors à « ou laisse vide ». Une phrase de plus n'aurait rien dit et aurait coûté une ligne sur
 * un écran qui n'en a pas à donner.
 */
// Des CLÉS, pas des libellés : la table est calculée une fois au chargement du module, donc un
// libellé figé ici resterait dans la langue du démarrage.
const CHOIX: { valeur: HeroCardsVisibility; cle: Cle }[] = [
  { valeur: 'visible', cle: 'createur.visibilite_visibles' },
  { valeur: 'end', cle: 'createur.visibilite_fin' },
  { valeur: 'never', cle: 'createur.visibilite_cachees' },
];

export function HoleCardsStep({
  count,
  cards,
  onChange,
  onNext,
  onBack,
  step,
  totalSteps,
  nextLabel,
  footerNote,
  nextBloque,
  context,
  visibility,
  onChangeVisibility,
}: HoleCardsStepProps) {
  const t = useT();
  const chosenCount = cards.filter(Boolean).length;
  // Sous « Cachées » seulement, la main vide est un choix : 0 ou toutes. Une seule carte sur deux
  // reste bloquée dans tous les cas — ça, ce n'est pas un choix, c'est une saisie interrompue.
  const canContinue = chosenCount === count || (visibility === 'never' && chosenCount === 0);
  // Les cartes se posent devant Hero À MESURE qu'on les choisit, et pas seulement une fois les
  // deux (ou quatre, ou cinq) réunies : c'est le seul écran où l'on voit sa propre main arriver.
  const choisies = cards.filter(Boolean) as Card[];
  // Taper une carte SUR LA TABLE la retire, exactement comme taper la même carte dans le sélecteur.
  // C'est ce qui autorise à supprimer l'aperçu sous la table : la sélection ne se relit plus dans
  // une rangée à part, elle se relit — et se défait — là où elle se joue.
  const sieges = siegesDeReglage(context, choisies).map((s) =>
    s.seat.isHero
      ? {
          ...s,
          // Les cartes pas encore choisies se dessinent en pointillés devant Hero, à leur place.
          // Deux dos de carte diraient « il a une main qu'on ne connaît pas » — l'inverse de ce
          // qui se passe ici, où on attend justement qu'il la choisisse.
          //
          // SAUF SOUS « CACHÉES », où c'est exactement l'inverse qui devient vrai : plus personne
          // n'attend rien, et « une main qu'on ne connaît pas » est précisément ce que la table
          // doit dire. Le feutre montre donc tout de suite ce que le choix produira.
          cartesAttendues: visibility !== 'never',
          onCartePress: (i: number) => onChange(choisies.filter((_, j) => j !== i)),
        }
      : s
  );

  return (
    <WizardScreen
      title={t('createur.tes_cartes_titre')}
      subtitle={t(
        visibility === 'never' ? 'createur.tes_cartes_sous_titre_vide' : 'createur.tes_cartes_sous_titre',
        { n: count }
      )}
      onNext={onNext}
      nextLabel={nextLabel}
      footerNote={footerNote}
      onBack={onBack}
      nextDisabled={!canContinue || Boolean(nextBloque)}
      step={step}
      totalSteps={totalSteps}
      zoneFixe={
        <TableVue
          sieges={sieges}
          board={[]}
          sansBoard
          sansGeste
          pot={potDeReglage(context)}
          gameType={context.gameType}
          currency={context.currency}
          bb={context.bombPot ? context.bombAnte : context.bb}
          holeCardCount={count}
          hauteur={hauteurTableCartes(context.numPlayers)}
          gabarit={GABARIT_ATELIER}
        />
      }
    >
      {/* LES CARTES NE TOUCHENT PAS LE FEUTRE (Victor, 02/09/2026). Mesuré : le bas de la table
          et le haut de la grille étaient au MÊME pixel (342), là où les écrans de street laissent
          46 px — occupés chez eux par la rangée « À X de jouer ». Cet écran n'a rien à y mettre :
          on reprend donc seulement l'espacement de cette rangée (12 px de rembourrage haut, 6 de
          marge basse), pas la bande vide de 40 px qu'elle réserve pour son contenu. */}
      <View style={styles.rangeeVisibilite}>
        {CHOIX.map((c) => (
          <Chip
            key={c.valeur}
            label={t(c.cle)}
            selected={visibility === c.valeur}
            onPress={() => onChangeVisibility(c.valeur)}
          />
        ))}
      </View>
      <View style={styles.selecteur}>
        <MultiCardPicker count={count} selected={cards} onChange={onChange} sansApercu />
      </View>
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  rangeeVisibilite: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    marginBottom: 6,
  },
  // 18 px séparaient la table du sélecteur quand rien ne s'intercalait (mesure du 02/09). La rangée
  // s'est glissée entre les deux : on redonne ce même 18 sous elle, pour que le sélecteur garde
  // l'espace qu'il avait au-dessus de lui plutôt que de se coller à ce qui vient d'arriver.
  selecteur: {
    paddingTop: 12,
  },
});
