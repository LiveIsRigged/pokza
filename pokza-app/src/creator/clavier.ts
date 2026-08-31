import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * LE CLAVIER EST-IL OUVERT ?
 * ──────────────────────────
 * Sert à une seule chose, et elle est mesurée : à l'étape 1 du créateur, le formulaire fait
 * 1 132 px. Avec la table posée au-dessus, il reste 421 px pour le parcourir sur un iPhone 14 —
 * tenable. Clavier ouvert (≈ 300 px), il n'en reste plus que 121, et rien du tout sur un
 * iPhone SE. La table se replie donc pendant qu'on écrit, et revient quand on a fini : quand tu
 * écris, tu ne regardes pas la table.
 *
 * DEUX CHEMINS, PARCE QU'IL N'Y EN A PAS UN SEUL QUI MARCHE PARTOUT
 *   • Sur le web — c'est-à-dire dans la PWA, donc là où ça compte aujourd'hui — les événements
 *     `Keyboard` de React Native ne se déclenchent JAMAIS : il n'existe pas d'API de clavier
 *     virtuel côté navigateur. On écoute donc le `focus` et le `blur` des champs, ce qui est
 *     déterministe : un champ qui prend le focus sur mobile ouvre le clavier, sans exception.
 *   • En natif, `Keyboard` est la bonne source et la seule fiable (un champ peut avoir le focus
 *     avec un clavier matériel branché, et il ne faut alors rien replier).
 *
 * On ne tente PAS de mesurer la hauteur du clavier ni de deviner sa présence par la taille du
 * viewport : c'est notoirement instable sur Safari iOS, et on n'a pas besoin du chiffre — juste
 * de savoir s'il est là.
 */
export function useClavierOuvert(): boolean {
  const [ouvert, setOuvert] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      const montre = Keyboard.addListener('keyboardDidShow', () => setOuvert(true));
      const cache = Keyboard.addListener('keyboardDidHide', () => setOuvert(false));
      return () => {
        montre.remove();
        cache.remove();
      };
    }

    if (typeof document === 'undefined') return;
    // Tous les `<input>` n'ouvrent PAS un clavier : l'interrupteur `Switch` de React Native en est
    // un (`type="checkbox"`), et le « Bomb pot » de l'étape 1 escamoterait la table à chaque tap
    // sans qu'aucun clavier n'apparaisse. On ne retient donc que ce qui se saisit vraiment.
    const SANS_CLAVIER = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'];
    const saisissable = (cible: EventTarget | null) => {
      const el = cible as HTMLInputElement | null;
      if (!el || !el.tagName) return false;
      const balise = el.tagName.toLowerCase();
      if (balise === 'textarea') return true;
      if (balise === 'input') return !SANS_CLAVIER.includes((el.type || 'text').toLowerCase());
      return (el as HTMLElement).isContentEditable === true;
    };
    const entre = (e: FocusEvent) => {
      if (saisissable(e.target)) setOuvert(true);
    };
    // `focusout` se déclenche AVANT le `focusin` du champ suivant : sans ce report, passer d'un
    // champ à l'autre ferait réapparaître la table pendant une image, puis disparaître à nouveau.
    const sort = () => {
      setTimeout(() => {
        if (!saisissable(document.activeElement)) setOuvert(false);
      }, 0);
    };
    document.addEventListener('focusin', entre);
    document.addEventListener('focusout', sort);
    return () => {
      document.removeEventListener('focusin', entre);
      document.removeEventListener('focusout', sort);
    };
  }, []);

  return ouvert;
}
