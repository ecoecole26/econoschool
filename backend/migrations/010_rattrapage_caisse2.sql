-- RATTRAPAGE PONCTUEL — à exécuter UNE SEULE FOIS.
-- Les paiements enregistrés avant la mise en place de la page Caisse (10/08)
-- n'ont pas déclenché le crédit automatique de Caisse 2 (la fonctionnalité
-- n'existait pas encore). Ce script additionne tout ce qui existe déjà dans
-- `paiements`, crédite Caisse 2 du total, et trace ça par une ligne de
-- journal explicite pour garder un historique clair.
do $$
declare
  total_historique numeric;
  caisse2_id uuid;
  deja_fait boolean;
begin
  -- Garde-fou : si ce rattrapage a déjà été fait, on ne recrédite pas deux fois.
  select exists (
    select 1 from public.journal_caisse
    where type_operation = 'paiement_auto'
      and libelle = 'Rattrapage : paiements enregistrés avant la mise en place de la Caisse'
  ) into deja_fait;

  if deja_fait then
    raise notice 'Rattrapage déjà effectué précédemment, script ignoré.';
    return;
  end if;

  -- On ne rattrape que les paiements antérieurs à la mise en place de la
  -- Caisse (10/08 au soir) : les paiements plus récents sont déjà crédités
  -- automatiquement par l'application.
  select coalesce(sum(montant), 0) into total_historique
  from public.paiements
  where created_at < '2026-08-10 20:00:00+00';

  if total_historique = 0 then
    raise notice 'Aucun paiement antérieur à rattraper.';
    return;
  end if;

  select id into caisse2_id from public.caisses where type_caisse = 'secondaire';

  if caisse2_id is null then
    insert into public.caisses (type_caisse, statut, solde)
    values ('secondaire', 'ouverte', total_historique)
    returning id into caisse2_id;
  else
    update public.caisses
    set solde = solde + total_historique, updated_at = now()
    where id = caisse2_id;
  end if;

  insert into public.journal_caisse
    (caisse, type_operation, montant, libelle, date, statut, demande_par, valide_par)
  values
    ('secondaire', 'paiement_auto', total_historique,
     'Rattrapage : paiements enregistrés avant la mise en place de la Caisse',
     current_date, 'validee', 'Système (rattrapage)', 'Système (rattrapage)');

  raise notice 'Caisse 2 créditée de % FCFA (rattrapage historique).', total_historique;
end $$;
