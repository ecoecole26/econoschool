import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

const router = Router()

// GET /api/types-frais?annee= -> les catégories de MON établissement pour
// l'année demandée (année en cours par défaut), avec leurs tranches
// imbriquées.
router.get('/', requireAuth, async (req, res) => {
  let annee
  try {
    annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) return res.json({ types: [], annee: null })

  const { data: types, error: err1 } = await supabase
    .from('types_frais')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .order('ordre', { ascending: true })

  if (err1) {
    console.error('[types-frais] erreur lecture types:', err1.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des types de frais' })
  }

  const idsTypes = (types || []).map((t) => t.id)
  const { data: tranches, error: err2 } = idsTypes.length
    ? await supabase.from('tranches_frais').select('*').in('type_frais_id', idsTypes).order('ordre', { ascending: true })
    : { data: [], error: null }

  if (err2) {
    console.error('[types-frais] erreur lecture tranches:', err2.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des tranches' })
  }

  const result = types.map((t) => ({
    ...t,
    tranches: tranches.filter((tr) => tr.type_frais_id === t.id)
  }))

  res.json({ types: result, annee })
})

// POST /api/types-frais/:typeId/tranches -> ajoute une tranche (si sous le max)
router.post('/:typeId/tranches', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier les types de frais' })
  }

  const { typeId } = req.params

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const { data: type } = await supabase
    .from('types_frais')
    .select('echeances_max')
    .eq('id', typeId)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .maybeSingle()

  if (!type) return res.status(404).json({ error: 'Type de frais introuvable pour l\'année en cours' })

  const { count } = await supabase
    .from('tranches_frais')
    .select('id', { count: 'exact', head: true })
    .eq('type_frais_id', typeId)

  if ((count || 0) >= type.echeances_max) {
    return res.status(400).json({ error: `Maximum de ${type.echeances_max} échéances atteint` })
  }

  const { data, error } = await supabase
    .from('tranches_frais')
    .insert({
      type_frais_id: typeId,
      label: `${(count || 0) + 1}ème tranche`,
      date_echeance: null,
      ordre: (count || 0) + 1
    })
    .select()
    .single()

  if (error) {
    console.error('[types-frais] erreur ajout tranche:', error.message)
    return res.status(500).json({ error: "Erreur lors de l'ajout de la tranche" })
  }

  res.json({ tranche: data })
})

// DELETE /api/types-frais/tranches/:id
router.delete('/tranches/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier les types de frais' })
  }

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  // Vérifie que la tranche appartient bien à un type de frais de MON
  // établissement, pour l'année EN COURS (défense en profondeur + garde-fou
  // années passées : une tranche d'une année passée ne peut pas être
  // supprimée, quel que soit l'id fourni).
  const { data: tranche } = await supabase
    .from('tranches_frais')
    .select('id, type_frais_id, types_frais!inner(code_etablissement, annee_scolaire)')
    .eq('id', req.params.id)
    .eq('types_frais.code_etablissement', req.user.code_etablissement)
    .eq('types_frais.annee_scolaire', annee)
    .maybeSingle()

  if (!tranche) return res.status(404).json({ error: "Tranche introuvable pour l'année en cours" })

  const { error } = await supabase.from('tranches_frais').delete().eq('id', req.params.id)

  if (error) {
    console.error('[types-frais] erreur suppression tranche:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la suppression' })
  }

  res.json({ ok: true })
})

// PUT /api/types-frais/tranches  { tranches: [{ id, label, date_echeance }, ...] }
// Sauvegarde groupée des libellés/dates (comme le bouton "Sauvegarder" unique de la page).
router.put('/tranches', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier les types de frais' })
  }

  const { tranches } = req.body || {}
  if (!Array.isArray(tranches)) {
    return res.status(400).json({ error: 'Liste de tranches invalide' })
  }

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  // Restreint la sauvegarde aux tranches qui appartiennent bien à MON
  // établissement, pour l'année EN COURS (une année passée reste figée).
  const { data: mesTypes } = await supabase
    .from('types_frais')
    .select('id')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
  const mesTypesIds = new Set((mesTypes || []).map((t) => t.id))

  const { data: mesTranches } = mesTypesIds.size
    ? await supabase.from('tranches_frais').select('id, type_frais_id').in('type_frais_id', [...mesTypesIds])
    : { data: [] }
  const mesTranchesIds = new Set((mesTranches || []).map((t) => t.id))

  for (const t of tranches) {
    if (!t.id || !mesTranchesIds.has(t.id)) continue
    const { error } = await supabase
      .from('tranches_frais')
      .update({ label: t.label, date_echeance: t.date_echeance || null })
      .eq('id', t.id)

    if (error) {
      console.error('[types-frais] erreur sauvegarde tranche', t.id, error.message)
      return res.status(500).json({ error: 'Erreur lors de la sauvegarde' })
    }
  }

  res.json({ ok: true })
})

export default router
