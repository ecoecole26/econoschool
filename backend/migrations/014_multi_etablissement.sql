-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- MULTI-ÉTABLISSEMENT : chaque établissement doit être totalement autonome
-- (mêmes tables, mais chaque ligne appartient désormais à un établissement
-- précis, identifié par `code_etablissement`). Ce script :
--   1) ajoute la colonne code_etablissement partout où c'est nécessaire ;
--   2) remplace les contraintes "unique" globales par des contraintes
--      composées avec code_etablissement (ex: matricule devient unique
--      PAR établissement, plus globalement) ;
--   3) NE SUPPRIME AUCUNE DONNÉE. Les lignes déjà existantes (créées avant
--      cette migration) auront code_etablissement = NULL : elles deviennent
--      simplement invisibles pour tout le monde tant qu'on ne leur assigne
--      pas un code manuellement. Si tu veux rattacher les données de test
--      actuelles à un établissement précis, fais-le avec un UPDATE ciblé
--      après ce script (voir note en bas de fichier), ou supprime-les si ce
--      sont vraiment des données jetables.

-- 1) etablissements : le code devient la clé d'identification publique.
alter table public.etablissements
  add column if not exists code_etablissement text;

drop index if exists etablissements_code_etablissement_idx;
create unique index etablissements_code_etablissement_idx
  on public.etablissements (code_etablissement)
  where code_etablissement is not null;

-- 2) utilisateurs (comptes fondateur/proviseur/econome) : un compte par
--    rôle ET par établissement (plus par rôle seul).
alter table public.utilisateurs
  add column if not exists code_etablissement text;

drop index if exists utilisateurs_code_role_idx;
create unique index utilisateurs_code_role_idx
  on public.utilisateurs (code_etablissement, role)
  where code_etablissement is not null;

-- 3) eleves : matricule unique PAR établissement (deux écoles peuvent très
--    bien avoir chacune un élève matricule "12345"). On retire d'abord toute
--    ancienne contrainte unique sur matricule seul, quel que soit son nom
--    (elle a pu être créée à la main dans le dashboard Supabase, pas via une
--    migration trackée ici).
alter table public.eleves
  add column if not exists code_etablissement text;

do $$
declare
  contrainte record;
begin
  for contrainte in
    select conname
    from pg_constraint
    where conrelid = 'public.eleves'::regclass
      and contype in ('u', 'p')
      and pg_get_constraintdef(oid) ilike '%matricule%'
      and pg_get_constraintdef(oid) not ilike '%code_etablissement%'
  loop
    execute format('alter table public.eleves drop constraint %I', contrainte.conname);
  end loop;
end $$;

drop index if exists eleves_code_matricule_idx;
create unique index eleves_code_matricule_idx
  on public.eleves (code_etablissement, matricule)
  where code_etablissement is not null;

-- 4) tarifs : niveau unique PAR établissement (chaque école fixe ses propres
--    montants pour "6eme", "Terminale", etc.).
alter table public.tarifs
  add column if not exists code_etablissement text;

alter table public.tarifs drop constraint if exists tarifs_niveau_key;
drop index if exists tarifs_code_niveau_idx;
create unique index tarifs_code_niveau_idx
  on public.tarifs (code_etablissement, niveau)
  where code_etablissement is not null;

-- 5) types_frais : code unique PAR établissement.
alter table public.types_frais
  add column if not exists code_etablissement text;

alter table public.types_frais drop constraint if exists types_frais_code_key;
drop index if exists types_frais_code_code_idx;
create unique index types_frais_code_code_idx
  on public.types_frais (code_etablissement, code)
  where code_etablissement is not null;

-- 6) paiements, reductions : rattachés à un établissement (pas de contrainte
--    unique nécessaire ici, juste la colonne pour filtrer).
alter table public.paiements
  add column if not exists code_etablissement text;

alter table public.reductions
  add column if not exists code_etablissement text;

-- 7) caisses : une caisse "principale" PAR établissement.
alter table public.caisses
  add column if not exists code_etablissement text;

drop index if exists caisses_code_type_idx;
create unique index caisses_code_type_idx
  on public.caisses (code_etablissement, type_caisse)
  where code_etablissement is not null;

-- 8) journal_caisse : la colonne `etablissement` existe déjà (texte libre,
--    utilisée par lib/caisse.js) ; on ajoute code_etablissement séparément
--    pour un filtrage fiable (le nom peut changer, le code non).
alter table public.journal_caisse
  add column if not exists code_etablissement text;

-- 9) banque : un compte bancaire PAR établissement.
alter table public.banque
  add column if not exists code_etablissement text;

drop index if exists banque_code_idx;
create unique index banque_code_idx
  on public.banque (code_etablissement)
  where code_etablissement is not null;

-- 10) dates_butoir : dates limites PAR établissement (et par niveau, comme
--     avant). On retire l'ancienne contrainte/valeur unique implicite sur
--     niveau seul si elle existe.
alter table public.dates_butoir
  add column if not exists code_etablissement text;

-- 11) notifications : déjà une colonne `etablissement` (texte libre) —
--     on ajoute code_etablissement pour un filtrage fiable.
alter table public.notifications
  add column if not exists code_etablissement text;

-- === NOTE : rattacher les données de test existantes ===
-- Si tu veux garder ton établissement de test actuel plutôt que de le
-- recréer depuis zéro, remplace 'TON_CODE' ci-dessous par le code choisi
-- pour cet établissement, puis exécute (une fois) :
--
-- update public.etablissements set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.utilisateurs   set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.eleves         set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.tarifs         set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.types_frais    set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.paiements      set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.reductions     set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.caisses        set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.journal_caisse set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.banque         set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.dates_butoir   set code_etablissement = 'TON_CODE' where code_etablissement is null;
-- update public.notifications  set code_etablissement = 'TON_CODE' where code_etablissement is null;
--
-- Sinon (données de test jetables), laisse tout tel quel : ces lignes
-- resteront simplement invisibles dans l'app, tu peux les supprimer plus
-- tard depuis le dashboard Supabase quand tu veux.
