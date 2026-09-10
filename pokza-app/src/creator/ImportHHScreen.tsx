import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Pressable } from '../components/ui/Pressable';
import { importerMain, compterLesMains } from '../import';
import { ErreurDeLecture } from '../import/formeNeutre';
import { texteDuFichier } from '../import/fichier';
import { messageDAvertissement, messageDeRefus, type Provenance } from '../import/messages';
import type { SourceDeSeed } from './rehydrate';
import { borders, colors, radius, spacing, typography } from '../theme/theme';
import { LARGEUR_MAX_IMPORT } from '../components/ui/Colonne';
import { useT } from '../i18n';

interface ImportHHScreenProps {
  onFermer: () => void;
  /** La main lue, prête pour `postToSeed` — c'est le CRÉATEUR qui l'applique, pas cet écran (cf.
   *  `appliquerImport`) : poser un seed remplace l'état entier et la pile d'historique, ce que
   *  seul lui peut faire. Cet écran demande, il n'applique pas. */
  onImportee: (source: SourceDeSeed) => void;
}

/**
 * IMPORTER UNE HAND HISTORY.
 * ═════════════════════════
 * Un texte collé, et la main est remplie. Tout le travail est dans `src/import` — cet écran ne
 * fait que recueillir le texte, montrer ce qui cloche, et rendre la main lue au créateur.
 *
 * En `Modal` et non en calque absolu : il s'ouvre depuis l'étape 1, donc depuis l'INTÉRIEUR du
 * défilement de `WizardScreen`, où un calque absolu se ferait rogner (même piège que
 * `MainEnTexteScreen` et `EditPostScreen.tsx:310`).
 *
 * ⚠️ LE CHAMP EST LA SURFACE PRINCIPALE, PAS LE BOUTON. Le presse-papier peut REFUSER — navigateur
 * qui l'interdit, permission coupée, page hors contexte sécurisé — et la leçon est déjà payée dans
 * `MainEnTexteScreen` : sans filet, le bouton ne faisait alors absolument rien, pas un mot pour le
 * dire. Ici le champ existe toujours, et le collage manuel (Cmd-V, appui long) marche partout.
 * C'est d'ailleurs le geste du BUREAU, là où vivent vraiment les hand histories.
 *
 * UN SEUL BOUTON, DEUX ÉTATS. Champ vide → « Coller la main » : il lit le presse-papier, remplit
 * le champ et lit la main d'un coup — c'est la promesse « créer une main rapidement », en un
 * geste. Champ rempli → « Lire la main ». Deux boutons côte à côte auraient fait choisir avant
 * d'avoir compris.
 *
 * ⚠️ RIEN NE QUITTE L'APPAREIL. Une hand history porte les pseudos et les tapis de gens qui n'ont
 * rien demandé : la lecture est locale, et un refus explique puis s'arrête là (pas de « envoyer
 * cet exemple » — tranché par Victor le 04/09/2026).
 */
export function ImportHHScreen({ onFermer, onImportee }: ImportHHScreenProps) {
  const t = useT();
  const [texte, setTexte] = useState('');
  /** Ce que l'auteur doit lire, et le détail technique en dessous. `null` = rien n'a encore été
   *  tenté — on ne montre pas un reproche avant le premier essai. */
  const [refus, setRefus] = useState<{ message: string; detail: string } | null>(null);
  /** Un fichier est en train d'être glissé au-dessus de la fenêtre. */
  const [survol, setSurvol] = useState(false);
  /**
   * LA MAIN EST LUE, MAIS QUELQUE CHOSE N'A PAS SUIVI — et il faut le dire AVANT de la rendre.
   *
   * Le montage produit des avertissements (un nom d'épreuve plus long que son champ, un buy-in
   * trop long pour le sien) en les décrivant comme « jamais bloquants, mais à dire à l'auteur ».
   * Personne ne les lisait : `onImportee` partait directement et cet écran disparaissait, donc la
   * perte était SILENCIEUSE. On retient donc la main un instant, le temps de la phrase.
   *
   * ⚠️ CE N'EST PAS UN REFUS. La main est bonne et part au tap suivant ; ce qui manque, ce sont des
   * champs du FORMULAIRE, que l'auteur retape en remontant à l'étape 1.
   */
  const [retenue, setRetenue] = useState<{ source: SourceDeSeed; avertissements: string[] } | null>(null);

  const lire = (contenu: string, provenance: Provenance = 'collage') => {
    const resultat = importerMain(contenu);
    if (resultat.ok) {
      if (resultat.avertissements.length > 0) {
        setRetenue({ source: resultat.source, avertissements: resultat.avertissements });
        return;
      }
      onImportee(resultat.source);
      return;
    }
    setRefus({
      message: messageDeRefus(resultat.code, compterLesMains(contenu), provenance),
      detail: resultat.message,
    });
  };

  /**
   * Un fichier déposé ou choisi. Son texte atterrit DANS LE CHAMP, comme celui du presse-papier :
   * l'auteur voit ce qui a été lu, peut le corriger, et n'a pas à recommencer sur un refus. Il n'y
   * a donc aucun chemin de lecture propre au fichier — un fichier et un collage donnent la même
   * main, et se refusent pour les mêmes raisons.
   */
  const depuisFichier = async (fichier: File) => {
    try {
      const contenu = await texteDuFichier(fichier);
      setTexte(contenu);
      lire(contenu, 'fichier');
    } catch (e) {
      if (e instanceof ErreurDeLecture) {
        setRefus({ message: messageDeRefus(e.code, undefined, 'fichier'), detail: e.message });
        return;
      }
      setRefus({ message: t('import.fichier_illisible'), detail: String(e) });
    }
  };

  // Le gestionnaire le plus RÉCENT, pour que les écouteurs posés une seule fois ne travaillent
  // jamais sur un état périmé.
  const dernier = useRef(depuisFichier);
  dernier.current = depuisFichier;

  /**
   * LE GLISSER-DÉPOSER — le geste du bureau, et c'est là que vivent vraiment les hand histories.
   *
   * ⚠️⚠️ LE `preventDefault` SUR TOUTE LA FENÊTRE N'EST PAS UN DÉTAIL : sans lui, un fichier lâché
   * À CÔTÉ de la zone fait NAVIGUER le navigateur vers ce fichier — l'app disparaît, et la main en
   * cours de saisie est perdue sans un mot. C'est le comportement par défaut du navigateur, et il
   * faut le désarmer tant que cet écran est ouvert. Toute la fenêtre est donc la zone : plus
   * pardonnant, et plus sûr.
   *
   * Web seulement, comme `useClavierOuvert` : il n'existe pas de glisser-déposer en natif, et
   * choisir un fichier y demanderait une dépendance de plus pour un usage qui n'existe pas encore.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const survole = (e: DragEvent) => {
      e.preventDefault();
      setSurvol(true);
    };
    // `relatedTarget` nul = le curseur a quitté la FENÊTRE, pas seulement un élément interne.
    // Sans ce test, le survol clignotait à chaque frontière d'élément traversée.
    const quitte = (e: DragEvent) => {
      if (!e.relatedTarget) setSurvol(false);
    };
    const lache = (e: DragEvent) => {
      e.preventDefault();
      setSurvol(false);
      const fichier = e.dataTransfer?.files?.[0];
      if (fichier) void dernier.current(fichier);
    };
    document.addEventListener('dragover', survole);
    document.addEventListener('dragleave', quitte);
    document.addEventListener('drop', lache);
    return () => {
      document.removeEventListener('dragover', survole);
      document.removeEventListener('dragleave', quitte);
      document.removeEventListener('drop', lache);
    };
  }, []);

  /**
   * Choisir un fichier à la main. Un `<input type="file">` fabriqué à la demande plutôt qu'une
   * dépendance : c'est trois lignes et ça n'embarque rien.
   *
   * ⚠️ AUCUN `accept`. Filtrer sur `.txt` grise les autres fichiers sans recours dans certains
   * sélecteurs — or les clients n'écrivent pas tous la même extension. On accepte donc n'importe
   * quel fichier et on juge sur son CONTENU : de toute façon, ce qui n'est pas une hand history
   * sera refusé avec sa raison.
   */
  const choisirFichier = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = () => {
      const fichier = input.files?.[0];
      if (fichier) void dernier.current(fichier);
    };
    input.click();
  };

  const action = async () => {
    if (texte.trim()) {
      lire(texte);
      return;
    }
    try {
      const colle = await Clipboard.getStringAsync();
      if (!colle.trim()) {
        setRefus({ message: messageDeRefus('texte-vide'), detail: 'presse-papier vide' });
        return;
      }
      // Le champ est rempli MÊME en cas de refus : l'auteur voit ce qui a été lu, peut le corriger
      // ou le remplacer, et n'a pas à recoller pour réessayer.
      setTexte(colle);
      lire(colle);
    } catch {
      // Le presse-papier a fermé la porte. Le champ reste la sortie, et c'est celle qu'on indique.
      setRefus({
        message: 'Ton navigateur ne laisse pas Pokza lire le presse-papier. Colle le texte dans le champ.',
        detail: 'presse-papier refusé',
      });
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onFermer}>
      <View style={styles.page}>
        <View style={styles.colonne}>
          <View style={styles.topRow}>
            <Pressable onPress={onFermer} hitSlop={8}>
              <Text style={styles.fermer}>←</Text>
            </Pressable>
            <Text style={styles.titre}>{t('import.titre')}</Text>
          </View>

          {/* Un `View` et non un `ScrollView` : c'est le CHAMP qui doit défiler, pas la page. Dans un
              défilement, un champ ne peut pas recevoir de hauteur — il gardait donc son minimum et
              laissait 450 px de vide au-dessus du pied (mesuré à l'écran). Ici il prend tout, ce qui
              règle le vide ET montre la main entière : de quoi vérifier qu'on a collé la bonne. */}
          <View style={styles.corps}>
            <TextInput
              /**
               * ⚠️ SANS CETTE PROP, SAFARI PROPOSE UNE CARTE BANCAIRE — signalé par Victor le
               * 06/09/2026, et c'est la seconde fois que la règle tombe.
               *
               * `react-native-web` pose `autocomplete="on"` D'OFFICE quand la prop manque
               * (`TextInput/index.js:347` : `autoComplete || autoCompleteType || 'on'`). Un champ
               * sans prop n'est donc pas neutre : il INVITE Safari à deviner, et Safari devine
               * d'après le contexte — une carte près d'un bouton d'envoi, un contact devant un pavé
               * numérique. Le correctif du 03/09 avait déclaré 34 champs ; celui-ci est né après.
               */
              autoComplete="off"
              style={[styles.champ, survol && styles.champSurvole]}
              value={texte}
              onChangeText={(t) => {
                setTexte(t);
                // Le refus comme la retenue s'effacent dès qu'on touche au texte : ils portaient
                // sur l'ancien.
                if (refus) setRefus(null);
                if (retenue) setRetenue(null);
              }}
              placeholder={
                Platform.OS === 'web'
                  ? t('import.placeholder_avec_fichier')
                  : t('import.placeholder_sans_fichier')
              }
              placeholderTextColor={colors.textSecondary}
              multiline
              autoCorrect={false}
              autoCapitalize="none"
              spellCheck={false}
            />

            {/*
              ⚠️ RIEN NE S'AFFICHE ICI TANT QUE RIEN N'A ÉTÉ REFUSÉ, ET C'EST VOULU.
              Une première version annonçait « Winamax et Betclic, une seule main à la fois. Les
              pseudos ne sont pas importés » — retirée par Victor le 04/09/2026, avec raison :
                • poser la liste des salles reconnues DESSINE UNE FRONTIÈRE avant que quiconque l'ait
                  touchée, alors que tout l'intérêt du pipeline est qu'une lecture douteuse soit
                  détectée et EXPLIQUÉE (cf. `verification.ts`). La liste appartient donc au message
                  d'échec, où elle arrive au moment où elle sert — et elle ne périme pas l'accueil
                  quand un dialecte s'ajoute ;
                • « une seule main à la fois » est déjà couvert par le refus `plusieurs-mains` ;
                • « les pseudos ne sont pas importés » parle du RÉSULTAT, pas de ce qu'on colle : ça
                  n'a rien à faire sur cet écran.
              Le champ dit à lui seul ce qu'il attend. Ne pas remettre de phrase d'accueil ici.
            */}
            {/* Le seul repère visible du chemin « fichier ». Le dépôt, lui, marche sur toute la
                fenêtre sans rien annoncer — le placeholder le mentionne, et le champ s'allume au
                survol. Web seulement : il n'y a ni glisser-déposer ni sélecteur de fichier en natif. */}
            {Platform.OS === 'web' && (
              <Pressable style={styles.fichier} onPress={choisirFichier} hitSlop={6}>
                <Text style={styles.fichierTexte}>{t('import.choisir_un_fichier')}</Text>
              </Pressable>
            )}

            {retenue && (
              <View style={styles.refus}>
                <Text style={styles.refusMessage}>
                  {messageDAvertissement(retenue.avertissements.length)}
                </Text>
                {retenue.avertissements.map((ligne) => (
                  <Text key={ligne} style={styles.refusDetail}>
                    {ligne}
                  </Text>
                ))}
              </View>
            )}

            {refus && (
              <View style={styles.refus}>
                <Text style={styles.refusMessage}>{refus.message}</Text>
                {/* Le détail, en gris : il nomme la ligne ou le contrôle qui a bloqué. Utile
                    pendant la bêta — c'est ce qui évite une capture d'écran et un aller-retour quand
                    une vraie main est refusée. UNE LIGNE PAR CAUSE : un seul montant faux fait
                    souvent tomber trois contrôles, et les coller bout à bout donnait un paragraphe
                    illisible (vu à l'écran). Les sièges y sont nommés par leur POSITION, pas par
                    leur identifiant interne (cf. `etiquettes` dans `verification.ts`). */}
                {refus.detail.split(' | ').map((ligne) => (
                  <Text key={ligne} style={styles.refusDetail}>
                    {ligne}
                  </Text>
                ))}
              </View>
            )}
          </View>

          <View style={styles.pied}>
            <Pressable
              style={styles.bouton}
              onPress={() => (retenue ? onImportee(retenue.source) : void action())}
            >
              <Text style={styles.boutonTexte}>
                {retenue ? t('commun.continuer') : texte.trim() ? t('import.lire_la_main') : t('import.coller_la_main')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    // LE FOND garde toute la fenêtre : plafonné, on verrait l'app par-dessous sur les côtés, et la
    // page aurait l'air d'une fenêtre posée sur du vide. C'est le CONTENU qui se met en colonne
    // (`colonne` ci-dessous).
    alignItems: 'center',
    backgroundColor: colors.feedBackground,
    paddingTop: 50,
  },
  colonne: {
    flex: 1,
    width: '100%',
    maxWidth: LARGEUR_MAX_IMPORT,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: 14,
    marginBottom: spacing.md,
  },
  fermer: {
    fontSize: 22,
    color: colors.textPrimary,
  },
  titre: {
    ...typography.postTitle,
    color: colors.textPrimary,
  },
  corps: {
    flex: 1,
    paddingHorizontal: 14,
    paddingBottom: spacing.md,
  },
  champ: {
    flex: 1,
    borderWidth: 1,
    borderColor: borders.default,
    borderRadius: radius.md,
    padding: spacing.sm,
    // Monospace : une hand history est alignée en colonnes, et c'est ce qui la rend reconnaissable
    // d'un coup d'œil quand on vérifie ce qu'on a collé.
    fontFamily: 'monospace',
    /**
     * ⚠️⚠️ 16px, ET ON N'Y TOUCHE PLUS — voir la note en tête de `typography` dans le thème.
     *
     * Ce champ était à 12px, pour montrer plus de lignes d'un coup. Signalé par Victor le
     * 06/09/2026, sur iPhone : **Safari zoome sur tout champ sous 16px et ne dézoome JAMAIS** — il
     * a fallu pincer pour revenir après avoir collé. C'est le bug le plus visible qu'ait connu la
     * bêta, et `scripts/zoom-scan.py` existe précisément pour le relever : il a désigné ce champ
     * comme le SEUL des 58 de l'app à repasser sous la barre.
     *
     * Ce qu'on perd est modeste et déjà perdu : sur un téléphone, 331px de champ donnent ~34
     * caractères par ligne à 16px contre ~46 à 12 — or la seule ligne d'en-tête d'une main Winamax
     * en fait 110. Elle passe à la ligne dans les deux cas, l'alignement en colonnes est de toute
     * façon rompu, et le champ garde son unique rôle : voir qu'on a collé la BONNE main.
     *
     * Le viewport n'est pas un recours (iOS ignore `maximum-scale` depuis iOS 10). La taille de
     * police est le seul levier réel.
     */
    fontSize: 16,
    // Reconduit du rapport d'avant (12 → 17), pour que l'interligne suive la police.
    lineHeight: 22,
    color: colors.textPrimary,
    textAlignVertical: 'top',
  },
  // Le champ prend la couleur d'action pendant qu'un fichier le survole : c'est le seul retour
  // qui dise « lâche, ça va marcher ». Sans lui, le glisser-déposer est un pari.
  champSurvole: {
    borderColor: colors.action,
  },
  fichier: {
    alignSelf: 'flex-start',
    paddingTop: spacing.sm,
  },
  fichierTexte: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.action,
  },
  refus: {
    marginTop: spacing.sm,
  },
  refusMessage: {
    ...typography.description,
    color: colors.textPrimary,
  },
  refusDetail: {
    ...typography.dateLocation,
    color: colors.textSecondary,
    marginTop: 4,
  },
  pied: {
    paddingHorizontal: 14,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: borders.default,
  },
  bouton: {
    backgroundColor: colors.action,
    borderRadius: radius.full,
    paddingVertical: 14,
    alignItems: 'center',
  },
  boutonTexte: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
