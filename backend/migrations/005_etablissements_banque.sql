-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- Coordonnées bancaires de l'établissement, affichées sur les reçus/documents
-- officiels (ex: virement des frais de scolarité). Simple paramétrage ici —
-- le suivi des mouvements réels (rapprochement bancaire) viendra dans un
-- module séparé (table `banque`, déjà existante côté ancien projet).

alter table public.etablissements
  add column if not exists banque_nom text,
  add column if not exists banque_titulaire text,
  add column if not exists banque_rib text,
  add column if not exists banque_iban text;

comment on column public.etablissements.banque_nom is 'Nom de la banque (ex: SGBCI, NSIA Banque)';
comment on column public.etablissements.banque_titulaire is 'Intitulé du compte (souvent = nom de l''établissement)';
comment on column public.etablissements.banque_rib is 'RIB local (24 chiffres)';
comment on column public.etablissements.banque_iban is 'IBAN (si virements internationaux)';
