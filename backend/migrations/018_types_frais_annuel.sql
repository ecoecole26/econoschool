-- Migration 018 : `types_frais` devient ANNUEL, comme `tarifs`.
--
-- Jusqu'ici, les catégories de frais (Droit d'inscription, Scolarité...) et
-- leurs tranches (avec dates d'échéance) étaient partagées par TOUTES les
-- années scolaires d'un établissement. Ce n'est pas correct : les dates
-- d'échéance changent d'une année à l'autre, et l'établissement doit
-- pouvoir ajuster ses types de frais par année (tout en reconduisant par
-- défaut ceux de l'année précédente, comme pour les tarifs).
--
-- `tranches_frais` n'a pas besoin de colonne annee_scolaire propre : elle
-- est déjà scopée via sa clé étrangère `type_frais_id` -> `types_frais`,
-- qui elle-même sera scopée par année après cette migration.
--
-- BACKFILL : un seul établissement a des données à ce jour, jamais changé
-- d'année -> backfill sans ambiguïté avec l'année courante.

alter table public.types_frais
  add column if not exists annee_scolaire text;

update public.types_frais t
set annee_scolaire = et.annee
from public.etablissements et
where t.code_etablissement = et.code_etablissement
  and t.annee_scolaire is null;

-- Ancienne contrainte (code_etablissement, code) -> remplacée par
-- (code_etablissement, annee_scolaire, code).
alter table public.types_frais drop constraint if exists types_frais_code_key;
drop index if exists public.types_frais_code_code_idx;

create unique index if not exists types_frais_code_annee_code_idx
  on public.types_frais (code_etablissement, annee_scolaire, code)
  where code_etablissement is not null and annee_scolaire is not null;
