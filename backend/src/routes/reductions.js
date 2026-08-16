import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { calculerFrais, getReductionActive } from '../lib/frais.js'

const router = Router()

// Toute la page Réductions est réservée au Fondateur : c'est lui qui reçoit
// l'élève et accorde le pourcentage.
router.use(requireAuth, (req, res, next) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut accéder aux réductions' })
  }
  next()
})

// GET /api/reductions/recherche?matricule=XXXX
// Même fiche que la recherche Paiements (élève + frais dus), plus la
// réduction actuellement active sur cet élève s'il y en a une.
router.get('/recherche', async (req, res) => {
  const matricule = (req.query.matricule || '').trim()
  if (!matricule) {
    return res.status(400).json({ error: 'Matricule requis' })
  }

  const { data: eleve, error: errEleve } = await supabase
    .from('eleves')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .ilike('matricule', matricule)
    .maybeSingle()

  if (errEleve) {
    console.error('[reductions] erreur recherche élève:', errEleve.message)
    return res.status(500).json({ error: 'Erreur lors de la recherche' })
  }
  if (!eleve) {
    return res.status(404).json({ error: `Aucun élève avec le matricule "${matricule}"` })
  }

  const { data: tarif } = await supabase
    .from('tarifs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('niveau', eleve.niveau)
    .maybeSingle()

  let reduction = null
  try {
    reduction = await getReductionActive(supabase, eleve.id)
  } catch (errReduction) {
    console.error('[reductions] erreur lecture réduction:', errReduction.message)
  }

  const fraisActuels = calculerFrais(tarif || {}, eleve, reduction?.pourcentage || 0)

  res.json({ eleve, tarif: tarif || null, reduction, frais: fraisActuels })
})

// POST /api/reductions  { eleve_id, pourcentage, motif }
// Accorde (ou remplace) la réduction active de l'élève. L'ancienne réduction
// active, s'il y en a une, passe en statut "remplacee" pour garder l'historique.
router.post('/', async (req, res) => {
  const { eleve_id, pourcentage, motif } = req.body || {}

  const pourcentageNum = Number(pourcentage)
  if (!eleve_id) {
    return res.status(400).json({ error: 'Élève requis' })
  }
  if (Number.isNaN(pourcentageNum) || pourcentageNum < 0 || pourcentageNum > 100) {
    return res.status(400).json({ error: 'Pourcentage invalide (0 à 100)' })
  }

  const { data: eleve, error: errEleve } = await supabase
    .from('eleves')
    .select('id, matricule, niveau, affecte')
    .eq('id', eleve_id)
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (errEleve || !eleve) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  // Remplace l'ancienne réduction active éventuelle par la nouvelle.
  const { error: errRemplacement } = await supabase
    .from('reductions')
    .update({ statut: 'remplacee', updated_at: new Date().toISOString() })
    .eq('eleve_id', eleve_id)
    .eq('statut', 'active')

  if (errRemplacement) {
    console.error('[reductions] erreur remplacement ancienne réduction:', errRemplacement.message)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la réduction" })
  }

  const { data: reduction, error: errInsert } = await supabase
    .from('reductions')
    .insert({
      eleve_id,
      matricule: eleve.matricule,
      pourcentage: pourcentageNum,
      motif: motif || null,
      accordee_par: req.user.nom || req.user.role,
      statut: 'active',
      code_etablissement: req.user.code_etablissement
    })
    .select()
    .single()

  if (errInsert) {
    console.error('[reductions] erreur création réduction:', errInsert.message)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la réduction" })
  }

  const { data: tarif } = await supabase
    .from('tarifs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('niveau', eleve.niveau)
    .maybeSingle()

  const frais = calculerFrais(tarif || {}, eleve, pourcentageNum)

  res.json({ reduction, frais })
})

// POST /api/reductions/:id/annuler -> annule une réduction active (retour à
// la scolarité pleine pour cet élève).
router.post('/:id/annuler', async (req, res) => {
  const { data: reduction, error: errLecture } = await supabase
    .from('reductions')
    .select('*')
    .eq('id', req.params.id)
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (errLecture || !reduction) {
    return res.status(404).json({ error: 'Réduction introuvable' })
  }
  if (reduction.statut !== 'active') {
    return res.status(400).json({ error: 'Cette réduction n\'est plus active' })
  }

  const { data: reductionMaj, error } = await supabase
    .from('reductions')
    .update({ statut: 'annulee', updated_at: new Date().toISOString() })
    .eq('id', reduction.id)
    .select()
    .single()

  if (error) {
    console.error('[reductions] erreur annulation:', error.message)
    return res.status(500).json({ error: "Erreur lors de l'annulation" })
  }

  res.json({ reduction: reductionMaj })
})

export default router
