import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { seedNouvelEtablissement } from '../lib/seedEtablissement.js'
import { anneeParDefaut } from '../lib/anneeScolaire.js'

const router = Router()
const ROLES = ['fondateur', 'proviseur', 'econome']

// GET /api/utilisateurs -> les comptes DE L'ÉTABLISSEMENT CONNECTÉ (sans jamais renvoyer le mot de passe)
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('utilisateurs')
    .select('id, role, login, nom_complet, code_etablissement')
    .eq('code_etablissement', req.user.code_etablissement)
    .in('role', ROLES)

  if (error) {
    console.error('[utilisateurs] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des comptes' })
  }

  const comptes = { fondateur: null, proviseur: null, econome: null }
  for (const row of data || []) comptes[row.role] = row

  res.json({ comptes })
})

// GET /api/utilisateurs/bootstrap-status?code_etablissement=017242
// -> vrai/faux, appelable sans être connecté, pour savoir si CET
// établissement précis doit encore afficher l'écran de création du 1er
// compte Fondateur (soit parce que l'établissement lui-même n'existe pas
// encore, soit parce qu'il existe mais n'a pas encore de Fondateur).
router.get('/bootstrap-status', async (req, res) => {
  const code_etablissement = String(req.query.code_etablissement || '').trim()
  if (!code_etablissement) {
    return res.status(400).json({ error: 'Code établissement requis' })
  }

  const { data: etablissement, error: errEtab } = await supabase
    .from('etablissements')
    .select('code_etablissement, nom')
    .eq('code_etablissement', code_etablissement)
    .maybeSingle()

  if (errEtab) {
    console.error('[utilisateurs] erreur bootstrap-status (établissement):', errEtab.message)
    return res.status(500).json({ error: 'Erreur serveur' })
  }

  if (!etablissement) {
    return res.json({ needsBootstrap: true, etablissementExiste: false, nom_etablissement: null })
  }

  const { data, error } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('role', 'fondateur')
    .eq('code_etablissement', code_etablissement)
    .maybeSingle()

  if (error) {
    console.error('[utilisateurs] erreur bootstrap-status:', error.message)
    return res.status(500).json({ error: 'Erreur serveur' })
  }

  res.json({ needsBootstrap: !data, etablissementExiste: true, nom_etablissement: etablissement.nom })
})

// PUT /api/utilisateurs/:role  { nom_complet, login, mot_de_passe?, code_etablissement, nom_etablissement? }
// mot_de_passe optionnel : si vide, on ne change pas le mot de passe existant.
//
// Cas particulier "bootstrap" : si on crée le tout premier compte Fondateur
// d'un établissement qui n'a pas encore de Fondateur (établissement neuf ou
// existant sans compte), on autorise la requête SANS token (impossible de se
// connecter avant que ce compte existe) — et on crée/complète au passage la
// ligne `etablissements` correspondante à partir de code_etablissement +
// nom_etablissement. Dès qu'un Fondateur existe pour cet établissement,
// toute modification (y compris créer Proviseur/Économe) exige d'être
// connecté en tant que Fondateur DE CET ÉTABLISSEMENT.
router.put('/:role', async (req, res, next) => {
  const { role } = req.params
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide' })
  }

  const code_etablissement = String(req.body?.code_etablissement || '').trim()
  if (!code_etablissement) {
    return res.status(400).json({ error: 'Code établissement requis' })
  }

  const { data: existingFondateur } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('role', 'fondateur')
    .eq('code_etablissement', code_etablissement)
    .maybeSingle()

  const isBootstrap = role === 'fondateur' && !existingFondateur
  if (isBootstrap) return handleSave(req, res, code_etablissement, { bootstrap: true })

  // sinon, on exige une session Fondateur valide DE CET ÉTABLISSEMENT
  return requireAuth(req, res, () => {
    if (req.user.role !== 'fondateur') {
      return res.status(403).json({ error: 'Seul le Fondateur peut créer/modifier les comptes' })
    }
    if (req.user.code_etablissement !== code_etablissement) {
      return res.status(403).json({ error: "Tu ne peux gérer que les comptes de ton propre établissement" })
    }
    return handleSave(req, res, code_etablissement, { bootstrap: false })
  })
})

async function handleSave(req, res, code_etablissement, { bootstrap }) {
  const { role } = req.params
  const { nom_complet, login, mot_de_passe, nom_etablissement } = req.body || {}
  if (!nom_complet || !login) {
    return res.status(400).json({ error: 'Nom complet et login sont requis' })
  }
  if (bootstrap && !nom_etablissement) {
    return res.status(400).json({ error: "Nom de l'établissement requis pour la création du compte Fondateur" })
  }

  if (bootstrap) {
    // Crée ou complète la ligne `etablissements` pour ce code. Le code
    // établissement n'est jamais modifiable après coup une fois créé (ça
    // détacherait toutes les données déjà rattachées à ce code).
    const { data: etabExistant } = await supabase
      .from('etablissements')
      .select('id')
      .eq('code_etablissement', code_etablissement)
      .maybeSingle()

    if (!etabExistant) {
      // La colonne `id` de `etablissements` est de type texte, sans valeur
      // par défaut (héritage de l'ancien projet) : il faut toujours lui
      // fournir une valeur explicite. On utilise le code établissement
      // (garanti unique) plutôt que le nom, qui pourrait un jour se
      // répéter entre deux écoles différentes.
      const anneeInitiale = anneeParDefaut()
      const { error: errEtab } = await supabase
        .from('etablissements')
        .insert({ id: code_etablissement, code_etablissement, nom: nom_etablissement, annee: anneeInitiale })
      if (errEtab) {
        console.error('[utilisateurs] erreur création établissement:', errEtab.message)
        return res.status(500).json({ error: "Erreur lors de la création de l'établissement" })
      }
      await seedNouvelEtablissement(code_etablissement, anneeInitiale)
    }
  }

  const { data: existing } = await supabase
    .from('utilisateurs')
    .select('id')
    .eq('role', role)
    .eq('code_etablissement', code_etablissement)
    .maybeSingle()

  const payload = { role, nom_complet, login, code_etablissement }
  if (mot_de_passe) {
    payload.mot_de_passe = await bcrypt.hash(mot_de_passe, 10)
  } else if (!existing) {
    return res.status(400).json({ error: 'Mot de passe requis pour la création du compte' })
  }

  const { data, error } = existing
    ? await supabase
        .from('utilisateurs')
        .update(payload)
        .eq('id', existing.id)
        .select('id, role, login, nom_complet, code_etablissement')
        .single()
    : await supabase
        .from('utilisateurs')
        .insert(payload)
        .select('id, role, login, nom_complet, code_etablissement')
        .single()

  if (error) {
    console.error('[utilisateurs] erreur sauvegarde:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde du compte' })
  }

  res.json({ compte: data })
}

export default router
