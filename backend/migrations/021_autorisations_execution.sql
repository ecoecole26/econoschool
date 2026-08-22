-- Migration 021 : permet à une autorisation APPROUVÉE de débloquer
-- réellement l'opération correspondante pour l'Économe qui l'a demandée
-- (et pas seulement de servir de carnet de suivi).
--
-- `utilisee_at` marque le moment où l'autorisation a servi à exécuter
-- l'opération (sortie de caisse ou réduction accordée). Une fois utilisée,
-- elle ne peut plus resservir : l'Économe doit refaire une demande pour la
-- fois suivante. NULL = encore disponible.

alter table public.autorisations
  add column if not exists utilisee_at timestamptz;

create index if not exists autorisations_disponibles_idx
  on public.autorisations (etablissement, econome_login, type_action, statut)
  where utilisee_at is null;
