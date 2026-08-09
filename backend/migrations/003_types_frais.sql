-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- Deux tables : les catégories de frais (Droit d'inscription, Scolarité)
-- et leurs tranches de paiement (nom + date d'échéance).

create table if not exists public.types_frais (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  nom text not null,
  echeances_max int not null default 4,
  ordre int not null default 0
);

create table if not exists public.tranches_frais (
  id uuid primary key default gen_random_uuid(),
  type_frais_id uuid references public.types_frais(id) on delete cascade,
  label text not null,
  date_echeance date,
  ordre int not null default 0,
  created_at timestamptz default now()
);

alter table public.types_frais enable row level security;
alter table public.tranches_frais enable row level security;

-- Les 2 catégories standard (ne recrée pas si déjà présentes)
insert into public.types_frais (code, nom, echeances_max, ordre)
values
  ('droit_inscription', 'Droit d''inscription', 2, 1),
  ('scolarite', 'Scolarité', 7, 2)
on conflict (code) do nothing;
