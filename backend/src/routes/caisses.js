import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  TYPES_CAISSE,
  caissesVisiblesPourRole,
  roleAAccesCaisse,
  roleAAccesOperation,
  enregistrerMouvementCaisse
} from '../lib/caisse.js'

const router = Router()

// GET /api/caisses -> les caisses visibles pour le rôle connecté, chacune avec
// son journal (les demandes "en_attente" sont incluses pour que le Fondateur
// puisse les traiter).
router.get('/', requireAuth, async (req, res) => {
  const typesVisibles = caissesVisiblesPourRole(req.user.role)

  const { data: caisses, error: errCaisses } = await supabase
    .from('caisses')
    .select('*')
    .in('type_caisse', typesVisibles)

  if (errCaisses) {
    console.error('[caisses] erreur lecture caisses:', errCaisses.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des caisses' })
  }

  const { data: journal, error: errJournal } = await supabase
    .from('journal_caisse')
    .select('*')
    .in('caisse', typesVisibles)
    .order('date', { ascending: false })
   

  if (errJournal) {
    console.error('[caisses] erreur lecture journal:', errJournal.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture du journal' })
  }

  // On renvoie toujours les 2 types de caisses (même absentes de la table,
  // pas encore ouvertes) avec solde 0, pour que le frontend affiche une carte.
  const caissesCompletes = typesVisibles.map(
    (type) =>
      caisses.find((c) => c.type_caisse === type) || {
        type_caisse: type,
        solde: 0,
        statut: 'non_ouverte'
      }
  )

  res.json({ caisses: caissesCompletes, journal: journal || [] })
})

// POST /api/caisses/mouvements  { type_caisse, type_operation, libelle, montant, date }
// type_operation : 'entree' | 'sortie' | 'reduction'
router.post('/mouvements', requireAuth, async (req, res) => {
  const { type_caisse, type_operation, libelle, montant, date } = req.body || {}

  if (!TYPES_CAISSE.includes(type_caisse)) {
    return res.status(400).json({ error: 'Caisse invalide' })
  }
  if (!['entree', 'sortie', 'reduction'].includes(type_operation)) {
    return res.status(400).json({ error: 'Type d\'opération invalide' })
  }
  if (!roleAAccesCaisse(req.user.role, type_caisse)) {
    return res.status(403).json({ error: 'Tu n\'as pas accès à cette caisse' })
  }
  if (!roleAAccesOperation(req.user.role, type_operation)) {
    return res
      .status(403)
      .json({ error: 'Les sorties/retraits/dépenses sont réservés au Fondateur' })
  }
  const montantNum = Number(montant)
  if (!montantNum || montantNum <= 0) {
    return res.status(400).json({ error: 'Montant invalide' })
  }

  try {
    const { mouvement, caisse } = await enregistrerMouvementCaisse({
      type_caisse,
      type_operation,
      montant: montantNum,
      libelle,
      date,
      etablissement: req.user.etablissement,
      role: req.user.role,
      nom: req.user.nom
    })

    res.json({
      mouvement,
      caisse,
      enAttente: mouvement.statut === 'en_attente'
    })
  } catch (err) {
    console.error('[caisses] erreur enregistrement mouvement:', err.message)
    res.status(500).json({ error: err.message || "Erreur lors de l'enregistrement" })
  }
})

// POST /api/caisses/mouvements/:id/valider  (Fondateur uniquement)
// Valide une "reduction" en attente : applique l'impact sur le solde de Caisse 2.
router.post('/mouvements/:id/valider', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut valider une réduction' })
  }

  const { data: mouvement, error: errLecture } = await supabase
    .from('journal_caisse')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()

  if (errLecture || !mouvement) {
    return res.status(404).json({ error: 'Mouvement introuvable' })
  }
  if (mouvement.statut !== 'en_attente') {
    return res.status(400).json({ error: 'Ce mouvement a déjà été traité' })
  }

  const { data: caisse, error: errCaisse } = await supabase
    .from('caisses')
    .select('*')
    .eq('type_caisse', mouvement.caisse)
    .maybeSingle()

  if (errCaisse || !caisse) {
    return res.status(404).json({ error: 'Caisse introuvable' })
  }

  const nouveauSolde = caisse.solde - Number(mouvement.montant)

  const { error: errMajCaisse } = await supabase
    .from('caisses')
    .update({ solde: nouveauSolde, updated_at: new Date().toISOString() })
    .eq('id', caisse.id)

  if (errMajCaisse) {
    console.error('[caisses] erreur mise à jour solde:', errMajCaisse.message)
    return res.status(500).json({ error: 'Erreur lors de la mise à jour du solde' })
  }

  const { data: mouvementMaj, error: errMajMouvement } = await supabase
    .from('journal_caisse')
    .update({ statut: 'validee', valide_par: req.user.nom || req.user.role })
    .eq('id', mouvement.id)
    .select()
    .single()

  if (errMajMouvement) {
    console.error('[caisses] erreur validation mouvement:', errMajMouvement.message)
    return res.status(500).json({ error: 'Erreur lors de la validation' })
  }

  res.json({ mouvement: mouvementMaj, nouveau_solde: nouveauSolde })
})

// POST /api/caisses/mouvements/:id/rejeter  (Fondateur uniquement)
router.post('/mouvements/:id/rejeter', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut rejeter une réduction' })
  }

  const { data: mouvement, error: errLecture } = await supabase
    .from('journal_caisse')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle()

  if (errLecture || !mouvement) {
    return res.status(404).json({ error: 'Mouvement introuvable' })
  }
  if (mouvement.statut !== 'en_attente') {
    return res.status(400).json({ error: 'Ce mouvement a déjà été traité' })
  }

  const { data: mouvementMaj, error } = await supabase
    .from('journal_caisse')
    .update({
      statut: 'rejetee',
      valide_par: req.user.nom || req.user.role,
      commentaire: req.body?.commentaire || null
    })
    .eq('id', mouvement.id)
    .select()
    .single()

  if (error) {
    console.error('[caisses] erreur rejet mouvement:', error.message)
    return res.status(500).json({ error: 'Erreur lors du rejet' })
  }

  res.json({ mouvement: mouvementMaj })
})

export default router
