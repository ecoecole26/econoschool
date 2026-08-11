// Supabase (PostgREST) plafonne CHAQUE requête à 1000 lignes par défaut,
// même sans .limit() explicite. Sur une base de 2000+ élèves, un simple
// `.select('*')` ne renvoie donc que les 1000 premières lignes — ce qui
// fausse silencieusement tous les totaux (bilan financier, effectifs, etc.).
//
// Cette fonction contourne le plafond en paginant automatiquement avec
// .range() jusqu'à avoir récupéré toutes les lignes.
//
// Usage :
//   const eleves = await fetchTout((from, to) =>
//     supabase.from('eleves').select('*').order('nom').range(from, to)
//   )
const TAILLE_PAGE = 1000

export async function fetchTout(construireRequete) {
  let tout = []
  let from = 0

  while (true) {
    const { data, error } = await construireRequete(from, from + TAILLE_PAGE - 1)
    if (error) throw new Error(error.message)

    tout = tout.concat(data || [])

    if (!data || data.length < TAILLE_PAGE) break
    from += TAILLE_PAGE
  }

  return tout
}
