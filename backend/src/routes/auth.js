import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { supabase } from '../config/supabase.js'

const router = Router()
const ROLES = ['fondateur', 'proviseur', 'econome']

// Authentification réelle : on va chercher le compte dans la table `utilisateurs`
// (rempli/modifié depuis la page "Création de compte"), plus de mot de passe
// figé dans .env.
router.post('/login', async (req, res) => {
  try {
    const { role, password } = req.body || {}

    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: 'Rôle invalide' })
    }
    if (!password) {
      return res.status(400).json({ error: 'Mot de passe requis' })
    }

    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('[auth] SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant côté serveur')
      return res.status(500).json({ error: 'Configuration serveur incomplète (Supabase)' })
    }
    if (!process.env.JWT_SECRET) {
      console.error('[auth] JWT_SECRET manquant côté serveur')
      return res.status(500).json({ error: 'Configuration serveur incomplète (JWT_SECRET)' })
    }

    const { data: user, error } = await supabase
      .from('utilisateurs')
      .select('id, etablissement, login, mot_de_passe, role, nom_complet')
      .eq('role', role)
      .maybeSingle()

    if (error) {
      console.error('[auth] erreur Supabase:', error.message)
      return res.status(500).json({ error: 'Erreur serveur (Supabase)' })
    }

    if (!user) {
      return res.status(401).json({ error: 'Aucun compte configuré pour ce rôle — passe par Création de compte.' })
    }

    const valid = await bcrypt.compare(password, user.mot_de_passe || '')
    if (!valid) {
      return res.status(401).json({ error: 'Mot de passe incorrect' })
    }

    const token = jwt.sign(
      { role: user.role, etablissement: user.etablissement, nom: user.nom_complet },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    )

    res.json({ token, role: user.role, nom_complet: user.nom_complet })
  } catch (err) {
    console.error('[auth] exception non gérée sur /login:', err)
    res.status(500).json({ error: 'Erreur serveur inattendue' })
  }
})

export default router