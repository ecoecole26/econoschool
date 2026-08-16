import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// Un établissement par utilisateur connecté : on prend la ligne dont
// code_etablissement correspond au code dans le token (posé à la
// connexion). Chaque établissement a désormais sa propre ligne.

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('etablissements')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
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
  // Le code établissement ne peut jamais être changé depuis cette route :
  // le changer détacherait toutes les données déjà rattachées à ce code
  // (élèves, tarifs, paiements...). Il reste toujours celui du compte connecté.
  delete payload.code_etablissement

  const { data: existing } = await supabase
    .from('etablissements')
    .select('id')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (!existing) {
    return res.status(404).json({ error: 'Établissement introuvable pour ce compte' })
  }

  const { data, error } = await supabase
    .from('etablissements')
    .update(payload)
    .eq('id', existing.id)
    .select()
    .single()

  if (error) {
    console.error('[etablissement] erreur sauvegarde:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde' })
  }

  res.json({ etablissement: data })
})

export default router
