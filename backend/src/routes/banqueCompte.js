import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// GET /api/banque-compte -> le compte de MON établissement (ou null si pas
// encore configuré) + le journal
router.get('/', requireAuth, async (req, res) => {
  const { data: compte, error: err1 } = await supabase
    .from('banque')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (err1) {
    console.error('[banque-compte] erreur lecture compte:', err1.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture du compte' })
  }

  let journal = []
  if (compte) {
    const { data, error: err2 } = await supabase
      .from('journal_banque')
      .select('*')
      .eq('banque_id', compte.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    if (err2) {
      console.error('[banque-compte] erreur lecture journal:', err2.message)
      return res.status(500).json({ error: 'Erreur lors de la lecture du journal' })
    }
    journal = data
  }

  res.json({ compte, journal })
})

// PUT /api/banque-compte  { solde_initial } -> crée le compte la première fois
router.put('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut configurer le compte' })
  }

  const { data: existing } = await supabase
    .from('banque')
    .select('id')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()
  if (existing) {
    return res.status(400).json({ error: 'Le compte est déjà configuré' })
  }

  const soldeInitial = Number(req.body?.solde_initial) || 0

  const { data, error } = await supabase
    .from('banque')
    .insert({
      solde_initial: soldeInitial,
      solde_actuel: soldeInitial,
      code_etablissement: req.user.code_etablissement
    })
    .select()
    .single()

  if (error) {
    console.error('[banque-compte] erreur création compte:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la création du compte' })
  }

  res.json({ compte: data })
})

// POST /api/banque-compte/mouvements  { type: 'versement'|'retrait', libelle, reference, montant, date }
router.post('/mouvements', requireAuth, async (req, res) => {
  const { type, libelle, reference, montant, date } = req.body || {}

  if (!['versement', 'retrait'].includes(type)) {
    return res.status(400).json({ error: 'Type de mouvement invalide' })
  }
  const montantNum = Number(montant)
  if (!montantNum || montantNum <= 0) {
    return res.status(400).json({ error: 'Montant invalide' })
  }

  const { data: compte, error: errCompte } = await supabase
    .from('banque')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (errCompte || !compte) {
    return res.status(400).json({ error: "Configure d'abord le compte bancaire" })
  }

  if (type === 'retrait' && montantNum > compte.solde_actuel) {
    return res.status(400).json({ error: 'Solde insuffisant pour ce retrait' })
  }

  const nouveauSolde =
    type === 'versement' ? compte.solde_actuel + montantNum : compte.solde_actuel - montantNum

  const { error: errJournal } = await supabase.from('journal_banque').insert({
    banque_id: compte.id,
    date: date || new Date().toISOString().slice(0, 10),
    type,
    libelle,
    reference,
    montant: montantNum,
    solde_apres: nouveauSolde,
    valide_par: req.user.nom || req.user.role
  })

  if (errJournal) {
    console.error('[banque-compte] erreur écriture journal:', errJournal.message)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du mouvement" })
  }

  const { error: errMaj } = await supabase
    .from('banque')
    .update({ solde_actuel: nouveauSolde, updated_at: new Date().toISOString() })
    .eq('id', compte.id)

  if (errMaj) {
    console.error('[banque-compte] erreur mise à jour solde:', errMaj.message)
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' })
  }

  res.json({ ok: true, nouveau_solde: nouveauSolde })
})

export default router
