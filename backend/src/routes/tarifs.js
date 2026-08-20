import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'
import { seedNouvelEtablissement } from '../lib/seedEtablissement.js'

const router = Router()

// GET /api/tarifs?annee= -> tous les niveaux de MON établissement pour
// l'année demandée (par défaut l'année en cours), triés.
//
// Auto-réparation : si aucune ligne n'existe encore pour cette année (ex:
// juste après un "démarrer une nouvelle année", ou après une correction de
// données), on recrée les 7 niveaux standards à 0 FCFA plutôt que de
// renvoyer une liste vide bloquante — le Fondateur n'a jamais à dépendre
// d'une intervention technique pour configurer ses tarifs.
router.get('/', requireAuth, async (req, res) => {
  let annee
  try {
    annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) return res.json({ tarifs: [], annee: null })

  let { data, error } = await supabase
    .from('tarifs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .not('niveau', 'is', null)
    .order('ordre', { ascending: true })

  if (error) {
    console.error('[tarifs] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des tarifs' })
  }

  if (!data || data.length === 0) {
    await seedNouvelEtablissement(req.user.code_etablissement, annee)
    ;({ data, error } = await supabase
      .from('tarifs')
      .select('*')
      .eq('code_etablissement', req.user.code_etablissement)
      .eq('annee_scolaire', annee)
      .not('niveau', 'is', null)
      .order('ordre', { ascending: true }))

    if (error) {
      console.error('[tarifs] erreur relecture après auto-réparation:', error.message)
      return res.status(500).json({ error: 'Erreur lors de la lecture des tarifs' })
    }
  }

  res.json({ tarifs: data, annee })
})

// PUT /api/tarifs  { tarifs: [{ id, scolarite_annuelle, frais_inscription, frais_annexes, frais_examen }, ...] }
// Sauvegarde groupée — toujours sur l'ANNÉE EN COURS (une année passée est
// en lecture seule, aucune requête d'écriture n'y est jamais envoyée par le
// frontend, mais on filtre aussi ici par sécurité).
router.put('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier les tarifs' })
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

  const { tarifs } = req.body || {}
  if (!Array.isArray(tarifs) || tarifs.length === 0) {
    return res.status(400).json({ error: 'Liste de tarifs invalide' })
  }

  const results = []
  for (const t of tarifs) {
    const { id, scolarite_annuelle, frais_inscription, frais_annexes, frais_examen } = t
    if (!id) continue

    const { data, error } = await supabase
      .from('tarifs')
      .update({
        scolarite_annuelle: Number(scolarite_annuelle) || 0,
        frais_inscription: Number(frais_inscription) || 0,
        frais_annexes: Number(frais_annexes) || 0,
        frais_examen: frais_examen === '' || frais_examen == null ? null : Number(frais_examen),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('code_etablissement', req.user.code_etablissement)
      .eq('annee_scolaire', annee)
      .select()
      .single()

    if (error) {
      console.error('[tarifs] erreur sauvegarde niveau', t.niveau, error.message)
      return res.status(500).json({ error: `Erreur sur le niveau ${t.niveau || id}` })
    }
    results.push(data)
  }

  res.json({ tarifs: results })
})

export default router
