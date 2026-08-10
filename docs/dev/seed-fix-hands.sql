-- ============================================================================
-- Remplace le `hand` STUB des 6 posts de seed par une VRAIE main valide.
-- seed.sql insérait hand = '{"variant":"nlhe","gameType":"cash"}' (sans blinds,
-- seats, board, actions) → PostCard/HandReplayer plantent au rendu
-- (« Cannot read properties of undefined (reading 'filter') » → page blanche).
-- Gabarit = une main NLHE cash complète (copiée d'un vrai post public, sans PII).
--
-- DEV UNIQUEMENT. Re-jouable. À lancer après seed.sql.
-- SQL editor : https://supabase.com/dashboard/project/ahdikgckctvduuestzrh/sql/new
-- ============================================================================

update public.posts
set hand = '{"id":"hand-1785231089144","board":{"flop":[{"rank":"T","suit":"s"},{"rank":"9","suit":"s"},{"rank":"8","suit":"s"}],"turn":{"rank":"7","suit":"s"},"river":{"rank":"6","suit":"s"}},"seats":[{"id":"s-utg","isHero":false,"position":"UTG","startingStack":500},{"id":"s-hj","isHero":false,"position":"HJ","holeCards":[{"rank":"A","suit":"s"},{"rank":"K","suit":"s"}],"startingStack":500},{"id":"s-co","isHero":true,"position":"CO","holeCards":[{"rank":"Q","suit":"s"},{"rank":"J","suit":"s"}],"startingStack":500},{"id":"s-btn","isHero":false,"position":"BTN","startingStack":500},{"id":"s-sb","isHero":false,"position":"SB","startingStack":500},{"id":"s-bb","isHero":false,"position":"BB","startingStack":500}],"blinds":{"bb":5,"sb":2},"actions":[{"id":"blind-sb","type":"post-sb","order":1,"amount":2,"seatId":"s-sb","street":"preflop"},{"id":"blind-bb","type":"post-bb","order":2,"amount":5,"seatId":"s-bb","street":"preflop"},{"id":"preflop-3","type":"fold","order":3,"seatId":"s-utg","street":"preflop"},{"id":"preflop-4","type":"raise","order":4,"amount":500,"seatId":"s-hj","street":"preflop"},{"id":"preflop-5","type":"call","order":5,"amount":500,"seatId":"s-co","street":"preflop"},{"id":"preflop-6","type":"fold","order":6,"seatId":"s-btn","street":"preflop"},{"id":"preflop-7","type":"fold","order":7,"seatId":"s-sb","street":"preflop"},{"id":"preflop-8","type":"fold","order":8,"seatId":"s-bb","street":"preflop"}],"variant":"nlhe","gameType":"cash","visibility":"public","effectiveStack":500,"revealShowdown":false}'::jsonb
where id in (
  '0a570000-0000-0000-0000-000000000001', -- Alice
  '0b570000-0000-0000-0000-000000000002', -- Bob
  '0c570000-0000-0000-0000-000000000003', -- Carol
  '0d570000-0000-0000-0000-000000000004', -- Dave
  '0f570000-0000-0000-0000-000000000005', -- Frank
  '10570000-0000-0000-0000-000000000006'  -- Mallory
);

-- Contrôle : chaque post doit avoir blinds + seats + actions non vides.
select title,
       hand->'blinds'                              as blinds,
       jsonb_array_length(hand->'seats')           as n_seats,
       jsonb_array_length(hand->'actions')         as n_actions
from public.posts
where id in (
  '0a570000-0000-0000-0000-000000000001','0b570000-0000-0000-0000-000000000002',
  '0c570000-0000-0000-0000-000000000003','0d570000-0000-0000-0000-000000000004',
  '0f570000-0000-0000-0000-000000000005','10570000-0000-0000-0000-000000000006'
)
order by title;
