import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { calculerFrais, getReductionActive } from '../lib/frais.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'
import { consommerAutorisationApprouvee } from '../lib/autorisations.js'

const router = Router()

// La page Réductions est accessible au Fondateur ET à l'Économe (pour qu'il
// puisse chercher un élève et voir sa situation) — mais ACCORDER une
// réduction reste réservé au Fondateur, sauf s'il a explicitement approuvé
// une demande d'autorisation "reduction_scolarite" pour cet Économe (page
// Autorisations). Toujours sur l'ANNÉE EN COURS — une réduction accordée
// une année ne se reporte jamais automatiquement sur l'année suivante (à
// réaccorder chaque année si toujours d'actualité).
router.use(requireAuth, (req, res, next) => {
  if (!['fondateur', 'econome'].includes(req.user.role)) {
    return res
      .status(403)
      .json({ error: 'Accès réservé au Fondateur et à l\'Économe' })
  }
  next()
})

// GET /api/reductions/recherche?matricule=XXXX
router.get('/recherche', async (req, res) => {
  const matricule = (req.query.matricule || '').trim()
  if (!matricule) {
    return res.status(400).json({ error: 'Matricule requis' })
  }

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) {
    return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement" })
  }

  const { data: identite, error: errEleve } = await supabase
    .from('eleves')
    .select('id, matricule, nom')
    .eq('code_etablissement', req.user.code_etablissement)
    .ilike('matricule', matricule)
    .maybeSingle()

  if (errEleve) {
    console.error('[reductions] erreur recherche élève:', errEleve.message)
    return res.status(500).json({ error: 'Erreur lors de la recherche' })
  }
  if (!identite) {
    return res.status(404).json({ error: `Aucun élève avec le matricule "${matricule}"` })
  }

  const { data: inscription, error: errInscription } = await supabase
    .from('inscriptions')
    .select('*')
    .eq('eleve_id', identite.id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .maybeSingle()

  if (errInscription) {
    console.error('[reductions] erreur recherche inscription:', errInscription.message)
    return res.status(500).json({ error: 'Erreur lors de la recherche' })
  }
  if (!inscription) {
    return res.status(404).json({ error: `${identite.nom} n'est pas inscrit(e) pour l'année ${annee}` })
  }

  const eleve = { ...identite, ...inscription, id: identite.id }

  const { data: tarif } = await supabase
    .from('tarifs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .eq('niveau', eleve.niveau)
    .maybeSingle()

  let reduction = null
  try {
    reduction = await getReductionActive(supabase, eleve.id, annee)
  } catch (errReduction) {
    console.error('[reductions] erreur lecture réduction:', errReduction.message)
  }

  const fraisActuels = calculerFrais(tarif || {}, eleve, reduction?.pourcentage || 0)

  res.json({ eleve, tarif: tarif || null, reduction, frais: fraisActuels, annee })
})

// POST /api/reductions  { eleve_id, pourcentage, motif }
// Accorde (ou remplace) la réduction active de l'élève POUR L'ANNÉE EN
// COURS. L'ancienne réduction active de CETTE MÊME ANNÉE, s'il y en a une,
// passe en statut "remplacee" pour garder l'historique (celles des années
// précédentes ne sont jamais touchées).
router.post('/', async (req, res) => {
  const { eleve_id, pourcentage, motif } = req.body || {}

  const pourcentageNum = Number(pourcentage)
  if (!eleve_id) {
    return res.status(400).json({ error: 'Élève requis' })
  }
  if (Number.isNaN(pourcentageNum) || pourcentageNum < 0 || pourcentageNum > 100) {
    return res.status(400).json({ error: 'Pourcentage invalide (0 à 100)' })
  }

  let autorisationUtilisee = null
  if (req.user.role !== 'fondateur') {
    autorisationUtilisee = await consommerAutorisationApprouvee({
      code_etablissement: req.user.code_etablissement,
      econome_login: req.user.nom,
      type_action: 'reduction_scolarite'
    })
    if (!autorisationUtilisee) {
      return res.status(403).json({
        error:
          'Accorder une réduction doit être validé par le Fondateur au préalable (page Autorisations).'
      })
    }
  }

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) {
    return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement" })
  }

  const { data: identite, error: errEleve } = await supabase
    .from('eleves')
    .select('id, matricule')
    .eq('id', eleve_id)
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (errEleve || !identite) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  const { data: inscription, error: errInscription } = await supabase
    .from('inscriptions')
    .select('niveau, affecte')
    .eq('eleve_id', eleve_id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .maybeSingle()

  if (errInscription || !inscription) {
    return res.status(404).json({ error: `Cet élève n'est pas inscrit pour l'année ${annee}` })
  }

  // Remplace l'ancienne réduction active éventuelle DE CETTE ANNÉE par la nouvelle.
  const { error: errRemplacement } = await supabase
    .from('reductions')
    .update({ statut: 'remplacee', updated_at: new Date().toISOString() })
    .eq('eleve_id', eleve_id)
    .eq('annee_scolaire', annee)
    .eq('statut', 'active')

  if (errRemplacement) {
    console.error('[reductions] erreur remplacement ancienne réduction:', errRemplacement.message)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement de la réduction" })
  }

  const motifFinal = autorisationUtilisee
    ? `${motif || ''} [autorisation validée par ${autorisationUtilisee.decideur_login}]`.trim()
    : motif || null

  const { data: reduction, error: errInsert } = await supabase
    .from('reductions')
    .insert({
      eleve_id,
      matricule: identite.matricule,
      pourcentage: pourcentageNum,
      motif: motifFinal,
      accordee_par: req.user.nom || req.user.role,
      statut: 'active',
      code_etablissement: req.user.code_etablissement,
      annee_scolaire: annee
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
    .eq('annee_scolaire', annee)
    .eq('niveau', inscription.niveau)
    .maybeSingle()

  const frais = calculerFrais(tarif || {}, inscription, pourcentageNum)

  res.json({ reduction, frais })
})

// POST /api/reductions/:id/annuler -> annule une réduction active (retour à
// la scolarité pleine pour cet élève). Fonctionne quelle que soit l'année de
// la réduction (une réduction d'une année passée reste annulable, même si
// cette page ne les affiche plus au quotidien).
router.post('/:id/annuler', async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut annuler une réduction' })
  }

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
