-- Migration 019 : "ancien solde" de caisse à la nouvelle année.
--
-- Point demandé : la caisse d'un établissement n'est jamais totalement
-- vide en fin d'année. Ce solde de clôture doit être conservé à PART
-- (table séparée), sans être mélangé aux entrées de la nouvelle année, et
-- visible SEULEMENT par le Fondateur (pas l'Économe).
--
-- Important : ceci n'affecte PAS le fonctionnement actuel de `caisses`
-- (qui reste cumulatif, comme confirmé précédemment — le solde réel
-- continue de courir sans interruption). Cette table est un ARCHIVAGE :
-- une photo du solde de chaque caisse au moment précis où une nouvelle
-- année démarre, gardée pour référence/consultation Fondateur.

create table if not exists public.caisses_soldes_anterieurs (
  id uuid primary key default gen_random_uuid(),
  code_etablissement text not null,
  annee_scolaire text not null,      -- l'année qui se termine (photo de clôture)
  type_caisse text not null,
  montant numeric not null default 0,
  created_at timestamptz not null default now()
);

alter table public.caisses_soldes_anterieurs enable row level security;

create unique index if not exists caisses_soldes_anterieurs_unique_idx
  on public.caisses_soldes_anterieurs (code_etablissement, annee_scolaire, type_caisse);
