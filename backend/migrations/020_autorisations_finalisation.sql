-- Migration 020 : finalise la table `autorisations` (existait déjà, vide,
-- avec un schéma de base — probablement un essai antérieur inachevé). On
-- complète plutôt que de recréer, pour ne rien casser.
--
-- Fonctionnement (confirmé) : l'Économe fait une demande PRÉCISE (une seule
-- opération : ce décaissement-là, cette réduction-là...), le Fondateur
-- valide ou refuse en ligne. La trace = created_at (demande) + decided_at +
-- statut + reponse_note (réponse).

alter table public.autorisations
  add column if not exists type_action text,       -- 'decaissement' | 'reduction_scolarite' | 'depense' | 'inscription_eleve' | 'autre'
  add column if not exists decideur_login text,     -- nom du Fondateur qui a répondu
  add column if not exists reponse_note text;       -- commentaire optionnel du Fondateur (surtout utile en cas de refus)

-- Le statut doit rester dans un jeu de valeurs connu. On ajoute la
-- contrainte seulement si elle n'existe pas déjà (table vide -> sans
-- risque de la casser sur des données existantes).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'autorisations_statut_check'
  ) then
    alter table public.autorisations
      add constraint autorisations_statut_check
      check (statut in ('en_attente', 'approuvee', 'refusee'));
  end if;
end $$;

alter table public.autorisations alter column statut set default 'en_attente';

create index if not exists autorisations_etablissement_statut_idx
  on public.autorisations (etablissement, statut);
