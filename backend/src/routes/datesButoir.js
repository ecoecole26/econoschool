import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

const router = Router()

// GET /api/dates-butoir?annee= -> { global, parNiveau } pour l'année demandée
// (par défaut l'année en cours).
router.get('/', requireAuth, async (req, res) => {
  let annee
  try {
    annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) return res.json({ global: null, parNiveau: {}, annee: null })

  const { data, error } = await supabase
    .from('dates_butoir')
    .select('niveau, date_butoir')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)

  if (error) {
    console.error('[dates-butoir] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des dates butoir' })
  }

  const global = (data || []).find((d) => !d.niveau)?.date_butoir || null
  const parNiveau = {}
  for (const d of data || []) {
    if (d.niveau) parNiveau[d.niveau] = d.date_butoir
  }

  res.json({ global, parNiveau, annee })
})

// PUT /api/dates-butoir/globale  { date_butoir: 'YYYY-MM-DD' | null }
router.put('/globale', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Réservé au Fondateur' })
  }
  await upsertOuSupprime(req, res, null, req.body?.date_butoir)
})

// PUT /api/dates-butoir/niveau/:niveau  { date_butoir: 'YYYY-MM-DD' | null }
router.put('/niveau/:niveau', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Réservé au Fondateur' })
  }
  const { niveau } = req.params
  if (!niveau) return res.status(400).json({ error: 'Niveau manquant' })
  await upsertOuSupprime(req, res, niveau, req.body?.date_butoir)
})

async function upsertOuSupprime(req, res, niveau, date_butoir) {
  const code_etablissement = req.user.code_etablissement
  try {
    const annee = await getAnneeCourante(code_etablissement)
    if (!annee) {
      return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement" })
    }

    if (!date_butoir) {
      const q = supabase
        .from('dates_butoir')
        .delete()
        .eq('code_etablissement', code_etablissement)
        .eq('annee_scolaire', annee)
      const { error } = niveau ? await q.eq('niveau', niveau) : await q.is('niveau', null)
      if (error) throw error
      return res.json({ ok: true, niveau, date_butoir: null })
    }

    const q = supabase
      .from('dates_butoir')
      .select('id')
      .eq('code_etablissement', code_etablissement)
      .eq('annee_scolaire', annee)
    const { data: existant, error: errLecture } = niveau
      ? await q.eq('niveau', niveau).maybeSingle()
      : await q.is('niveau', null).maybeSingle()
    if (errLecture) throw errLecture

    if (existant) {
      const { error } = await supabase
        .from('dates_butoir')
        .update({ date_butoir, updated_at: new Date().toISOString() })
        .eq('id', existant.id)
      if (error) throw error
    } else {
      const { error } = await supabase
        .from('dates_butoir')
        .insert({ niveau, date_butoir, code_etablissement, annee_scolaire: annee })
      if (error) throw error
    }

    res.json({ ok: true, niveau, date_butoir })
  } catch (err) {
    console.error('[dates-butoir] erreur écriture:', err.message)
    res.status(500).json({ error: "Erreur lors de l'enregistrement de la date butoir" })
  }
}

export default router
