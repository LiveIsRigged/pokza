import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useClavierOuvert } from '../creator/clavier';
import { hauteurAAppliquer } from './hauteurVisible';

/**
 * Pose `--hauteur-app` sur `<html>` pendant qu'un clavier virtuel est là, pour que l'app tienne
 * dans la bande visible et que Safari cesse de faire glisser la page. Le pourquoi, les mesures et
 * les garde-fous sont dans `hauteurVisible.ts` ; ici, seulement le branchement au DOM.
 *
 * Ne rend rien. Monté une fois, à la racine — le défaut n'est pas propre à un écran, il vient de
 * la feuille de style de `index.html`, donc le correctif se pose au même endroit.
 */

const VARIABLE = '--hauteur-app';

/**
 * Filet de sécurité. Si le dernier `resize` du clavier qui se referme n'arrivait jamais (Safari en
 * saute parfois un quand on quitte l'écran d'un coup), l'app resterait haute de 569 px pour de bon.
 * Une seconde après la perte du focus, on rend la main quoi qu'il arrive : à cet instant aucun
 * champ n'est focalisé, donc aucun clavier n'est légitimement encore à l'écran.
 */
const DELAI_SECOURS_MS = 1000;

export function AjusteurHauteur() {
  const clavierOuvert = useClavierOuvert();
  // Le gestionnaire d'évènements vit hors du rendu ; il lit le focus par cette référence plutôt que
  // par une capture, ce qui évite de réinstaller les écouteurs à chaque bascule.
  const focalise = useRef(clavierOuvert);
  focalise.current = clavierOuvert;
  const ajuster = useRef<() => void>(() => {});

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const vue = window.visualViewport;
    // Navigateur sans `visualViewport` (Safari < 13) : on ne fait rien, et `100%` reprend la main.
    if (!vue) return;

    const racine = document.documentElement;
    let engage = false;
    let secours: ReturnType<typeof setTimeout> | null = null;

    const rendre = () => {
      racine.style.removeProperty(VARIABLE);
      engage = false;
    };

    const appliquer = () => {
      const px = hauteurAAppliquer(
        {
          hauteurVisible: vue.height,
          hauteurMiseEnPage: window.innerHeight,
          echelle: vue.scale,
          champFocalise: focalise.current,
        },
        engage,
      );
      if (px === null) {
        if (engage) rendre();
        return;
      }
      racine.style.setProperty(VARIABLE, `${px}px`);
      engage = true;
      // Safari a pu commencer à glisser avant que la racine ne rétrécisse. Une fois le document
      // aussi court que la bande visible il n'y a plus rien à faire défiler, mais le décalage déjà
      // pris ne se défait pas toujours seul.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    ajuster.current = () => {
      if (secours) {
        clearTimeout(secours);
        secours = null;
      }
      appliquer();
      if (!focalise.current && engage) {
        secours = setTimeout(() => {
          secours = null;
          if (!focalise.current) rendre();
        }, DELAI_SECOURS_MS);
      }
    };

    appliquer();
    vue.addEventListener('resize', appliquer);
    vue.addEventListener('scroll', appliquer);
    return () => {
      vue.removeEventListener('resize', appliquer);
      vue.removeEventListener('scroll', appliquer);
      if (secours) clearTimeout(secours);
      ajuster.current = () => {};
      rendre();
    };
  }, []);

  // Déclaré APRÈS l'effet d'installation, donc exécuté après lui au montage : `ajuster.current` est
  // déjà branché. Aux rendus suivants, seul celui-ci tourne — une bascule du focus relit la mesure
  // sans toucher aux écouteurs.
  useEffect(() => {
    ajuster.current();
  }, [clavierOuvert]);

  return null;
}
