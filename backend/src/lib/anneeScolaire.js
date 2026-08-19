import { supabase } from '../config/supabase.js'

// Récupère l'année scolaire actuellement active d'un établissement (colonne
// `annee` déjà existante sur `etablissements`, ex: "2026-2027"). C'est la
// SEULE année sur laquelle on peut créer/modifier des données — toute autre
// année est automatiquement en lecture seule côté application.
export async function getAnneeCourante(code_etablissement) {
  const { data, error } = await supabase
    .from('etablissements')
    .select('annee')
    .eq('code_etablissement', code_etablissement)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data?.annee || null
}

// Renvoie l'année à utiliser pour une requête : celle demandée en query
// param si présente, sinon l'année courante de l'établissement.
export async function resolveAnnee(req, anneeDemandee) {
  return anneeDemandee || (await getAnneeCourante(req.user.code_etablissement))
}

// Bloque une action de modification si l'année ciblée n'est pas l'année
// courante de l'établissement (consultation d'une année passée = lecture
// seule partout dans l'appli).
export function verifierAnneeModifiable(annee, anneeCourante) {
  if (annee !== anneeCourante) {
    const err = new Error(
      `Lecture seule : l'année ${annee} est une année passée (année en cours : ${anneeCourante || '—'}).`
    )
    err.statusCode = 403
    throw err
  }
}

// Calcule une année scolaire par défaut à partir de la date du jour, pour
// initialiser un TOUT NOUVEL établissement (avant que le Fondateur ne l'ait
// lui-même précisée) : de septembre à décembre → année N-(N+1), de janvier à
// août → année (N-1)-N (on considère toujours être dans l'année scolaire qui
// vient de commencer ou qui est en cours).
export function anneeParDefaut(date = new Date()) {
  const annee = date.getFullYear()
  const mois = date.getMonth() + 1 // 1-12
  return mois >= 9 ? `${annee}-${annee + 1}` : `${annee - 1}-${annee}`
}
