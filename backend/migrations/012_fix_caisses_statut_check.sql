-- Corrige un souci constaté en prod : l'ancienne contrainte CHECK sur
-- `caisses.statut`, héritée de l'app d'origine (créée directement en base,
-- pas via nos migrations), bloquait encore l'enregistrement de 'pause' /
-- 'fermee' malgré la migration 011 — probablement parce que son nom réel
-- n'était pas 'caisses_statut_check', donc le `drop constraint if exists`
-- de la migration 011 ne l'a pas trouvée.

-- 1) Met à niveau les éventuelles valeurs historiques non reconnues, pour
--    qu'aucune ligne existante ne bloque l'ajout de la nouvelle contrainte.
update public.caisses
set statut = 'ouverte'
where statut is null or statut not in ('ouverte', 'fermee', 'pause');

-- 2) Supprime TOUTES les contraintes CHECK portant sur la colonne `statut`
--    de `caisses`, quel que soit leur nom.
do $$
declare
  contrainte record;
begin
  for contrainte in
    select conname
    from pg_constraint
    where conrelid = 'public.caisses'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%statut%'
  loop
    execute format('alter table public.caisses drop constraint %I', contrainte.conname);
  end loop;
end $$;

-- 3) Recrée une unique contrainte propre avec les 3 valeurs autorisées.
alter table public.caisses
  add constraint caisses_statut_check check (statut in ('ouverte', 'fermee', 'pause'));
