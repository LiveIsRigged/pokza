import React, { createContext, useContext, useState } from 'react';

// Préférence d'affichage des montants (stacks, mises, pot) dans TOUT le feed : un seul état
// partagé au niveau de l'app plutôt qu'un état par replayer, pour que le choix de l'utilisateur
// soit mémorisé d'une main à l'autre sans avoir à le refaire à chaque post.
interface DisplayUnitContextValue {
  useBB: boolean;
  toggleUseBB: () => void;
}

const DisplayUnitContext = createContext<DisplayUnitContextValue | null>(null);

export function DisplayUnitProvider({ children }: { children: React.ReactNode }) {
  const [useBB, setUseBB] = useState(false);
  return (
    <DisplayUnitContext.Provider value={{ useBB, toggleUseBB: () => setUseBB((v) => !v) }}>
      {children}
    </DisplayUnitContext.Provider>
  );
}

export function useDisplayUnit(): DisplayUnitContextValue {
  const ctx = useContext(DisplayUnitContext);
  if (!ctx) throw new Error('useDisplayUnit must be used within a DisplayUnitProvider');
  return ctx;
}
