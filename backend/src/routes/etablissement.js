import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// Un seul établissement par déploiement pour l'instant (comme l'ancien projet) :
// on prend la première ligne de la table. À faire évoluer si un jour un même
// déploiement doit servir plusieurs établissements.

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('etablissements')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[etablissement] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture de l\'établissement' })
  }

  res.json({ etablissement: data })
})

router.put('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier ces paramètres' })
  }

  const payload = req.body || {}
  delete payload.id

  const { data: existing } = await supabase.from('etablissements').select('id').limit(1).maybeSingle()

  const { data, error } = existing
    ? await supabase.from('etablissements').update(payload).eq('id', existing.id).select().single()
    : await supabase.from('etablissements').insert(payload).select().single()

  if (error) {
    console.error('[etablissement] erreur sauvegarde:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde' })
  }

  res.json({ etablissement: data })
})

export default router
