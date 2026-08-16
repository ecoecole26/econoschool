import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// GET /api/tarifs -> tous les niveaux de MON établissement, triés
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('tarifs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .not('niveau', 'is', null)
    .order('ordre', { ascending: true })

  if (error) {
    console.error('[tarifs] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des tarifs' })
  }

  res.json({ tarifs: data })
})

// PUT /api/tarifs  { tarifs: [{ id, scolarite_annuelle, frais_inscription, frais_annexes, frais_examen }, ...] }
// Sauvegarde groupée de tous les niveaux en une fois (comme le bouton "Sauvegarder" unique de la page).
router.put('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier les tarifs' })
  }

  const { tarifs } = req.body || {}
  if (!Array.isArray(tarifs) || tarifs.length === 0) {
    return res.status(400).json({ error: 'Liste de tarifs invalide' })
  }

  const results = []
  for (const t of tarifs) {
    const { id, scolarite_annuelle, frais_inscription, frais_annexes, frais_examen } = t
    if (!id) continue

    const { data, error } = await supabase
      .from('tarifs')
      .update({
        scolarite_annuelle: Number(scolarite_annuelle) || 0,
        frais_inscription: Number(frais_inscription) || 0,
        frais_annexes: Number(frais_annexes) || 0,
        frais_examen: frais_examen === '' || frais_examen == null ? null : Number(frais_examen),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('code_etablissement', req.user.code_etablissement)
      .select()
      .single()

    if (error) {
      console.error('[tarifs] erreur sauvegarde niveau', t.niveau, error.message)
      return res.status(500).json({ error: `Erreur sur le niveau ${t.niveau || id}` })
    }
    results.push(data)
  }

  res.json({ tarifs: results })
})

export default router
