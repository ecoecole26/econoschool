import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()
const ROLES = ['fondateur', 'econome']

// GET /api/utilisateurs -> les 2 comptes (sans jamais renvoyer le mot de passe)
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('utilisateurs')
    .select('id, role, login, nom_complet, etablissement')
    .in('role', ROLES)

  if (error) {
    console.error('[utilisateurs] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des comptes' })
  }

  const comptes = { fondateur: null, econome: null }
  for (const row of data || []) comptes[row.role] = row

  res.json({ comptes })
})

// GET /api/utilisateurs/bootstrap-status -> vrai/faux, appelable sans être connecté,
// pour savoir si l'app doit encore afficher l'écran de création du 1er compte Fondateur.
router.get('/bootstrap-status', async (req, res) => {
  const { data, error } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('role', 'fondateur')
    .maybeSingle()

  if (error) {
    console.error('[utilisateurs] erreur bootstrap-status:', error.message)
    return res.status(500).json({ error: 'Erreur serveur' })
  }

  res.json({ needsBootstrap: !data })
})

// PUT /api/utilisateurs/:role  { nom_complet, login, mot_de_passe? }
// mot_de_passe optionnel : si vide, on ne change pas le mot de passe existant.
//
// Cas particulier "bootstrap" : si on crée le tout premier compte Fondateur et
// qu'aucun compte Fondateur n'existe encore, on autorise la requête SANS token
// (impossible de se connecter avant que ce compte existe). Dès qu'un Fondateur
// existe, toute modification (y compris créer l'Économe) exige d'être connecté
// en tant que Fondateur.
router.put('/:role', async (req, res, next) => {
  const { role } = req.params
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' })
  }

  const { data: existingFondateur } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('role', 'fondateur')
    .maybeSingle()

  const isBootstrap = role === 'fondateur' && !existingFondateur
  if (isBootstrap) return handleSave(req, res)

  // sinon, on exige une session Fondateur valide
  return requireAuth(req, res, () => {
    if (req.user.role !== 'fondateur') {
      return res.status(403).json({ error: 'Seul le Fondateur peut créer/modifier les comptes' })
    }
    return handleSave(req, res)
  })
})

async function handleSave(req, res) {
  const { role } = req.params
  const { nom_complet, login, mot_de_passe } = req.body || {}
  if (!nom_complet || !login) {
    return res.status(400).json({ error: 'Nom complet et login sont requis' })
  }

  const { data: existing } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('role', role)
    .maybeSingle()

  const payload = { role, nom_complet, login }
  if (mot_de_passe) {
    payload.mot_de_passe = await bcrypt.hash(mot_de_passe, 10)
  } else if (!existing) {
    return res.status(400).json({ error: 'Mot de passe requis pour la création du compte' })
  }

  const { data, error } = existing
    ? await supabase.from('utilisateurs').update(payload).eq('id', existing.id).select('id, role, login, nom_complet').single()
    : await supabase.from('utilisateurs').insert(payload).select('id, role, login, nom_complet').single()

  if (error) {
    console.error('[utilisateurs] erreur sauvegarde:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde du compte' })
  }

  res.json({ compte: data })
}

export default router
