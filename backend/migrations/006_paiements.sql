-- À exécuter dans Supabase → SQL Editor (projet econoschool)

-- Complète les 4 catégories de frais si elles n'existent pas déjà
-- (Frais annexes / Frais examen ont été ajoutées manuellement en base,
-- ce script les recrée si un jour la base est réinitialisée).
insert into public.types_frais (code, nom, echeances_max, ordre)
values
  ('frais_annexes', 'Frais annexes', 1, 3),
  ('frais_examen', 'Frais examen', 1, 4)
on conflict (code) do nothing;

-- Table des paiements réels encaissés
create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid()
);

alter table public.paiements
  add column if not exists eleve_id uuid references public.eleves(id) on delete cascade,
  add column if not exists matricule text,
  add column if not exists tranche_libelle text,
  add column if not exists montant numeric not null default 0,
  add column if not exists date_paiement date not null default current_date,
  add column if not exists valide_par text,
  add column if not exists created_at timestamptz default now();

alter table public.paiements enable row level security;

create index if not exists idx_paiements_eleve on public.paiements(eleve_id);
