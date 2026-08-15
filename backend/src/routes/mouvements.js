import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { TYPE_ENCAISSEMENT, TYPE_SORTIE, caissesVisiblesPourRole } from '../lib/caisse.js'

const router = Router()

// GET /api/mouvements?type_operation=Encaissement|Sortie&caisse=&date_debut=&date_fin=
// Sert les pages "Entrées" (Encaissement) et "Dépenses" (Sortie) : liste des
// mouvements du journal_caisse filtrés par type, avec le total sur la
// période/le filtre demandé.
router.get('/', requireAuth, async (req, res) => {
  const { type_operation, date_debut = '', date_fin = '' } = req.query || {}

  if (![TYPE_ENCAISSEMENT, TYPE_SORTIE].includes(type_operation)) {
    return res.status(400).json({ error: "Paramètre type_operation invalide (Encaissement ou Sortie)" })
  }

  const typesVisibles = caissesVisiblesPourRole(req.user.role)

  let q = supabase
    .from('journal_caisse')
    .select('*')
    .eq('type_operation', type_operation)
    .in('caisse', typesVisibles)
    .order('date', { ascending: false })

  if (date_debut) q = q.gte('date', `${date_debut}T00:00:00`)
  if (date_fin) q = q.lte('date', `${date_fin}T23:59:59`)

  const { data, error } = await q

  if (error) {
    console.error('[mouvements] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des mouvements' })
  }

  const total = (data || []).reduce((somme, m) => somme + Number(m.montant || 0), 0)

  res.json({ lignes: data || [], total })
})

export default router
