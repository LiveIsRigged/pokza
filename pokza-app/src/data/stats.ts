import { supabase } from '../lib/supabase';

/** Un point de série temporelle (une journée). */
export interface DayCount {
  jour: string;
  n: number;
}

/** Stats agrégées renvoyées par la fonction SQL `get_admin_stats` (SECURITY DEFINER, réservée aux
 * admins). "Actif" = connecté récemment (`last_sign_in_at`) — proxy correct pour un beta, il
 * surestime un peu (la valeur se rafraîchit aussi au renouvellement de session). */
export interface AdminStats {
  generatedAt: string;
  croissance: {
    inscrits: number;
    nouveaux24h: number;
    nouveaux7j: number;
    nouveaux30j: number;
    profilsCompletes: number;
    sansProfil: number;
    parJour: DayCount[];
  };
  activite: {
    actifs24h: number;
    actifs7j: number;
    actifs30j: number;
    jamaisRevenus: number;
  };
  contenu: {
    mains: number;
    mains24h: number;
    mains7j: number;
    posteursTotal: number;
    posteurs7j: number;
    bombPots: number;
    doubleBoards: number;
    avecSondage: number;
    publiques: number;
    privees: number;
    enGroupe: number;
    cash: number;
    tournoi: number;
    parVariante: Record<string, number>;
    parJour: DayCount[];
  };
  engagement: {
    likes: number;
    commentaires: number;
    reponses: number;
    votes: number;
    mainsAvecLike: number;
    mainsAvecCommentaire: number;
  };
  social: {
    amities: number;
    demandesEnAttente: number;
    groupes: number;
    membresGroupes: number;
  };
  profils: {
    formatFavori: Record<string, number>;
    varianteFavorite: Record<string, number>;
    frequence: Record<string, number>;
  };
  topPosteurs: { pseudo: string; n: number }[];
}

// Helpers de conversion — la fonction SQL renvoie du JSON en snake_case, on repasse en camelCase ici
// pour garder un écran propre. `num` tolère null/undefined (une section vide ne casse pas l'écran).
const num = (v: unknown): number => Number(v ?? 0);
const dict = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = num(val);
  }
  return out;
};
const days = (v: unknown): DayCount[] =>
  Array.isArray(v) ? v.map((d) => ({ jour: String(d.jour), n: num(d.n) })) : [];

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('get_admin_stats');
  if (error) throw error;
  const r = data as any;
  return {
    generatedAt: String(r.generated_at),
    croissance: {
      inscrits: num(r.croissance?.inscrits),
      nouveaux24h: num(r.croissance?.nouveaux_24h),
      nouveaux7j: num(r.croissance?.nouveaux_7j),
      nouveaux30j: num(r.croissance?.nouveaux_30j),
      profilsCompletes: num(r.croissance?.profils_completes),
      sansProfil: num(r.croissance?.sans_profil),
      parJour: days(r.croissance?.par_jour),
    },
    activite: {
      actifs24h: num(r.activite?.actifs_24h),
      actifs7j: num(r.activite?.actifs_7j),
      actifs30j: num(r.activite?.actifs_30j),
      jamaisRevenus: num(r.activite?.jamais_revenus),
    },
    contenu: {
      mains: num(r.contenu?.mains),
      mains24h: num(r.contenu?.mains_24h),
      mains7j: num(r.contenu?.mains_7j),
      posteursTotal: num(r.contenu?.posteurs_total),
      posteurs7j: num(r.contenu?.posteurs_7j),
      bombPots: num(r.contenu?.bomb_pots),
      doubleBoards: num(r.contenu?.double_boards),
      avecSondage: num(r.contenu?.avec_sondage),
      publiques: num(r.contenu?.publiques),
      privees: num(r.contenu?.privees),
      enGroupe: num(r.contenu?.en_groupe),
      cash: num(r.contenu?.cash),
      tournoi: num(r.contenu?.tournoi),
      parVariante: dict(r.contenu?.par_variante),
      parJour: days(r.contenu?.par_jour),
    },
    engagement: {
      likes: num(r.engagement?.likes),
      commentaires: num(r.engagement?.commentaires),
      reponses: num(r.engagement?.reponses),
      votes: num(r.engagement?.votes),
      mainsAvecLike: num(r.engagement?.mains_avec_like),
      mainsAvecCommentaire: num(r.engagement?.mains_avec_commentaire),
    },
    social: {
      amities: num(r.social?.amities),
      demandesEnAttente: num(r.social?.demandes_en_attente),
      groupes: num(r.social?.groupes),
      membresGroupes: num(r.social?.membres_groupes),
    },
    profils: {
      formatFavori: dict(r.profils?.format_favori),
      varianteFavorite: dict(r.profils?.variante_favorite),
      frequence: dict(r.profils?.frequence),
    },
    topPosteurs: Array.isArray(r.top_posteurs)
      ? r.top_posteurs.map((t: any) => ({ pseudo: String(t.pseudo), n: num(t.n) }))
      : [],
  };
}
