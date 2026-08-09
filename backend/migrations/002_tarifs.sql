-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- Crée/complète la table `tarifs` : une ligne par niveau, montants par type de frais.
-- Si la table existe déjà avec d'autres colonnes, ce script ajoute seulement ce qui manque.

create table if not exists public.tarifs (
  id uuid primary key default gen_random_uuid(),
  niveau text unique not null,
  ordre int not null default 0,
  examen boolean not null default false,
  scolarite_annuelle numeric not null default 0,
  frais_inscription numeric not null default 0,
  frais_annexes numeric not null default 0,
  frais_examen numeric,
  updated_at timestamptz default now()
);

alter table public.tarifs
  add column if not exists ordre int not null default 0,
  add column if not exists examen boolean not null default false,
  add column if not exists scolarite_annuelle numeric not null default 0,
  add column if not exists frais_inscription numeric not null default 0,
  add column if not exists frais_annexes numeric not null default 0,
  add column if not exists frais_examen numeric,
  add column if not exists updated_at timestamptz default now();

-- Pré-remplissage des 7 niveaux standards (ne touche pas aux lignes déjà existantes)
insert into public.tarifs (niveau, ordre, examen)
values
  ('6eme', 1, false),
  ('5eme', 2, false),
  ('4eme', 3, false),
  ('3eme', 4, true),
  ('Seconde', 5, false),
  ('Premiere', 6, false),
  ('Terminale', 7, true)
on conflict (niveau) do nothing;
