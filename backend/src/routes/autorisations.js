import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { notifierRoles } from '../lib/caisse.js'

const router = Router()

const TYPES_ACTION = ['decaissement', 'reduction_scolarite', 'depense', 'inscription_eleve', 'autre']

// GET /api/autorisations?statut=en_attente
//
// Fondateur : voit TOUTES les demandes de son établissement (filtrable par
// statut). Économe : voit UNIQUEMENT ses propres demandes (traçabilité,
// pas d'accès à celles des autres si jamais plusieurs économes se
// succèdent).
router.get('/', requireAuth, async (req, res) => {
  let query = supabase
    .from('autorisations')
    .select('*')
    .eq('etablissement', req.user.code_etablissement)
    .order('created_at', { ascending: false })

  if (req.user.role !== 'fondateur') {
    query = query.eq('econome_login', req.user.nom)
  }
  if (req.query.statut) {
    query = query.eq('statut', req.query.statut)
  }

  const { data, error } = await query

  if (error) {
    console.error('[autorisations] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des autorisations' })
  }

  res.json({ autorisations: data || [] })
})

// POST /api/autorisations  { type_action, description, montant? }
//
// L'Économe demande l'autorisation d'effectuer UNE opération précise. Le
// Fondateur reçoit une notification et valide/refuse depuis son espace.
router.post('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'econome') {
    return res.status(403).json({ error: "Seul l'Économe peut faire une demande d'autorisation" })
  }

  const { type_action, description, montant } = req.body || {}
  const descriptionPropre = String(description || '').trim()

  if (!descriptionPropre) {
    return res.status(400).json({ error: "La description de l'opération est requise" })
  }
  if (type_action && !TYPES_ACTION.includes(type_action)) {
    return res.status(400).json({ error: 'Type d\'action invalide' })
  }

  const payload = {
    etablissement: req.user.code_etablissement,
    econome_login: req.user.nom,
    type_action: type_action || 'autre',
    description: descriptionPropre,
    montant: montant != null && montant !== '' ? Number(montant) : null,
    statut: 'en_attente'
  }

  const { data, error } = await supabase.from('autorisations').insert(payload).select().single()

  if (error) {
    console.error('[autorisations] erreur création:', error.message)
    return res.status(500).json({ error: "Erreur lors de l'envoi de la demande" })
  }

  await notifierRoles({
    roles: ['fondateur'],
    code_etablissement: req.user.code_etablissement,
    titre: 'Nouvelle demande d\'autorisation',
    message: `${req.user.nom} demande une autorisation : ${descriptionPropre}`,
    sauf_role: 'econome'
  })

  res.json({ autorisation: data })
})

// PATCH /api/autorisations/:id  { statut: 'approuvee' | 'refusee', reponse_note? }
//
// Le Fondateur SEUL peut répondre à une demande — et seulement une fois
// (une demande déjà tranchée ne peut plus être changée, pour garder la
// trace fiable).
router.patch('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut répondre à une demande' })
  }

  const { statut, reponse_note } = req.body || {}
  if (!['approuvee', 'refusee'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide (approuvee ou refusee attendu)' })
  }

  const { data: demande } = await supabase
    .from('autorisations')
    .select('id, statut, econome_login, description')
    .eq('id', req.params.id)
    .eq('etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (!demande) return res.status(404).json({ error: 'Demande introuvable' })
  if (demande.statut !== 'en_attente') {
    return res.status(400).json({ error: 'Cette demande a déjà été traitée' })
  }

  const { data, error } = await supabase
    .from('autorisations')
    .update({
      statut,
      decideur_login: req.user.nom,
      reponse_note: reponse_note ? String(reponse_note).trim() : null,
      decided_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select()
    .single()

  if (error) {
    console.error('[autorisations] erreur décision:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la demande' })
  }

  await notifierRoles({
    roles: ['econome'],
    code_etablissement: req.user.code_etablissement,
    titre: statut === 'approuvee' ? 'Autorisation accordée' : 'Autorisation refusée',
    message: `${req.user.nom} a ${statut === 'approuvee' ? 'accordé' : 'refusé'} : ${demande.description}`,
    sauf_role: 'fondateur'
  })

  res.json({ autorisation: data })
})

export default router
