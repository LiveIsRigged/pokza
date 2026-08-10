-- ============================================================================
-- Constat #3 : d'anciennes entrées d'audit de DEV affichent « mod√©ration »
-- (mojibake UTF-8). Ce n'est PAS un bug de l'app — elle enregistre/affiche
-- correctement les accents (vérifié via une note saisie dans l'app). La
-- corruption vient de scripts SQL de test lancés via psql/sed en amont.
-- Ce nettoyage est COSMÉTIQUE et DEV UNIQUEMENT (la prod est propre).
--
-- SQL editor DEV : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- ============================================================================

-- Aperçu avant suppression (facultatif) :
-- select id, action, details from public.admin_audit_log where details::text like '%√%';

delete from public.admin_audit_log where details::text like '%√%';

-- Par sécurité, nettoie aussi d'éventuels motifs corrompus ailleurs (dev) :
update public.reports        set details = null           where details like '%√%';
update public.user_sanctions set reason  = null           where reason  like '%√%';
update public.posts          set mod_reason = null        where mod_reason like '%√%';

select 'lignes audit restantes avec mojibake' as info,
       count(*) as n
from public.admin_audit_log
where details::text like '%√%';
