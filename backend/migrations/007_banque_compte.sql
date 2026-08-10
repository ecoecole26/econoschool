-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- Suivi réel du compte bancaire : solde courant + journal des versements/retraits.
-- Distinct des colonnes etablissements.banque_* (celles-ci ne servent qu'à
-- l'affichage sur les reçus — nom banque/RIB/IBAN — pas au suivi des mouvements).
--
-- Les tables `banque` et `journal_banque` existent peut-être déjà (ancien
-- projet) avec un schéma différent : on complète plutôt qu'on écrase.

create table if not exists public.banque (
  id uuid primary key default gen_random_uuid()
);

alter table public.banque
  add column if not exists solde_actuel numeric not null default 0,
  add column if not exists solde_initial numeric not null default 0,
  add column if not exists date_ouverture date default current_date,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create table if not exists public.journal_banque (
  id uuid primary key default gen_random_uuid()
);

alter table public.journal_banque
  add column if not exists banque_id uuid references public.banque(id) on delete cascade,
  add column if not exists date date not null default current_date,
  add column if not exists type text not null default 'versement', -- 'versement' | 'retrait'
  add column if not exists libelle text,
  add column if not exists reference text,
  add column if not exists montant numeric not null default 0,
  add column if not exists solde_apres numeric not null default 0,
  add column if not exists valide_par text,
  add column if not exists created_at timestamptz default now();

alter table public.banque enable row level security;
alter table public.journal_banque enable row level security;

create index if not exists idx_journal_banque_banque on public.journal_banque(banque_id);
create index if not exists idx_journal_banque_date on public.journal_banque(date);
