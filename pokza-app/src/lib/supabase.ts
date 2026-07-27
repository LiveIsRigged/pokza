import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Expo n'inline QUE les variables préfixées EXPO_PUBLIC_ (et seulement via `process.env.NOM_STATIQUE`,
// pas d'accès dynamique) — cf. https://docs.expo.dev/guides/environment-variables/. C'est voulu ici :
// l'URL Supabase et la clé anon sont conçues pour être publiques côté client (sécurité assurée par
// le Row Level Security côté base, pas par le secret de la clé).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Variables d'environnement Supabase manquantes : renseigne EXPO_PUBLIC_SUPABASE_URL et " +
      'EXPO_PUBLIC_SUPABASE_ANON_KEY dans un fichier .env à la racine (voir .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Pas de redirection OAuth via URL de navigateur sur mobile natif.
    detectSessionInUrl: false,
  },
});
