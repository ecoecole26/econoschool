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

// PUT /api/eleves/:id  { nom, classe, statut }
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { nom, classe, statut } = req.body || {}

  if (!nom || !classe) {
    return res.status(400).json({ error: 'Nom et classe sont requis' })
  }

  const { data, error } = await supabase
    .from('eleves')
    .update({ nom, classe, statut })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[eleves] erreur mise à jour:', error.message)
    return res.status(500).json({ error: "Erreur lors de la mise à jour de l'élève" })
  }

  res.json({ eleve: data })
})

export default router
