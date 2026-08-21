import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

const router = Router()

const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

// Enlève les accents/majuscules/espaces superflus d'un en-tête de colonne
// Excel, pour matcher "Matricule", "matricule ", "MATRICULE" etc. de la
// même façon que l'import élèves (backend/src/routes/eleves.js).
function normaliseCle(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

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

// POST /api/credits-reports/import-excel  (multipart, champ "file")
//
// Même logique que POST /import ci-dessus, mais la source des lignes est
// un fichier Excel (colonnes Matricule, Nom, Niveau, Montant, dans cet
// ordre ou pas — la casse et les accents n'ont pas d'importance) plutôt
// qu'un copié-collé JSON. Réutilisée pour proposer une méthode d'import
// plus simple ("Choisir un fichier" + "Importer") aux économes peu à
// l'aise avec le copier-coller depuis Excel.
router.post('/import-excel', requireAuth, uploadExcel.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu (champ "file" attendu)' })
  }

  let rows
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const feuille = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(feuille, { defval: '' })
    rows = rawRows.map((row) => {
      const clean = {}
      for (const [k, v] of Object.entries(row)) {
        clean[normaliseCle(k)] = typeof v === 'string' ? v.trim() : v
      }
      return clean
    })
  } catch (err) {
    return res.status(400).json({ error: `Fichier Excel illisible : ${err.message}` })
  }

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Le fichier ne contient aucune ligne' })
  }

  let anneeParDefaut
  try {
    anneeParDefaut = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const erreurs = []
  const payload = []

  rows.forEach((row, i) => {
    const ligne = i + 2 // +2 : ligne 1 = en-têtes, tableur commence à 1
    const matricule = String(row.matricule ?? '').trim()
    const nom = String(row.nom ?? '').trim()
    const niveau = String(row.niveau ?? '').trim()
    const montant = Number(row.montant)

    if (!matricule || !nom || !montant || montant <= 0) {
      erreurs.push(`Ligne ${ligne} ignorée : matricule, nom et montant (> 0) sont obligatoires`)
      return
    }

    const annee = String(row.annee ?? '').trim()

    payload.push({
      matricule,
      nom,
      niveau: niveau || null,
      solde_reporte: montant,
      annee: annee || anneeParDefaut || null,
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
    console.error('[credits-reports] erreur import Excel:', error.message)
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
