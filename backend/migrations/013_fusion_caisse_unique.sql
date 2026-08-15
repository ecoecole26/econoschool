-- Fusion des deux caisses en une seule ("principale"), suite aux
-- recommandations reçues : un établissement privé fonctionne avec UNE
-- seule caisse, gérée par l'Économe, le Fondateur et le Directeur des
-- Études (Proviseur) — seules les sorties restent réservées au Fondateur.
--
-- Rappel du fonctionnement d'avant cette migration : chaque paiement élève
-- créditait AUTOMATIQUEMENT les deux caisses du même montant (copie de
-- contrôle voulue par le Fondateur) — Caisse 1 et Caisse 2 représentaient
-- donc souvent le MÊME argent vu sous deux angles, pas deux sommes
-- distinctes. Seules les sorties (dépenses/retraits) étaient propres à
-- chaque caisse et retiraient du VRAI argent.
--
-- Cette migration :
-- 1) Recalcule le solde réel unique = total des encaissements (déjà complet
--    côté 'principale', qui recevait la copie intégrale) moins TOUTES les
--    sorties, qu'elles aient été enregistrées sur 'principale' ou
--    'secondaire' (les deux représentaient un vrai retrait de caisse).
-- 2) Supprime les lignes d'encaissement en double de 'secondaire' (copies
--    exactes de celles de 'principale'), pour ne garder qu'une seule ligne
--    par paiement dans le journal.
-- 3) Bascule les lignes de sortie de 'secondaire' vers 'principale', pour
--    garder l'historique complet dans la caisse unique restante.
-- 4) Met à jour le solde de 'principale' et supprime la ligne 'secondaire'
--    de la table `caisses`.
--
-- À exécuter UNE SEULE FOIS dans l'éditeur SQL de Supabase.

do $$
declare
  v_encaissements_principale numeric;
  v_sorties_toutes_caisses numeric;
  v_nouveau_solde numeric;
begin
  -- 1) Calcul du solde réel unique.
  select coalesce(sum(montant), 0) into v_encaissements_principale
  from public.journal_caisse
  where caisse = 'principale' and type_operation = 'Encaissement';

  select coalesce(sum(montant), 0) into v_sorties_toutes_caisses
  from public.journal_caisse
  where caisse in ('principale', 'secondaire') and type_operation = 'Sortie';

  v_nouveau_solde := v_encaissements_principale - v_sorties_toutes_caisses;

  -- 2) Suppression des encaissements en double sur 'secondaire' (copie de
  --    contrôle du même paiement, déjà comptée côté 'principale').
  delete from public.journal_caisse
  where caisse = 'secondaire' and type_operation = 'Encaissement';

  -- 3) Les sorties de 'secondaire' sont du VRAI argent sorti : on les garde
  --    dans l'historique, rattachées désormais à la caisse unique.
  update public.journal_caisse
  set caisse = 'principale'
  where caisse = 'secondaire' and type_operation = 'Sortie';

  -- 4) Mise à jour du solde de la caisse unique, suppression de l'autre.
  update public.caisses
  set solde = v_nouveau_solde, updated_at = now()
  where type_caisse = 'principale';

  -- Si 'principale' n'existait pas encore en base pour une raison
  -- quelconque, on la crée avec le solde recalculé.
  insert into public.caisses (type_caisse, statut, solde)
  select 'principale', 'ouverte', v_nouveau_solde
  where not exists (select 1 from public.caisses where type_caisse = 'principale');

  delete from public.caisses where type_caisse = 'secondaire';

  raise notice 'Fusion terminée : solde caisse unique = % FCFA', v_nouveau_solde;
end $$;
