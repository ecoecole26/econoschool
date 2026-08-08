-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- Ajoute des colonnes utiles pour un établissement ivoirien, sans toucher
-- aux données existantes (tout est nullable / avec valeur par défaut).

alter table public.etablissements
  add column if not exists code_etablissement text,
  add column if not exists adresse text,
  add column if not exists type text default 'Collège',
  add column if not exists academie text,      -- ex: "DRENAET Bouaké 1"
  add column if not exists devise text default 'FCFA';

comment on column public.etablissements.code_etablissement is 'Code établissement DRENAET (ex: 017242)';
comment on column public.etablissements.academie is 'Direction régionale / académie de rattachement';
