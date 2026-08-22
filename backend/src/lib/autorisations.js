import { supabase } from '../config/supabase.js'

// Cherche une autorisation APPROUVÉE et pas encore utilisée pour cet
// Économe/établissement/type d'action, et la marque comme utilisée dans le
// même mouvement (condition `utilisee_at is null` dans le UPDATE : si deux
// requêtes arrivent en même temps sur la même autorisation, une seule des
// deux gagne la course — l'autre voit 0 ligne mise à jour et repart bredouille,
// pas de risque de "dépenser" deux fois la même autorisation).
//
// Renvoie l'autorisation consommée (utile pour l'afficher/la référencer),
// ou `null` si aucune n'est disponible.
export async function consommerAutorisationApprouvee({
  code_etablissement,
  econome_login,
  type_action
}) {
  const { data: dispo, error: errLecture } = await supabase
    .from('autorisations')
    .select('id')
    .eq('etablissement', code_etablissement)
    .eq('econome_login', econome_login)
    .eq('type_action', type_action)
    .eq('statut', 'approuvee')
    .is('utilisee_at', null)
    .order('decided_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (errLecture || !dispo) return null

  const { data: consommee, error: errMaj } = await supabase
    .from('autorisations')
    .update({ utilisee_at: new Date().toISOString() })
    .eq('id', dispo.id)
    .is('utilisee_at', null)
    .select()
    .maybeSingle()

  if (errMaj || !consommee) return null // une autre requête l'a consommée entre-temps

  return consommee
}
