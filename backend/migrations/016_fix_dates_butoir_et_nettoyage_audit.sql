-- Migration 016 : suite de l'audit multi-établissement/multi-année.
--
-- 1) DATES_BUTOIR — vrai bug actif trouvé à l'audit.
--    L'index unique existant portait sur `niveau` seul (globalement, tous
--    établissements confondus), alors que le code (routes/datesButoir.js)
--    filtre bien par code_etablissement + annee_scolaire. Conséquence :
--    deux établissements ne pouvaient pas définir une date butoir pour le
--    même niveau (ex: "6eme") en même temps -> erreur visible côté Fondateur
--    ("Erreur lors de l'enregistrement de la date butoir").
--
-- 2) NETTOYAGE — contraintes orphelines repérées à l'audit, non utilisées
--    par le code actuel (caisses et banque sont volontairement CUMULATIFS,
--    non scopés par année, comme une vraie caisse/un vrai compte bancaire).
--    Aucune de ces suppressions ne change le comportement de l'app : ces
--    index ne sont référencés par aucune requête du code.

-- === 1) dates_butoir : unicité par établissement + année + niveau ===

drop index if exists public.dates_butoir_niveau_idx;
drop index if exists public.dates_butoir_globale_idx;

-- Date butoir "par niveau" : unique par établissement + année + niveau
create unique index if not exists dates_butoir_code_annee_niveau_idx
  on public.dates_butoir (code_etablissement, annee_scolaire, niveau)
  where niveau is not null;

-- Date butoir "globale" (niveau = null) : une seule par établissement + année
create unique index if not exists dates_butoir_code_annee_globale_idx
  on public.dates_butoir (code_etablissement, annee_scolaire)
  where niveau is null;

-- === 2) Nettoyage des contraintes orphelines (résidus d'anciens schémas) ===

-- NB : ces 4 contraintes (suffixe `_key`) sont de vraies contraintes UNIQUE,
-- pas de simples index -> `drop index` échoue dessus (erreur 2BP01), il
-- faut passer par `alter table ... drop constraint`.

-- tarifs : ancienne contrainte sur (classe, etablissement), colonnes non
-- utilisées par tarifs.js depuis la migration 014.
alter table public.tarifs drop constraint if exists tarifs_classe_etablissement_key;

-- caisses : contrainte sur (etablissement, type_caisse, annee_scolaire) —
-- colonne `etablissement` (héritée) jamais utilisée par caisse.js, qui ne
-- filtre que par code_etablissement + type_caisse.
alter table public.caisses drop constraint if exists caisses_etablissement_type_caisse_annee_scolaire_key;

-- banque : contraintes sur la colonne `etablissement` (héritée), jamais
-- utilisées par banqueCompte.js, qui ne filtre que par code_etablissement.
alter table public.banque drop constraint if exists banque_etablissement_key;
alter table public.banque drop constraint if exists banque_etablissement_annee_scolaire_key;

-- NB : les colonnes orphelines elles-mêmes (`etablissement` et
-- `annee_scolaire` sur `banque`, `etablissement` sur `caisses`, `classe`/
-- `etablissement` sur `tarifs`) ne sont PAS supprimées ici par prudence
-- (suppression de colonne = irréversible). Elles peuvent être nettoyées
-- plus tard, une fois les étapes 2 et 3 de l'audit terminées, si on
-- confirme qu'elles ne servent vraiment à rien.
