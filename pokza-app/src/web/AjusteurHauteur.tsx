import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useClavierOuvert } from '../creator/clavier';
import { hauteurAAppliquer, hauteurAnticipee, ECHELLE_MAX, RETRAIT_MINIMUM } from './hauteurVisible';

/**
 * Pose `--hauteur-app` sur `<html>` pendant qu'un clavier virtuel est là, pour que l'app tienne
 * dans la bande visible et que Safari cesse de faire glisser la page. Le pourquoi, les mesures et
 * les deux erreurs de la première version sont dans `hauteurVisible.ts` ; ici, le branchement.
 *
 * Ne rend rien. Monté une fois, à la racine — le défaut vient de la feuille de style d'`index.html`,
 * il ne concerne pas un écran en particulier.
 */

const VARIABLE = '--hauteur-app';

/**
 * Filet de sécurité. Si le dernier `resize` du clavier qui se referme n'arrivait jamais, l'app
 * resterait courte pour de bon. Une seconde après la perte du focus, on rend la main quoi qu'il
 * arrive : à cet instant aucun champ n'est focalisé, donc aucun clavier ne peut légitimement être
 * encore à l'écran.
 */
const DELAI_SECOURS_MS = 1000;

/** Dernière hauteur de clavier réellement mesurée sur CET appareil. */
const CLE_CLAVIER = 'pokza-hauteur-clavier';

function clavierRetenu(): number {
  try {
    return parseInt(window.localStorage.getItem(CLE_CLAVIER) ?? '', 10) || 0;
  } catch {
    return 0; // navigation privée, stockage refusé : on retombera sur la part par défaut
  }
}

function retenirClavier(px: number) {
  try {
    window.localStorage.setItem(CLE_CLAVIER, String(Math.round(px)));
  } catch {
    /* sans mémoire, on devine à chaque fois — dégradé, pas cassé */
  }
}

export function AjusteurHauteur() {
  const clavierOuvert = useClavierOuvert();
  // Le gestionnaire d'évènements vit hors du rendu ; il lit le focus par cette référence plutôt que
  // par une capture, ce qui évite de réinstaller les écouteurs à chaque bascule.
  const focalise = useRef(clavierOuvert);
  focalise.current = clavierOuvert;
  const auToucher = useRef<() => void>(() => {});
  const auRelachement = useRef<() => void>(() => {});

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const vue = window.visualViewport;
    // Navigateur sans `visualViewport` (Safari < 13) : on ne fait rien, `100%` reprend la main.
    if (!vue) return;

    const racine = document.documentElement;
    let engage = false;
    let secours: ReturnType<typeof setTimeout> | null = null;
    // La bande visible hors clavier. SEULE référence fiable : `window.innerHeight` suit la bande
    // visible sur iOS et vaut donc la même chose qu'elle, clavier ouvert comme fermé.
    let hauteurAuRepos = vue.height;

    const poser = (px: number) => {
      racine.style.setProperty(VARIABLE, `${px}px`);
      engage = true;
      // Safari a pu commencer à glisser. Une fois le document aussi court que la bande visible il
      // n'y a plus rien à faire défiler, mais le décalage déjà pris ne se défait pas toujours seul.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    const rendre = () => {
      racine.style.removeProperty(VARIABLE);
      engage = false;
    };

    // Sur mesure : le clavier est là, on connaît sa hauteur exacte.
    const surMesure = () => {
      // Hors engagement et hors focus, la mesure du moment EST la hauteur au repos. C'est aussi
      // ainsi qu'on suit une rotation ou un changement de taille de fenêtre.
      if (!engage && !focalise.current) hauteurAuRepos = vue.height;

      const retrait = hauteurAuRepos - vue.height;
      if (retrait >= RETRAIT_MINIMUM && focalise.current) retenirClavier(retrait);

      const px = hauteurAAppliquer(
        {
          hauteurAuRepos,
          hauteurVisible: vue.height,
          echelle: vue.scale,
          champFocalise: focalise.current,
        },
        engage,
      );
      if (px === null) {
        if (engage) rendre();
        return;
      }
      poser(px);
    };

    // Au toucher : le clavier n'existe pas encore, et c'est justement le moment. Attendre le
    // premier `resize` (89 ms) laisse Safari décider de faire glisser la page — mesuré.
    auToucher.current = () => {
      if (secours) {
        clearTimeout(secours);
        secours = null;
      }
      if (vue.scale > ECHELLE_MAX) return;
      const px = hauteurAnticipee(hauteurAuRepos, clavierRetenu());
      if (px !== null) poser(px);
    };

    auRelachement.current = () => {
      surMesure();
      if (engage) {
        secours = setTimeout(() => {
          secours = null;
          if (!focalise.current) rendre();
        }, DELAI_SECOURS_MS);
      }
    };

    vue.addEventListener('resize', surMesure);
    vue.addEventListener('scroll', surMesure);
    return () => {
      vue.removeEventListener('resize', surMesure);
      vue.removeEventListener('scroll', surMesure);
      if (secours) clearTimeout(secours);
      auToucher.current = () => {};
      auRelachement.current = () => {};
      rendre();
    };
  }, []);

  // Déclaré APRÈS l'effet d'installation, donc exécuté après lui au montage. Aux rendus suivants,
  // seul celui-ci tourne : une bascule du focus agit sans toucher aux écouteurs.
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) {
      premier.current = false;
      return; // au montage, aucun champ n'a le focus : rien à faire
    }
    if (clavierOuvert) auToucher.current();
    else auRelachement.current();
  }, [clavierOuvert]);

  return null;
}
