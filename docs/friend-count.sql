-- Nombre d'amis d'un profil, consultable pour N'IMPORTE QUEL profil (pas seulement le sien) —
-- contrairement à la liste d'amis elle-même (RLS, réservée au propriétaire), le simple COMPTE
-- n'expose aucune identité, donc SECURITY DEFINER + accès public est sûr ici. Même schéma que
-- `mutual_friends_preview` déjà en place.
create or replace function public.friend_count(p_profile uuid)
returns integer
language sql stable security definer
set search_path to 'public'
as $$
  select count(*)::integer
  from friend_requests fr
  where fr.status = 'accepted'
    and (fr.sender_id = p_profile or fr.receiver_id = p_profile)
$$;

grant execute on function public.friend_count(uuid) to anon;
grant execute on function public.friend_count(uuid) to authenticated;
grant execute on function public.friend_count(uuid) to service_role;
