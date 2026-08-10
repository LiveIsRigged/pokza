import { supabase } from '../lib/supabase';
import type { ReportTargetType } from './reports';

// ============================================================================
// Couche data du back-office admin. TOUT passe par des RPC SECURITY DEFINER
// gatées `is_admin()` côté base — un non-admin qui appellerait ces fonctions se
// fait rejeter par la base, pas seulement par l'UI. Les tables reports/
// user_sanctions/admin_audit_log ne sont JAMAIS lues en direct par le client.
// ============================================================================

export type ReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';
export type ContentStatus = 'visible' | 'hidden' | 'removed';
export type SanctionType = 'warning' | 'suspended' | 'banned';

export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  open: 'À traiter',
  reviewing: 'En cours',
  actioned: 'Sanctionné',
  dismissed: 'Rejeté',
};

export const SANCTION_TYPE_LABEL: Record<SanctionType, string> = {
  warning: 'Avertissement',
  suspended: 'Suspension',
  banned: 'Bannissement',
};

// ── File des signalements (RPC admin_list_reports) ───────────────────────────
interface AdminReportRpcRow {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  status: ReportStatus;
  severity: 'normal' | 'priority';
  reporter_id: string | null;
  reporter_email: string | null;
  details: string | null;
  created_at: string;
  resolved_at: string | null;
  reports_on_target: number;
}

export interface AdminReport {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  status: ReportStatus;
  severity: 'normal' | 'priority';
  reporterId?: string;
  reporterEmail?: string;
  details?: string;
  createdAt: string;
  resolvedAt?: string;
  /** Nombre total de signalements sur la même cible — pour épingler les cibles multi-signalées. */
  reportsOnTarget: number;
}

function rpcRowToReport(row: AdminReportRpcRow): AdminReport {
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason,
    status: row.status,
    severity: row.severity,
    reporterId: row.reporter_id ?? undefined,
    reporterEmail: row.reporter_email ?? undefined,
    details: row.details ?? undefined,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? undefined,
    reportsOnTarget: Number(row.reports_on_target),
  };
}

/** File triée côté base : prioritaires d'abord, puis multi-signalés, puis récents. `status` filtre
 * l'onglet (null = tout). */
export async function listReports(status?: ReportStatus | null): Promise<AdminReport[]> {
  const { data, error } = await supabase.rpc('admin_list_reports', { p_status: status ?? null });
  if (error) throw error;
  return (data as AdminReportRpcRow[]).map(rpcRowToReport);
}

// ── Contexte d'un signalement (RPC admin_get_report_context) ──────────────────
export interface Sanction {
  id: string;
  userId: string;
  type: SanctionType;
  reason?: string;
  createdAt: string;
  expiresAt?: string;
  liftedAt?: string;
}

/** Une sanction est « active » si non levée et non expirée — même règle que `is_sanctioned` en base. */
export function isSanctionActive(s: Sanction): boolean {
  if (s.liftedAt) return false;
  if (s.expiresAt && new Date(s.expiresAt).getTime() <= Date.now()) return false;
  return true;
}

function jsonToSanction(s: Record<string, unknown>): Sanction {
  return {
    id: String(s.id),
    userId: String(s.user_id),
    type: s.type as SanctionType,
    reason: (s.reason as string) ?? undefined,
    createdAt: String(s.created_at),
    expiresAt: (s.expires_at as string) ?? undefined,
    liftedAt: (s.lifted_at as string) ?? undefined,
  };
}

export interface ReportContext {
  report: AdminReport & { resolutionReason?: string };
  /** Contenu visé, forme variable selon `report.targetType` (post/comment/user) — champs bruts. */
  target: Record<string, unknown> | null;
  /** Historique de sanctions de l'auteur du contenu visé (ou du compte visé). */
  authorSanctions: Sanction[];
  reportsOnTarget: number;
  reportsOnAuthorAsUser: number;
}

export async function getReportContext(reportId: string): Promise<ReportContext> {
  const { data, error } = await supabase.rpc('admin_get_report_context', { p_report_id: reportId });
  if (error) throw error;
  const ctx = data as {
    report: AdminReportRpcRow & { resolution_reason?: string };
    target: Record<string, unknown> | null;
    author_sanctions: Record<string, unknown>[];
    reports_on_target: number;
    reports_on_author_as_user: number;
  };
  return {
    report: { ...rpcRowToReport(ctx.report), resolutionReason: ctx.report.resolution_reason ?? undefined },
    target: ctx.target,
    authorSanctions: (ctx.author_sanctions ?? []).map(jsonToSanction),
    reportsOnTarget: Number(ctx.reports_on_target),
    reportsOnAuthorAsUser: Number(ctx.reports_on_author_as_user),
  };
}

// ── Actions admin ────────────────────────────────────────────────────────────

/** Masquer / retirer / rétablir un contenu (jamais de suppression physique immédiate). */
export async function setContentStatus(
  targetType: 'post' | 'comment',
  targetId: string,
  status: ContentStatus,
  reason?: string
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_content_status', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

/** Sanctionner un compte. `expiresAt` null = définitif. Le ban tente aussi de bloquer la connexion
 * (auth.users.banned_until, best-effort côté base). */
export async function sanctionUser(
  userId: string,
  type: SanctionType,
  reason?: string,
  expiresAt?: string | null
): Promise<void> {
  const { error } = await supabase.rpc('admin_sanction_user', {
    p_user_id: userId,
    p_type: type,
    p_reason: reason ?? null,
    p_expires_at: expiresAt ?? null,
  });
  if (error) throw error;
}

/** Lever une sanction (réversibilité 4.7). */
export async function liftSanction(sanctionId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_lift_sanction', { p_sanction_id: sanctionId });
  if (error) throw error;
}

/** Résoudre / rejeter un signalement + accusé de traitement au signaleur (2.6). */
export async function resolveReport(reportId: string, status: ReportStatus, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_resolve_report', {
    p_report_id: reportId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw error;
}

// ── Fiche modération d'un utilisateur (RPC admin_get_user_context — script extra) ─
export interface UserModerationContext {
  profile: { id: string; pseudo: string; displayName: string; ageConfirmed: boolean; createdAt: string } | null;
  sanctions: Sanction[];
  reportsAgainstUser: number;
  recentContentCount: { posts: number; comments: number };
}

export async function getUserContext(userId: string): Promise<UserModerationContext> {
  const { data, error } = await supabase.rpc('admin_get_user_context', { p_user_id: userId });
  if (error) throw error;
  const ctx = data as {
    profile: Record<string, unknown> | null;
    sanctions: Record<string, unknown>[];
    reports_against_user: number;
    posts_count: number;
    comments_count: number;
  };
  return {
    profile: ctx.profile
      ? {
          id: String(ctx.profile.id),
          pseudo: String(ctx.profile.pseudo),
          displayName: String(ctx.profile.display_name ?? ctx.profile.pseudo),
          ageConfirmed: Boolean(ctx.profile.age_confirmed),
          createdAt: String(ctx.profile.created_at),
        }
      : null,
    sanctions: (ctx.sanctions ?? []).map(jsonToSanction),
    reportsAgainstUser: Number(ctx.reports_against_user),
    recentContentCount: { posts: Number(ctx.posts_count), comments: Number(ctx.comments_count) },
  };
}

/** Bascule le verrou monétisation (7.3/7.4) : un compte soupçonné mineur passe `age_confirmed` à
 * false. Réservé admin, journalisé côté base. */
export async function setAgeConfirmed(userId: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_age_confirmed', { p_user_id: userId, p_value: value });
  if (error) throw error;
}

// ── Journal d'audit (RPC admin_list_audit_log — script extra) ─────────────────
interface AuditRpcRow {
  id: string;
  admin_id: string | null;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  adminName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export async function listAuditLog(limit = 100): Promise<AuditEntry[]> {
  const { data, error } = await supabase.rpc('admin_list_audit_log', { p_limit: limit });
  if (error) throw error;
  return (data as AuditRpcRow[]).map((row) => ({
    id: row.id,
    adminName: row.admin_name ?? '(admin supprimé)',
    action: row.action,
    targetType: row.target_type ?? undefined,
    targetId: row.target_id ?? undefined,
    details: row.details ?? undefined,
    createdAt: row.created_at,
  }));
}
