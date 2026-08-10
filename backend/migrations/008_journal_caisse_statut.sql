-- Ajoute le workflow d'approbation sur le journal de caisse : une opération de
-- type "reduction" saisie par l'Économe ou le Proviseur reste "en_attente"
-- jusqu'à validation (ou rejet) par le Fondateur. Les autres opérations restent
-- "validee" immédiatement, comme avant.

alter table public.journal_caisse
  add column if not exists statut text not null default 'validee',
  add column if not exists demande_par text,
  add column if not exists valide_par text,
  add column if not exists commentaire text;

-- statut possibles : 'validee' | 'en_attente' | 'rejetee'
alter table public.journal_caisse drop constraint if exists journal_caisse_statut_check;
alter table public.journal_caisse
  add constraint journal_caisse_statut_check check (statut in ('validee', 'en_attente', 'rejetee'));
