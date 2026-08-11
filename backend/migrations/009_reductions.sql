-- Une réduction est un pourcentage accordé par le Fondateur, appliqué
-- UNIQUEMENT sur la scolarité annuelle d'un élève (jamais sur inscription,
-- annexes ou examen). Un élève n'a qu'une seule réduction "active" à la fois ;
-- l'historique des anciennes réductions est conservé (statut 'remplacee' /
-- 'annulee') pour la traçabilité.
create table if not exists public.reductions (
  id uuid primary key default gen_random_uuid()
);

alter table public.reductions
  add column if not exists eleve_id uuid references public.eleves(id) on delete cascade,
  add column if not exists matricule text,
  add column if not exists pourcentage numeric not null default 0,
  add column if not exists motif text,
  add column if not exists accordee_par text,
  add column if not exists annee_scolaire text,
  add column if not exists statut text not null default 'active',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.reductions drop constraint if exists reductions_statut_check;
alter table public.reductions
  add constraint reductions_statut_check check (statut in ('active', 'remplacee', 'annulee'));

alter table public.reductions drop constraint if exists reductions_pourcentage_check;
alter table public.reductions
  add constraint reductions_pourcentage_check check (pourcentage >= 0 and pourcentage <= 100);

-- Un seul index (non unique, juste pour accélérer la recherche "réduction
-- active de cet élève" utilisée par les pages Paiements et Réductions).
create index if not exists reductions_eleve_actif_idx
  on public.reductions (eleve_id)
  where statut = 'active';
