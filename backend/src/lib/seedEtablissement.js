import { supabase } from '../config/supabase.js'

// Quand un NOUVEL établissement est créé (bootstrap du 1er compte Fondateur),
// on lui pré-remplit les mêmes valeurs par défaut que celles posées à
// l'origine pour le premier établissement (migrations 002 et 003) :
// les 7 niveaux standards (tarifs à 0, à configurer ensuite) et les 4
// catégories de frais. Sans ça, un nouvel établissement arrive sur une page
// Tarifs / Types de frais totalement vide et bloquée.
const NIVEAUX_DEFAUT = [
  { niveau: '6eme', ordre: 1, examen: false },
  { niveau: '5eme', ordre: 2, examen: false },
  { niveau: '4eme', ordre: 3, examen: false },
  { niveau: '3eme', ordre: 4, examen: true },
  { niveau: 'Seconde', ordre: 5, examen: false },
  { niveau: 'Premiere', ordre: 6, examen: false },
  { niveau: 'Terminale', ordre: 7, examen: true }
]

const TYPES_FRAIS_DEFAUT = [
  { code: 'droit_inscription', nom: "Droit d'inscription", echeances_max: 2, ordre: 1 },
  { code: 'scolarite', nom: 'Scolarité', echeances_max: 7, ordre: 2 },
  { code: 'frais_annexes', nom: 'Frais annexes', echeances_max: 1, ordre: 3 },
  { code: 'frais_examen', nom: 'Frais examen', echeances_max: 1, ordre: 4 }
]

export async function seedNouvelEtablissement(code_etablissement) {
  const { error: errTarifs } = await supabase
    .from('tarifs')
    .upsert(
      NIVEAUX_DEFAUT.map((n) => ({ ...n, code_etablissement })),
      { onConflict: 'code_etablissement,niveau', ignoreDuplicates: true }
    )
  if (errTarifs) console.error('[seedEtablissement] erreur seed tarifs:', errTarifs.message)

  const { error: errTypes } = await supabase
    .from('types_frais')
    .upsert(
      TYPES_FRAIS_DEFAUT.map((t) => ({ ...t, code_etablissement })),
      { onConflict: 'code_etablissement,code', ignoreDuplicates: true }
    )
  if (errTypes) console.error('[seedEtablissement] erreur seed types_frais:', errTypes.message)
}
