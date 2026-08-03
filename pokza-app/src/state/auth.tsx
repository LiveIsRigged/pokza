import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  // Le temps de savoir si une session existait déjà (AsyncStorage) avant d'afficher login vs feed —
  // sans ça, l'écran de connexion clignoterait une frame avant que la session restaurée n'arrive.
  loading: boolean;
  // Passe à true quand la session vient d'un lien "mot de passe oublié" (événement Supabase
  // `PASSWORD_RECOVERY`, web uniquement — cf. detectSessionInUrl dans lib/supabase). Tant que ce
  // flag est actif, App.tsx affiche l'écran de nouveau mot de passe au lieu du feed : la session de
  // récupération est une session valide comme une autre, rien d'autre ne la distinguerait.
  passwordRecovery: boolean;
  clearPasswordRecovery: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const clearPasswordRecovery = () => setPasswordRecovery(false);

  return (
    <AuthContext.Provider value={{ session, loading, passwordRecovery, clearPasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
