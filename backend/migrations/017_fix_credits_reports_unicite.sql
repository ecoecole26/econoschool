-- Migration 017 : correction de l'unicité sur `credits_reports` (dette
-- antérieure). Trouvé en croisant le code avec les vraies contraintes de
-- la base (même méthode que pour tarifs/dates_butoir).
--
-- PROBLÈME : le code (routes/eleves.js à l'import, routes/paiements.js à
-- l'encaissement) traite `credits_reports` comme UNE SEULE ligne par élève
-- par établissement : la dette s'accumule dans cette ligne unique au fil
-- des rentrées (`solde_reporte` cumulé), et `paiements.js` la lit avec
-- `.maybeSingle()` sur (etablissement, matricule) — qui plante si jamais
-- deux lignes existent pour le même élève.
--
-- Mais la contrainte unique réellement posée en base porte sur TROIS
-- colonnes : (matricule, annee, etablissement). Conséquence :
-- `.upsert(..., { onConflict: 'etablissement,matricule' })` (routes/eleves.js,
-- détection automatique de dette à l'import) ne correspond à AUCUNE
-- contrainte réelle -> Postgres refuse la requête ("no unique or exclusion
-- constraint matching the ON CONFLICT specification"). Le code capture
-- cette erreur et se contente de la logger côté serveur (invisible pour le
-- Fondateur/Économe) : la dette antérieure ne serait alors JAMAIS
-- enregistrée, silencieusement, dès qu'un établissement importe sa 2e
-- rentrée. Même famille de bug que celui déjà corrigé sur `tarifs`.
--
-- Table vide à ce jour (vérifié à l'audit précédent) : aucune donnée à
-- dédupliquer avant de resserrer la contrainte.

alter table public.credits_reports
  drop constraint if exists credits_reports_matricule_annee_etablissement_key;

create unique index if not exists credits_reports_etablissement_matricule_idx
  on public.credits_reports (etablissement, matricule);
