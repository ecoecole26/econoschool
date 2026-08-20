-- Migration 015 : correction de l'unicité sur `tarifs` (bug racine trouvé
-- lors de l'audit multi-établissement/multi-année).
--
-- CONTEXTE : cette migration a déjà été exécutée directement en base
-- (Supabase SQL Editor) lors de la session précédente. Ce fichier est
-- recréé ici uniquement pour garder l'historique des migrations complet
-- dans le repo. Ré-exécuter ce script ne fait rien de dangereux (tout est
-- en `if exists` / `if not exists`), donc c'est sans risque si jamais il
-- est rejoué par erreur.
--
-- PROBLÈME : l'ancienne contrainte unique sur `tarifs` ne portait que sur
-- (code_etablissement, niveau) [ou une variante proche], sans intégrer
-- `annee_scolaire`. Résultat : "+ Démarrer une nouvelle année" ne pouvait
-- jamais recréer les tarifs pour la nouvelle année tant que l'ancienne
-- ligne (année précédente) existait encore pour ce niveau — la copie
-- échouait silencieusement.

drop index if exists public.tarifs_code_niveau_idx;
drop index if exists public.tarifs_code_etablissement_niveau_key;

create unique index if not exists tarifs_code_annee_niveau_idx
  on public.tarifs (code_etablissement, annee_scolaire, niveau);
