import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { choisirLangue, poserLangue, t } from './traduire';
import { estLangueServie, type Langue } from './langues';

export { t } from './traduire';
export type { Cle } from './traduire';

/**
 * La couche React de la traduction : elle ne fait que tenir la langue choisie et la pousser dans
 * `traduire.ts`, qui contient toute la logique et n'a besoin ni de React ni du natif.
 */

const CLE_STOCKAGE = 'pokza.langue';

/** `'auto'` = suivre l'appareil (le défaut), sinon un choix explicite qui a le dernier mot. */
export type Preference = Langue | 'auto';

interface LangueContextValue {
  langue: Langue;
  preference: Preference;
  choisir: (preference: Preference) => void;
  /** `false` tant que le choix stocké n'est pas relu : App attend, sinon la langue clignote. */
  pret: boolean;
}

const LangueContext = createContext<LangueContextValue | null>(null);

export function LangueProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreference] = useState<Preference>('auto');
  const [pret, setPret] = useState(false);

  const langue =
    preference === 'auto' ? choisirLangue(getLocales().map((l) => l.languageCode)) : preference;
  // Posé pendant le rendu, avant celui des enfants : `t()` appelé hors React (moteur de main, dates
  // relatives, messages d'erreur) doit déjà être dans la bonne langue au premier affichage.
  poserLangue(langue);

  useEffect(() => {
    let vivant = true;
    AsyncStorage.getItem(CLE_STOCKAGE)
      .then((stocke) => {
        if (!vivant) return;
        if (stocke === 'auto' || estLangueServie(stocke)) setPreference(stocke);
      })
      .catch(() => {
        // Stockage indisponible (navigation privée) : on suit l'appareil, ce n'est pas une panne.
      })
      .finally(() => {
        if (vivant) setPret(true);
      });
    return () => {
      vivant = false;
    };
  }, []);

  const choisir = useCallback((suivante: Preference) => {
    setPreference(suivante);
    void AsyncStorage.setItem(CLE_STOCKAGE, suivante).catch(() => {});
  }, []);

  const valeur = useMemo<LangueContextValue>(
    () => ({ langue, preference, choisir, pret }),
    [langue, preference, choisir, pret]
  );

  return <LangueContext.Provider value={valeur}>{children}</LangueContext.Provider>;
}

export function useLangue(): LangueContextValue {
  const ctx = useContext(LangueContext);
  if (!ctx) throw new Error('useLangue doit être utilisé dans un LangueProvider');
  return ctx;
}

/**
 * `t` pour les composants — LA seule façon d'afficher du texte traduit dans un rendu.
 *
 * La fonction rendue est la même que `t` ; ce qui compte, c'est que l'appeler ABONNE le composant
 * au contexte, donc le redessine quand la langue change. Un composant qui importerait `t`
 * directement garderait l'ancienne langue à l'écran jusqu'à ce qu'autre chose le fasse redessiner —
 * c'est le seul piège de ce module, et `scripts/i18n-audit.js` le signale.
 *
 * `t` nu reste bon partout ailleurs : hors React (moteur de main, dates, messages d'erreur) et dans
 * un gestionnaire d'événement, où le texte est fabriqué au moment du clic et jamais « à l'écran ».
 */
export function useT(): typeof t {
  const { langue } = useLangue();
  return useMemo(() => {
    void langue;
    return t;
  }, [langue]);
}
