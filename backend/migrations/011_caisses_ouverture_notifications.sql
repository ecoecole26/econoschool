-- Ajoute le suivi d'ouverture/fermeture/pause sur les caisses (qui a ouvert,
-- quand, qui a fermé, quand) et une table `notifications` pour prévenir le
-- Proviseur et le Fondateur quand l'Économe ouvre une caisse.

alter table public.caisses
  add column if not exists ouverte_par text,
  add column if not exists ouverte_le timestamptz,
  add column if not exists fermee_par text,
  add column if not exists fermee_le timestamptz;

-- statut possibles désormais : 'ouverte' | 'fermee' | 'pause'
-- (la valeur 'non_ouverte' reste une valeur virtuelle renvoyée par l'API
-- quand la ligne n'existe pas encore en base, pas une valeur stockée).
alter table public.caisses drop constraint if exists caisses_statut_check;
alter table public.caisses
  add constraint caisses_statut_check check (statut in ('ouverte', 'fermee', 'pause'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  etablissement text,
  destinataire_role text not null,
  titre text not null,
  message text not null,
  lu boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_destinataire_idx
  on public.notifications (destinataire_role, lu, created_at desc);
