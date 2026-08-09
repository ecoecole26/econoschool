import { Router } from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// Upload en mémoire (le fichier ne touche jamais le disque).
// Fichier Excel seul : 50 Mo suffisent largement.
const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
// Zip de photos : peut être volumineux (plusieurs centaines de photos), on monte à 300 Mo.
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } })

const PHOTOS_BUCKET = 'photos-eleves'

// Colonnes attendues dans le fichier Excel du ministère (ordre du modèle téléchargeable).
const COLONNES_MODELE = [
  'Matricule', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Lieu de naissance',
  'Classe', 'Nom du parent', 'Téléphone 1', 'Téléphone 2',
  'Moyenne_t1', 'Moyenne_t2', 'Moyenne_t3', 'moyenne_generale',
  'decision_fin_annee', 'Qualité', 'rang_classe', 'Statut'
]
const EXEMPLE_MODELE = [
  '21421986V', 'ABDON', 'GRACE EMMANUELA SARAH', 'F', '21/06/2009', 'SAOUNDI',
  '6eme6', 'ADBON KARIM', '0759109875', '0759109875',
  7.69, 8.15, 8.54, 8.21,
  'Admis', 'NRedoublant', '', 'Affecte'
]

// GET /api/eleves?search=...&classe=...&statut=...
router.get('/', requireAuth, async (req, res) => {
  const { search = '', classe = '', statut = '' } = req.query

  let query = supabase
    .from('eleves')
    .select('*', { count: 'exact' })
    .order('nom', { ascending: true })
    .limit(200)

  if (search) {
    query = query.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
  }
  if (classe) {
    query = query.ilike('classe', `%${classe}%`)
  }
  if (statut) {
    query = query.eq('statut', statut)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[eleves] erreur Supabase:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des élèves' })
  }

  res.json({ eleves: data, total: count })
})

// PUT /api/eleves/:id  { nom, classe, statut, niveau, affecte, redoublant }
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { nom, classe, statut, niveau, affecte, redoublant } = req.body || {}

  if (!nom || !classe) {
    return res.status(400).json({ error: 'Nom et classe sont requis' })
  }

  const payload = { nom, classe, statut }
  if (niveau !== undefined) payload.niveau = niveau
  if (affecte !== undefined) payload.affecte = !!affecte
  if (redoublant !== undefined) payload.redoublant = !!redoublant

  const { data, error } = await supabase
    .from('eleves')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[eleves] erreur mise à jour:', error.message)
    return res.status(500).json({ error: "Erreur lors de la mise à jour de l'élève" })
  }

  res.json({ eleve: data })
})

// ---------- Import ZIP (CSV + photos) ----------

function normaliseCle(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .trim()
    .toLowerCase()
}

function normaliseValeur(val) {
  return normaliseCle(val).replace(/\s+/g, '')
}

// Colonne "Statut" du fichier ministériel : "Affecte" / "Affecté" / "NAffecte".
// Colonne "affecte" (fichier simplifié maison) : "Oui" / "Non".
function estAffecte(val) {
  const v = normaliseValeur(val)
  return v === 'affecte' || v === 'oui' || v === 'yes' || v === 'true' || v === '1'
}

// Colonne "Qualité" du fichier ministériel : "Redoublant" / "NRedoublant".
// Colonne "redoublant" (fichier simplifié maison) : "Oui" / "Non".
function estRedoublant(val) {
  const v = normaliseValeur(val)
  return v === 'redoublant' || v === 'oui' || v === 'yes' || v === 'true' || v === '1'
}

// GET /api/eleves/modele  → télécharge un fichier .xlsx vierge (avec un exemple)
// reprenant exactement les colonnes attendues (format export ministériel).
router.get('/modele', requireAuth, (req, res) => {
  const feuille = XLSX.utils.aoa_to_sheet([COLONNES_MODELE, EXEMPLE_MODELE])
  feuille['!cols'] = COLONNES_MODELE.map((c) => ({ wch: Math.max(12, c.length + 2) }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, feuille, 'Elèves')

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="modele_import_eleves.xlsx"')
  res.send(buffer)
})

// POST /api/eleves/import  (multipart/form-data, champ "file" = un .xlsx)
// Le fichier Excel du ministère, tel quel, avec au minimum les colonnes
// Matricule, Nom, Classe (+ Prénom, Qualité, Statut si présentes).
// N'importe pas les photos : voir POST /api/eleves/import-photos.
router.post('/import', requireAuth, uploadExcel.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu (champ "file" attendu)' })
  }

  let rows
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' })
    const feuille = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json(feuille, { defval: '' })
    // Normalise les clés (en-têtes) : minuscules, sans accents.
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

  let importes = 0
  let mis_a_jour = 0
  const erreurs = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const ligne = i + 2 // +2 : ligne 1 = en-têtes, index 0-based

    const matricule = String(row.matricule ?? '').trim()
    const nomSeul = String(row.nom ?? '').trim()
    const prenom = String(row.prenom ?? '').trim()
    const nom = prenom ? `${nomSeul} ${prenom}`.trim() : nomSeul
    const classe = String(row.classe ?? '').trim()

    if (!matricule || !nom || !classe) {
      erreurs.push(`Ligne ${ligne} : matricule, nom et classe sont obligatoires`)
      continue
    }

    const niveau = String(row.niveau || '').trim() || classe.replace(/\d+$/, '').trim()
    // "statut" = colonne ministérielle "Statut" (Affecte/NAffecte) ; "affecte" = fichier simplifié.
    const affecte = estAffecte(row.statut || row.affecte)
    // "qualite" = colonne ministérielle "Qualité" (Redoublant/NRedoublant) ; "redoublant" = fichier simplifié.
    const redoublant = estRedoublant(row.qualite || row.redoublant)

    const payloadCommun = { matricule, nom, classe, niveau, affecte, redoublant }

    try {
      const { data: existant } = await supabase
        .from('eleves')
        .select('id')
        .eq('matricule', matricule)
        .maybeSingle()

      if (existant) {
        // Mise à jour : on ne touche pas au champ "statut" (Actif/Inactif/Transféré/Exclu),
        // qui n'a rien à voir avec la colonne "Statut" (affectation) du fichier ministériel.
        const { error } = await supabase.from('eleves').update(payloadCommun).eq('id', existant.id)
        if (error) throw error
        mis_a_jour++
      } else {
        const { error } = await supabase
          .from('eleves')
          .insert({ ...payloadCommun, statut: 'Actif' })
        if (error) throw error
        importes++
      }
    } catch (err) {
      erreurs.push(`Ligne ${ligne} (${matricule}) : ${err.message}`)
    }
  }

  res.json({ importes, mis_a_jour, total_lignes: rows.length, erreurs })
})

// POST /api/eleves/import-photos  (multipart/form-data, champ "file" = un .zip)
// Le zip doit contenir des photos dont le nom de fichier (sans l'extension)
// correspond exactement au matricule de l'élève (ex : 21421986V.jpg).
// Chaque photo est associée automatiquement à l'élève déjà existant.
router.post('/import-photos', requireAuth, uploadZip.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu (champ "file" attendu)' })
  }

  let zip
  try {
    zip = new AdmZip(req.file.buffer)
  } catch {
    return res.status(400).json({ error: "Le fichier envoyé n'est pas un zip valide" })
  }

  const entries = zip.getEntries().filter(
    (e) => !e.isDirectory && /\.(jpe?g|png|webp)$/i.test(e.entryName)
  )

  if (entries.length === 0) {
    return res.status(400).json({ error: 'Aucune photo (jpg/jpeg/png/webp) trouvée dans le zip' })
  }

  let importees = 0
  const non_trouves = []
  const erreurs = []

  for (const entry of entries) {
    const nomFichier = entry.entryName.split('/').pop()
    // Le nom du fichier photo doit correspondre au matricule (comparaison
    // insensible à la casse, car les photos scannées ont parfois une casse différente).
    const matricule = nomFichier.replace(/\.[^.]+$/, '').trim()

    try {
      const { data: existant, error: erreurRecherche } = await supabase
        .from('eleves')
        .select('id, matricule')
        .ilike('matricule', matricule)
        .maybeSingle()

      if (erreurRecherche) throw erreurRecherche

      if (!existant) {
        non_trouves.push(`${nomFichier} : aucun élève avec le matricule "${matricule}"`)
        continue
      }

      const buffer = entry.getData()
      const ext = nomFichier.split('.').pop().toLowerCase()
      const chemin = `${existant.matricule}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(chemin, buffer, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })

      if (uploadError) {
        erreurs.push(`${nomFichier} : échec upload — ${uploadError.message}`)
        continue
      }

      const photo_url = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(chemin).data.publicUrl

      const { error: majError } = await supabase
        .from('eleves')
        .update({ photo_url })
        .eq('id', existant.id)

      if (majError) throw majError

      importees++
    } catch (err) {
      erreurs.push(`${nomFichier} : ${err.message}`)
    }
  }

  res.json({ importees, total_photos: entries.length, non_trouves, erreurs })
})

export default router
