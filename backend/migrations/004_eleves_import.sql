-- À exécuter dans Supabase → SQL Editor (projet econoschool)
-- Ajoute les colonnes nécessaires à l'import CSV+photos : niveau, affectation,
-- redoublement, et l'URL de la photo stockée dans Supabase Storage.

alter table public.eleves
  add column if not exists niveau text,
  add column if not exists affecte boolean default false,
  add column if not exists redoublant boolean default false,
  add column if not exists photo_url text;

-- NOTE : on n'ajoute volontairement PAS de contrainte "unique" sur matricule ici
-- (au cas où des doublons existeraient déjà dans la table). L'import gère les
-- doublons lui-même (recherche par matricule avant insertion, cf. route /import).

-- Pour stocker les photos, crée un bucket Supabase Storage nommé "photos-eleves"
-- (Dashboard → Storage → New bucket → coche "Public bucket") : aucune policy SQL
-- supplémentaire n'est nécessaire, le backend utilise la clé service_role qui
-- contourne déjà les règles RLS du storage.
