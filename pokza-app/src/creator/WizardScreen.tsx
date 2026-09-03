import React, { useLayoutEffect, useRef, useState } from 'react';
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Pressable } from '../components/ui/Pressable';
import { borders, colors, typography } from '../theme/theme';
import { useLeftEdgeSwipe } from '../navigation/edgeSwipe';
import { MESURE_VIERGE, debordeSousLePli, fusionner, type MesureDefilement } from './debordement';

/**
 * LE FONDU DU BAS — « ça continue en dessous ».
 * ────────────────────────────────────────────
 * Posé ici, dans l'écran d'assistant lui-même, et JAMAIS conditionné à une étape : un signe qu'on
 * ne dessinerait qu'à l'étape 1 ne dirait rien de général, exactement le reproche qui a fait
 * retirer le filet sous la table le 02/09/2026. Il apparaît là où il y a vraiment une suite et
 * nulle part ailleurs, parce qu'il est calculé depuis le débordement mesuré (cf. `debordement.ts`).
 *
 * 52 px : la hauteur validée par Victor sur les maquettes du 03/09/2026. Assez pour qu'on voie une
 * rangée s'estomper — donc qu'on comprenne qu'elle est coupée — sans effacer la ligne du dessus.
 */
const HAUTEUR_FONDU = 52;
/** Un seul assistant est monté à la fois : un identifiant fixe suffit. Il ne télescope pas ceux de
 *  `MultiCardPicker` (`fade-<couleur>`), qui vit à l'intérieur de cet écran à l'étape 2. */
const ID_FONDU = 'fonduWizard';

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
   * LA MESURE DU DÉBORDEMENT — trois sources, aucune de confiance à elle seule.
   *
   * ⚠️ LA MESURE NE VIT PAS DANS L'ÉTAT, LE BOOLÉEN SEUL Y VIT. `onScroll` tire soixante fois par
   * seconde et la position change à chaque image : mise dans l'état, elle relancerait le rendu de
   * tout l'écran — table comprise, alors qu'elle est de loin ce qu'on redessine le plus cher. Ici
   * `setDeborde` reçoit le même booléen soixante fois et React n'en retient qu'un : deux rendus
   * par course de défilement au lieu de soixante.
   *
   * Les trois sources, dans l'ordre où elles arrivent :
   *   • le FILET DOM ci-dessous, qui donne la première mesure AVANT toute interaction — et c'est
   *     tout l'enjeu, puisque celui qu'on veut prévenir est précisément celui qui ne défile pas ;
   *   • `onLayout` / `onContentSizeChange`, le chemin normal en natif comme sur le web (cf. la
   *     mesure du 30/08/2026 dans `TableVue`, qui les a établis fiables en production) ;
   *   • `onScroll`, qui porte les trois nombres d'un coup et reste la seule source de la position.
   */
  const mesure = useRef<MesureDefilement>(MESURE_VIERGE);
  const [deborde, setDeborde] = useState(false);
  // La LARGEUR du fondu se mesure aussi. Un `Svg` en « 100 % » qui rendrait zéro donnerait un fondu
  // invisible sans une ligne d'erreur — la panne silencieuse qu'on a déjà payée deux fois le
  // 03/09/2026. `MultiCardPicker` avait pris une largeur numérique pour son fondu horizontal ; on
  // fait pareil. Elle ne bouge qu'à la rotation, donc l'état lui va.
  const [largeur, setLargeur] = useState(0);
  const noter = (part: Partial<MesureDefilement>) => {
    const suite = fusionner(mesure.current, part);
    if (suite === mesure.current) return;
    mesure.current = suite;
    setDeborde(debordeSousLePli(suite));
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
   * Sans lui, le fondu ne servirait à rien. Il ne s'agit pas de doubler `onLayout` par prudence :
   * `onScroll` ne se déclenche que si l'on défile, et le fondu doit être là AVANT — pour celui qui
   * s'apprête à ne pas défiler. Un seul assistant est monté à la fois, donc un seul observateur :
   * le calcul de coût qui l'avait écarté dans `TableVue` (autant de tables que de posts dans le
   * feed) ne s'applique pas ici.
   *
   * On observe le conteneur de contenu ET la lucarne : un `ResizeObserver` regarde la boîte, pas
   * `scrollHeight` — sans le premier, une section qui se déplie n'allumerait pas le fondu.
   */
  useLayoutEffect(() => {
    const vue = zone.current as unknown as
      | (HTMLElement & { getScrollableNode?: () => HTMLElement | null })
      | null;
    const el = typeof vue?.getScrollableNode === 'function' ? vue.getScrollableNode() : vue;
    if (!el || typeof el.scrollHeight !== 'number') return;
    const mesurer = () => {
      noter({ contenu: el.scrollHeight, lucarne: el.clientHeight, position: el.scrollTop });
      if (el.clientWidth > 0) setLargeur(el.clientWidth);
    };
    mesurer();
    if (typeof ResizeObserver === 'undefined') return;
    const observateur = new ResizeObserver(mesurer);
    observateur.observe(el);
    const contenu = el.firstElementChild;
    if (contenu) observateur.observe(contenu);
    return () => observateur.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          onLayout={(e: LayoutChangeEvent) => {
            const { width, height } = e.nativeEvent.layout;
            noter({ lucarne: height });
            if (width > 0) setLargeur(width);
          }}
          onContentSizeChange={(_largeur: number, hauteur: number) => noter({ contenu: hauteur })}
          onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
            const n = e.nativeEvent;
            noter({
              contenu: n.contentSize.height,
              lucarne: n.layoutMeasurement.height,
              position: n.contentOffset.y,
            });
          }}
          // Sans ça, le premier appui clavier ouvert ne fait QUE refermer le clavier : il n'atteint
          // jamais l'élément visé. Une suggestion de lieu demanderait donc deux touchers, le premier
          // sans effet visible — et le même défaut frappe déjà toutes les pastilles de ces écrans.
          // « handled » ne garde le clavier que si un enfant a effectivement traité l'appui ; toucher
          // le vide le referme comme avant.
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {deborde && largeur > 0 && (
          <View style={styles.fondu} pointerEvents="none">
            <Svg width={largeur} height={HAUTEUR_FONDU}>
              <Defs>
                <LinearGradient id={ID_FONDU} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.feedBackground} stopOpacity="0" />
                  <Stop offset="1" stopColor={colors.feedBackground} stopOpacity="1" />
                </LinearGradient>
              </Defs>
              <Rect width={largeur} height={HAUTEUR_FONDU} fill={`url(#${ID_FONDU})`} />
            </Svg>
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
  // La lucarne : le conteneur qui porte le fondu par-dessus la zone défilante. Elle prend la place
  // que prenait le `ScrollView`, pour que rien d'autre ne bouge dans la colonne.
  lucarne: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  fondu: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: HAUTEUR_FONDU,
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
