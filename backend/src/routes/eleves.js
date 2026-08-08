import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// GET /api/eleves?search=...&classe=...&statut=...
router.get('/', requireAuth, async (req, res) => {
  const { search = '', classe = '', statut = '' } = req.query

  // NOTE: select('*') volontairement large ici — la colonne aperçue dans Supabase
  // commençait par "redu..." (reduction ? redoublant ?) sans confirmation du nom exact.
  // À restreindre à des colonnes précises une fois le schéma confirmé.
  let query = supabase
    .from('eleves')
    .select('*', { count: 'exact' })
    .order('nom', { ascending: true })
    .limit(200)

  if (search) {
    query = query.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
  }
  if (classe) {
    query = query.ilike('classe', `%${classe}%`)
  }
  if (statut) {
    query = query.eq('statut', statut)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[eleves] erreur Supabase:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des élèves' })
  }

  res.json({ eleves: data, total: count })
})

export default router
