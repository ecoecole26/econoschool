import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

const router = Router()

// GET /api/credits-reports
//
// Liste des élèves qui ont une dette antérieure NON SOLDÉE (reliquat d'une
// année précédente), pour MON établissement. Groupée par niveau côté
// frontend — on trie déjà par niveau puis nom ici.
//
// Rappel du modèle : UNE seule ligne par élève par établissement (peu
// importe l'année d'origine de la dette) — voir migration 017/018. Le
// FIFO de remboursement (paiements.js) décrémente `solde_reporte` au fil
// des versements ; on ne montre ici que les dettes encore > 0.
router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('credits_reports')
    .select('*')
    .eq('etablissement', req.user.code_etablissement)
    .gt('solde_reporte', 0)
    .order('niveau', { ascending: true })
    .order('nom', { ascending: true })

  if (error) {
    console.error('[credits-reports] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors du chargement des élèves à crédit' })
  }

  const total = (data || []).reduce((s, l) => s + (Number(l.solde_reporte) || 0), 0)
  res.json({ lignes: data || [], total_eleves: (data || []).length, total_montant: total })
})

// POST /api/credits-reports/import  { lignes: [{ matricule, nom, niveau, montant, annee }] }
//
// Import en masse (copié-collé depuis Excel/DSPS) : une ligne = un élève
// avec sa dette. `annee` est l'année scolaire D'ORIGINE de la dette
// (informative uniquement, ex: "2025-2026") — optionnelle, par défaut
// l'année précédant l'année en cours.
//
// Chaque import REMPLACE le solde connu pour ce matricule (upsert sur
// matricule+établissement) — cohérent avec le fait que ce tableau reflète
// l'état actuel de la dette, pas un cumul d'imports successifs.
router.post('/import', requireAuth, async (req, res) => {
  const lignes = Array.isArray(req.body?.lignes) ? req.body.lignes : []
  if (lignes.length === 0) {
    return res.status(400).json({ error: 'Aucune ligne à importer' })
  }

  let anneeParDefaut
  try {
    anneeParDefaut = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const erreurs = []
  const payload = []

  lignes.forEach((l, i) => {
    const matricule = String(l.matricule || '').trim()
    const nom = String(l.nom || '').trim()
    const niveau = String(l.niveau || '').trim()
    const montant = Number(l.montant)

    if (!matricule || !nom || !montant || montant <= 0) {
      erreurs.push(`Ligne ${i + 1} ignorée : matricule, nom et montant (> 0) sont obligatoires`)
      return
    }

    payload.push({
      matricule,
      nom,
      niveau: niveau || null,
      solde_reporte: montant,
      annee: (l.annee && String(l.annee).trim()) || anneeParDefaut || null,
      etablissement: req.user.code_etablissement
    })
  })

  if (payload.length === 0) {
    return res.status(400).json({ error: 'Aucune ligne valide à importer', erreurs })
  }

  const { data, error } = await supabase
    .from('credits_reports')
    .upsert(payload, { onConflict: 'etablissement,matricule' })
    .select()

  if (error) {
    console.error('[credits-reports] erreur import:', error.message)
    return res.status(500).json({ error: "Erreur lors de l'import des élèves à crédit" })
  }

  res.json({ importes: data?.length || 0, erreurs })
})

// DELETE /api/credits-reports/:id — retire une ligne (ex: dette réglée
// autrement, ou erreur de saisie à l'import).
router.delete('/:id', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('credits_reports')
    .delete()
    .eq('id', req.params.id)
    .eq('etablissement', req.user.code_etablissement)

  if (error) {
    console.error('[credits-reports] erreur suppression:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la suppression' })
  }
  res.json({ ok: true })
})

export default router
