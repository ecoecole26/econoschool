import { Router } from 'express'
import multer from 'multer'
import AdmZip from 'adm-zip'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// Upload en mémoire (le zip ne touche jamais le disque), limité à 50 Mo.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })

const PHOTOS_BUCKET = 'photos-eleves'

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

// POST /api/eleves/import  (multipart/form-data, champ "file" = un .zip)
// Le zip doit contenir : un fichier .xlsx avec au minimum les colonnes
// Matricule, Nom, Classe (+ Prénom, Qualité, Statut si présentes — format
// export ministériel reconnu directement) + les photos référencées par la
// colonne "photo" (nom de fichier exact, ex: 21421986V.jpg), optionnelle.
router.post('/import', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu (champ "file" attendu)' })
  }

  let zip
  try {
    zip = new AdmZip(req.file.buffer)
  } catch {
    return res.status(400).json({ error: 'Le fichier envoyé n\'est pas un zip valide' })
  }

  const entries = zip.getEntries()
  const excelEntry = entries.find((e) => !e.isDirectory && /\.xlsx?$/i.test(e.entryName))

  if (!excelEntry) {
    return res.status(400).json({ error: 'Aucun fichier .xlsx trouvé dans le zip' })
  }

  let rows
  try {
    const workbook = XLSX.read(excelEntry.getData(), { type: 'buffer' })
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

  // Index des photos présentes dans le zip, par nom de fichier (sans dossier).
  const photosParNom = new Map()
  for (const e of entries) {
    if (!e.isDirectory && /\.(jpe?g|png|webp)$/i.test(e.entryName)) {
      const nomFichier = e.entryName.split('/').pop()
      photosParNom.set(nomFichier, e)
    }
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

    let photo_url
    const nomPhoto = (row.photo || '').trim()
    if (nomPhoto) {
      const entryPhoto = photosParNom.get(nomPhoto)
      if (!entryPhoto) {
        erreurs.push(`Ligne ${ligne} (${matricule}) : photo "${nomPhoto}" introuvable dans le zip`)
      } else {
        try {
          const buffer = entryPhoto.getData()
          const ext = nomPhoto.split('.').pop().toLowerCase()
          const chemin = `${matricule}.${ext}`
          const { error: uploadError } = await supabase.storage
            .from(PHOTOS_BUCKET)
            .upload(chemin, buffer, { upsert: true, contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` })

          if (uploadError) {
            erreurs.push(`Ligne ${ligne} (${matricule}) : échec upload photo — ${uploadError.message}`)
          } else {
            photo_url = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(chemin).data.publicUrl
          }
        } catch (err) {
          erreurs.push(`Ligne ${ligne} (${matricule}) : erreur photo — ${err.message}`)
        }
      }
    }

    const payloadCommun = { matricule, nom, classe, niveau, affecte, redoublant }
    if (photo_url) payloadCommun.photo_url = photo_url

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

export default router
