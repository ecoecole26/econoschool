-- À exécuter dans Supabase → SQL Editor (projet econoschool)
--
-- BUG DE FOND : l'index unique posé par la migration 014 sur
-- `tarifs (code_etablissement, niveau)` NE TIENT PAS COMPTE de
-- `annee_scolaire`. Résultat : impossible d'avoir deux lignes pour le même
-- niveau (ex: "6eme") sur deux années différentes pour un même
-- établissement — ce qui casse silencieusement la recopie des tarifs à
-- chaque démarrage d'une nouvelle année scolaire (POST /etablissement/annees).
--
-- Cette migration corrige l'index pour inclure `annee_scolaire`, comme le
-- reste du code l'a toujours supposé.

-- 1) S'assurer que la colonne existe bien (déjà posée manuellement en
--    production, mais absente des migrations trackées jusqu'ici).
alter table public.tarifs
  add column if not exists annee_scolaire text;

-- 2) Remplacer l'ancien index (code_etablissement, niveau) par le bon
--    (code_etablissement, annee_scolaire, niveau).
drop index if exists public.tarifs_code_niveau_idx;
create unique index if not exists tarifs_code_annee_niveau_idx
  on public.tarifs (code_etablissement, annee_scolaire, niveau)
  where code_etablissement is not null and annee_scolaire is not null;

-- 3) Vérification : doit afficher le nouvel index ci-dessus.
select indexname, indexdef
from pg_indexes
where tablename = 'tarifs' and schemaname = 'public';
