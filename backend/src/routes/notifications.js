import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// GET /api/notifications -> les 30 dernières notifications pour le rôle
// connecté DANS SON ÉTABLISSEMENT.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('destinataire_role', req.user.role)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) {
    console.error('[notifications] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des notifications' })
  }

  res.json({ notifications: data || [] })
})

// POST /api/notifications/:id/lu -> marque une notification comme lue.
router.post('/:id/lu', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ lu: true })
    .eq('id', req.params.id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('destinataire_role', req.user.role)

  if (error) {
    console.error('[notifications] erreur maj:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }

  res.json({ ok: true })
})

// POST /api/notifications/tout-lire -> marque tout comme lu pour le rôle connecté.
router.post('/tout-lire', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('notifications')
    .update({ lu: true })
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('destinataire_role', req.user.role)
    .eq('lu', false)

  if (error) {
    console.error('[notifications] erreur maj groupée:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la mise à jour' })
  }

  res.json({ ok: true })
})

export default router
