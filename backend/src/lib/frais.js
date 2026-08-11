// Calcule le détail des frais dus pour un élève à partir de son niveau + statut.
// Règles métier :
// - un élève AFFECTÉ ne paie pas la scolarité (prise en charge), elle est
//   déduite du total à payer et son champ reste grisé côté frontend ;
// - une réduction (accordée par le Fondateur, page Réductions) s'applique en
//   pourcentage UNIQUEMENT sur la scolarité, jamais sur inscription/annexes/examen.
export function calculerFrais(tarif, eleve, reductionPourcentage = 0) {
  const scolarite = Number(tarif?.scolarite_annuelle) || 0
  const inscription = Number(tarif?.frais_inscription) || 0
  const annexes = Number(tarif?.frais_annexes) || 0
  const examen = tarif?.examen ? Number(tarif?.frais_examen) || 0 : 0

  const pourcentage = Number(reductionPourcentage) || 0
  const scolariteBase = eleve.affecte ? 0 : scolarite
  const montantReduction = eleve.affecte ? 0 : Math.round((scolariteBase * pourcentage) / 100)
  const scolariteApplicable = scolariteBase - montantReduction

  const total_du = scolariteApplicable + inscription + annexes + examen

  return {
    scolarite,
    inscription,
    annexes,
    examen,
    scolariteApplicable,
    total_du,
    reductionPourcentage: pourcentage,
    montantReduction
  }
}

// Renvoie la réduction active de l'élève (une seule à la fois), ou null.
export async function getReductionActive(supabase, eleve_id) {
  const { data, error } = await supabase
    .from('reductions')
    .select('*')
    .eq('eleve_id', eleve_id)
    .eq('statut', 'active')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}
