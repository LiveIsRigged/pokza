import React, { useLayoutEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, spacing, tints, typography } from '../theme/theme';
import { useLeftEdgeSwipe } from '../navigation/edgeSwipe';
import { RESIDU_TOLERE } from './debordement';

/**
 * LE RAIL DE DÉFILEMENT — « il y a une suite, et voilà combien ».
 * ──────────────────────────────────────────────────────────────
 * Le problème d'origine (Victor, 03/09/2026) : à l'étape 1, rien ne dit qu'il faut défiler, et un
 * premier utilisateur peut remplir les blindes puis toucher « Continuer » en croyant avoir fini.
 * Mesuré par une sonde sur son appareil : le formulaire fait 1172 px pour une lucarne de 460 —
 * **61 % du contenu est sous le pli.**
 *
 * ⚠️ POURQUOI UN RAIL ET PAS UN FONDU. Un fondu a été tenté toute la journée du 03/09 : six
 * versions, six rejets, toujours le même mot — « bandes blanches ». Jamais élucidé, jamais
 * reproduit ailleurs que sur son téléphone. La leçon retenue : **ne rien poser de translucide
 * par-dessus le contenu.** Un rail ne recouvre rien, ne peut pas être pris pour un défaut
 * d'affichage, et dit une chose de plus que le fondu — non seulement « il y a une suite » mais
 * « il en reste tant ». C'est le seul repère qu'on n'avait jamais essayé.
 *
 * La barre native ne suffit pas : sur iOS elle n'apparaît QUE pendant qu'on défile, donc jamais
 * pour celui qu'on veut prévenir — celui qui ne défile pas. D'où ce rail permanent, dessiné par
 * l'app, tant que le contenu déborde.
 */
/** 3 px, la convention iOS pour un indicateur de défilement. */
const RAIL_LARGEUR = 3;
/** Le curseur ne descend jamais sous 24 px : en dessous il cesse d'être saisissable à l'œil sur un
 *  contenu très long. `spacing.lg` du thème, pas une valeur inventée. */
const RAIL_CURSEUR_MIN = spacing.lg;
/** Posé dans la marge du conteneur (`spacing.sm`), pas au ras du contenu : à `right: 0` il
 *  tomberait pile sur la bordure droite des champs de saisie, qui font toute la largeur, et se
 *  lirait comme un épaississement de leur contour plutôt que comme un rail. */
const RAIL_DECALAGE = spacing.sm;

interface WizardScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  onBack?: () => void;
  step?: number;
  totalSteps?: number;
  /** Permet à l'étape d'accéder au ScrollView (ex. faire défiler jusqu'à une section dépliée). */
  scrollRef?: React.RefObject<ScrollView | null>;
  /**
   * Une phrase collée au bouton, qui dit la conséquence de ce qu'on vient de faire — utilisée par
   * la correction d'une main, où le bouton change de sens selon les champs modifiés (« Valider »
   * publie, « Continuer » fait ressaisir la suite). Elle est là pour que ce basculement soit
   * ANNONCÉ et non subi : un bouton qui change de rôle sous le doigt, sans un mot, fait mal taper.
   */
  footerNote?: string | null;
  /**
   * Une sortie SECONDAIRE, sous le bouton principal : un lien texte, pas une pastille. Sert aux
   * écrans de street, qui n'ont justement pas de bouton principal (leur sortie normale, c'est
   * d'enregistrer les actions jusqu'à ce que la street se termine d'elle-même) et dont
   * l'emplacement du bas est donc vide — c'est là que se pose « Arrêter la main ici ».
   *
   * Volontairement un lien et non une pastille : la pastille orange veut dire « la suite normale de
   * l'assistant », et une sortie de secours n'en est pas une. Elle deviendrait alors l'élément le
   * plus lourd de l'écran, juste sous des boutons d'action qui, eux, sont le vrai sujet.
   */
  footerLink?: { label: string; onPress: () => void };
  /**
   * UNE ZONE QUI NE DÉFILE PAS, entre le titre et le contenu — c'est là que se pose la table du
   * créateur. Elle est hors du `ScrollView` par nécessité, pas par confort : un calque absolu dans
   * ce `ScrollView` défilerait avec le contenu et serait rogné (cf. `EditPostScreen.tsx:310`), et
   * une table qui disparaît quand on descend chercher une carte ne sert à rien.
   */
  zoneFixe?: React.ReactNode;
  /**
   * La rangée qui suit immédiatement la zone fixe, elle aussi immobile : le libellé de ce qu'on est
   * en train de faire à gauche, « ↩ Annuler » à droite. Séparée de `zoneFixe` parce qu'elle n'a rien
   * à voir avec la table — elle la commente, et l'annulation doit rester à portée sans défiler.
   */
  rangeeFixe?: React.ReactNode;
  /**
   * Le SOCLE : ce qui reste collé au-dessus du pied, sous le contenu qui défile. Les boutons
   * d'action d'une street y vivent, pour qu'on les tape toujours au même endroit — c'est le geste
   * le plus répété de tout le créateur, trente à quarante fois par main.
   */
  socle?: React.ReactNode;
}

export function WizardScreen({
  title,
  subtitle,
  children,
  onNext,
  nextLabel = 'Continuer',
  nextDisabled,
  onBack,
  step,
  totalSteps,
  scrollRef,
  footerNote,
  footerLink,
  zoneFixe,
  rangeeFixe,
  socle,
}: WizardScreenProps) {
  // Retour au glissement bord-gauche → droite, double du bouton ‹ Retour (étape précédente, ou
  // sortie du créateur à la première étape). Inerte quand l'étape n'a pas de retour.
  const backSwipe = useLeftEdgeSwipe(onBack ?? (() => {}), !!onBack);

  /**
   * LA MESURE — la géométrie dans l'état, la POSITION dans une `Animated.Value`.
   *
   * ⚠️ CE PARTAGE N'EST PAS UN DÉTAIL. `onScroll` tire soixante fois par seconde : mettre la
   * position dans l'état relancerait le rendu de tout l'écran à chaque image — table comprise,
   * alors qu'elle est de loin ce qu'on redessine le plus cher. Une `Animated.Value` écrit
   * directement dans le nœud et ne passe pas par React. La géométrie (hauteur du contenu, hauteur
   * de la lucarne), elle, ne bouge qu'au montage et quand une section se déplie : l'état lui va,
   * et il FAUT qu'elle y soit pour que l'interpolation ci-dessous soit reconstruite quand elle
   * change — sinon un dépliement laisserait le curseur calé sur l'ancienne longueur.
   */
  const [geometrie, setGeometrie] = useState({ contenu: 0, lucarne: 0 });
  const defilement = useRef(new Animated.Value(0)).current;
  const noter = (contenu: number, lucarne: number) => {
    if (!(contenu > 0) || !(lucarne > 0)) return;
    setGeometrie((g) => (g.contenu === contenu && g.lucarne === lucarne ? g : { contenu, lucarne }));
  };
  const zone = useRef<ScrollView | null>(null);
  // Deux destinataires pour une seule ref : la nôtre, et celle que l'étape passe pour se faire
  // défiler (cf. `scrollRef`, utilisé par l'étape 1 pour amener une section dépliée en vue).
  const attacher = (n: ScrollView | null) => {
    zone.current = n;
    if (scrollRef) (scrollRef as React.MutableRefObject<ScrollView | null>).current = n;
  };

  /**
   * LE FILET : une mesure DOM directe, plus un `ResizeObserver`.
   *
   * Sans lui le rail n'aurait aucun intérêt : `onScroll` ne se déclenche que si l'on défile, or le
   * rail doit être là AVANT — pour celui qui s'apprête à ne pas défiler. Un seul assistant est
   * monté à la fois, donc un seul observateur.
   *
   * On observe le conteneur de contenu ET la lucarne : un `ResizeObserver` regarde la boîte, pas
   * `scrollHeight` — sans le premier, une section qui se déplie ne rallongerait pas le rail.
   *
   * ⚠️ En react-native-web, la ref d'un `ScrollView` EST le nœud DOM défilant : `_setScrollNodeRef`
   * y accroche `getScrollableNode` avant de le transmettre (`exports/ScrollView/index.js:249-270`,
   * vérifié sur l'app en marche le 03/09).
   */
  useLayoutEffect(() => {
    const vue = zone.current as unknown as
      | (HTMLElement & { getScrollableNode?: () => HTMLElement | null })
      | null;
    const el = typeof vue?.getScrollableNode === 'function' ? vue.getScrollableNode() : vue;
    if (!el || typeof el.scrollHeight !== 'number') return;
    const mesurer = () => noter(el.scrollHeight, el.clientHeight);
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    const contenu = el.firstElementChild;
    if (contenu) observateur.observe(contenu);
    return () => observateur.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Le rail n'existe que si ça déborde vraiment. `RESIDU_TOLERE` absorbe la fraction de pixel que
  // les arrondis laissent parfois, qui le ferait sinon apparaître sur une page qui ne défile pas.
  const course = geometrie.contenu - geometrie.lucarne;
  const railVisible = geometrie.contenu > 0 && geometrie.lucarne > 0 && course > RESIDU_TOLERE;
  // Proportion vue / total, comme n'importe quelle barre de défilement : le curseur DIT combien il
  // reste, il ne fait pas que signaler qu'il reste quelque chose.
  const curseurHauteur = railVisible
    ? Math.max(RAIL_CURSEUR_MIN, (geometrie.lucarne * geometrie.lucarne) / geometrie.contenu)
    : 0;

  return (
    <View style={styles.container} {...backSwipe.panHandlers}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backText}>‹ Retour</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {step && totalSteps ? (
          <Text style={styles.stepIndicator}>
            Étape {step}/{totalSteps}
          </Text>
        ) : null}
      </View>
      <Text style={[typography.postTitle, styles.title]}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {/* La table déborde des marges de l'écran : elle va d'un bord à l'autre, comme dans le feed. */}
      {zoneFixe ? <View style={styles.zoneFixe}>{zoneFixe}</View> : null}
      {rangeeFixe ? <View style={styles.rangeeFixe}>{rangeeFixe}</View> : null}
      <View style={styles.lucarne}>
        <ScrollView
          ref={attacher}
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onLayout={(e: LayoutChangeEvent) => noter(geometrie.contenu, e.nativeEvent.layout.height)}
          onContentSizeChange={(_l: number, h: number) => noter(h, geometrie.lucarne)}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: defilement } } }], {
            // `false` et non `true` : react-native-web ne sait pas piloter une animation hors du
            // fil JS. Ça reste sans coût de rendu — `Animated` écrit dans le nœud sans passer par
            // React, c'est tout l'intérêt de sortir la position de l'état.
            useNativeDriver: false,
            listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const n = e.nativeEvent;
              noter(n.contentSize.height, n.layoutMeasurement.height);
            },
          })}
          // Sans ça, le premier appui clavier ouvert ne fait QUE refermer le clavier : il n'atteint
          // jamais l'élément visé. Une suggestion de lieu demanderait donc deux touchers, le premier
          // sans effet visible — et le même défaut frappe déjà toutes les pastilles de ces écrans.
          // « handled » ne garde le clavier que si un enfant a effectivement traité l'appui ; toucher
          // le vide le referme comme avant.
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {railVisible && (
          <View style={[styles.rail, { height: geometrie.lucarne }]} pointerEvents="none">
            <Animated.View
              style={[
                styles.railCurseur,
                {
                  height: curseurHauteur,
                  transform: [
                    {
                      translateY: defilement.interpolate({
                        inputRange: [0, course],
                        outputRange: [0, geometrie.lucarne - curseurHauteur],
                        // Sans ça, l'élastique d'iOS (on tire au-delà des deux bouts) enverrait le
                        // curseur hors du rail.
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        )}
      </View>
      {socle ? <View style={styles.socle}>{socle}</View> : null}
      {footerNote ? <Text style={styles.footerNote}>{footerNote}</Text> : null}
      {onNext && (
        <Pressable
          onPress={onNext}
          disabled={nextDisabled}
          style={[styles.nextButton, nextDisabled && styles.nextButtonDisabled]}
        >
          <Text style={styles.nextText}>{nextLabel}</Text>
        </Pressable>
      )}
      {footerLink && (
        <Pressable onPress={footerLink.onPress} style={styles.footerLink}>
          <Text style={styles.footerLinkText}>{footerLink.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 18,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    minHeight: 20,
  },
  backButton: {
    alignSelf: 'flex-start',
  },
  backText: {
    color: colors.action,
    fontSize: 14,
    fontWeight: '600',
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  // La lucarne : le conteneur qui porte le rail à côté de la zone défilante. Elle prend la place
  // que prenait le `ScrollView`, pour que rien d'autre ne bouge dans la colonne.
  lucarne: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  rail: {
    position: 'absolute',
    top: 0,
    // Négatif : le rail vit dans la marge du conteneur, à l'écart du bord droit des champs.
    right: -RAIL_DECALAGE,
    width: RAIL_LARGEUR,
    borderRadius: RAIL_LARGEUR / 2,
    backgroundColor: tints.light,
  },
  railCurseur: {
    width: RAIL_LARGEUR,
    borderRadius: RAIL_LARGEUR / 2,
    backgroundColor: borders.strong,
  },
  // `-18` annule le rembourrage du conteneur : la table touche les deux bords de l'écran.
  zoneFixe: {
    marginHorizontal: -18,
  },
  // PLUS DE FILET (Victor, 02/09/2026). Il prétendait marquer la frontière entre ce qui ne défile
  // pas — la table — et l'atelier en dessous. Mais il ne la marquait que sur DEUX écrans sur cinq :
  // les streets, et l'étape 1 seulement pendant un échange de sièges. Ni « Tes cartes », ni
  // l'abattage, ni la publication ne l'avaient, alors qu'ils ont exactement la même structure — et
  // l'étape 1, de loin celle qui défile le plus (1 280 px de formulaire pour 436 de lucarne), s'en
  // passait en temps normal. Une frontière qu'on ne trace qu'ici ne dit plus rien de général.
  //
  // ⚠️ `minHeight` DOIT couvrir le plus grand des occupants, sinon la rangée grandit quand il
  // arrive et POUSSE TOUT L'ATELIER VERS LE BAS. C'est ce qui se passait au préflop (signalé par
  // Victor le 01/09/2026) : le bouton « ↩ Annuler » n'existe qu'à partir de la deuxième prise de
  // parole, et son apparition décalait de 11 px le nom du joueur, les pastilles de fold rapide et
  // tout ce qui suit — pile au moment où le doigt vise. Le plus grand occupant est ce bouton :
  // 12 px de rembourrage haut + 26 px de bouton (6 + 6 de `paddingVertical` autour d'un texte de
  // 12). 40 les tient tous, avec de la marge. La rangée mesure donc la même
  // chose qu'elle soit vide, qu'elle porte un nom seul, ou les deux.
  rangeeFixe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginBottom: 6,
    minHeight: 40,
  },
  socle: {
    paddingTop: 12,
  },
  contentInner: {
    flexGrow: 1,
  },
  footerNote: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  nextButton: {
    backgroundColor: colors.action,
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  nextButtonDisabled: {
    opacity: 0.35,
  },
  nextText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  footerLink: {
    // Le filet sépare le lien du dernier élément du contenu qui défile — sur une street courte, la
    // rangée de boutons d'action finit juste au-dessus.
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borders.hairline,
    // 20 et non 12 : sur une street dont le contenu remplit l'écran, la rangée d'actions finit
    // juste au-dessus, et mesuré à 12 il ne restait que 12 px entre la pastille « Tapis » et le
    // filet. Deux cibles voisines dont l'une change d'écran, c'est trop peu.
    marginTop: 20,
    // 16 + 14 autour d'une ligne de 15 px : la cible fait un peu moins de 50 px de haut, et la
    // marge du dessus l'écarte encore des pastilles d'action.
    paddingTop: 16,
    paddingBottom: 14,
    alignItems: 'center',
  },
  footerLinkText: {
    // Même écriture que « ‹ Retour » en haut de l'écran : c'est le vocabulaire de l'app pour une
    // sortie qui n'est pas une action de poker.
    color: colors.action,
    fontSize: 15,
    fontWeight: '700',
  },
});
