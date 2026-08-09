import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// Upload en mémoire (le fichier ne touche jamais le disque).
// Fichier Excel seul : 50 Mo suffisent largement.
const uploadExcel = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } })
// Photos : le zip est désormais dézippé côté navigateur et envoyé par lots
// de fichiers individuels (voir ImportEleves.jsx) — 15 Mo/photo est large.
const uploadZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
})

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

// DELETE /api/eleves/:id
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut supprimer un élève' })
  }

  const { id } = req.params

  const { data: eleve, error: erreurRecherche } = await supabase
    .from('eleves')
    .select('id, photo_url')
    .eq('id', id)
    .maybeSingle()

  if (erreurRecherche) {
    console.error('[eleves] erreur recherche avant suppression:', erreurRecherche.message)
    return res.status(500).json({ error: "Erreur lors de la recherche de l'élève" })
  }

  if (!eleve) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  // Suppression de la photo dans le bucket (best-effort : on ne bloque pas
  // la suppression de l'élève si ça échoue, ex. photo déjà absente).
  if (eleve.photo_url) {
    const chemin = eleve.photo_url.split('/').pop()
    if (chemin) {
      const { error: erreurStorage } = await supabase.storage.from(PHOTOS_BUCKET).remove([chemin])
      if (erreurStorage) {
        console.warn('[eleves] échec suppression photo:', erreurStorage.message)
      }
    }
  }

  const { error } = await supabase.from('eleves').delete().eq('id', id)

  if (error) {
    console.error('[eleves] erreur suppression:', error.message)
    return res.status(500).json({ error: "Erreur lors de la suppression de l'élève" })
  }

  res.json({ ok: true })
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

// POST /api/eleves/import-photos  (multipart/form-data, champ "photos" = plusieurs fichiers)
// Le navigateur dézippe le .zip lui-même et envoie les photos par petits lots
// (voir ImportEleves.jsx) — cette route ne reçoit donc jamais le zip complet
// d'un coup, seulement quelques dizaines de photos par appel, léger pour le serveur.
// Chaque photo doit être nommée "MATRICULE.jpg" (ou .jpeg/.png/.webp).
router.post('/import-photos', requireAuth, uploadZip.array('photos', 200), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Aucune photo reçue (champ "photos" attendu)' })
  }

  let importees = 0
  const non_trouves = []
  const erreurs = []

  for (const fichier of req.files) {
    const nomFichier = fichier.originalname
    // Windows ajoute parfois un suffixe sur les doublons : "21421986V - Copie.jpg",
    // "21421986V (1).jpg" — on nettoie ça pour retrouver le vrai matricule.
    const matricule = nomFichier
      .replace(/\.[^.]+$/, '')
      .replace(/\s*-\s*copie(\s*\(\d+\))?\s*$/i, '')
      .replace(/\s*-\s*copy(\s*\(\d+\))?\s*$/i, '')
      .replace(/\s*\(\d+\)\s*$/, '')
      .trim()

    if (!matricule) {
      erreurs.push(`${nomFichier} : nom de fichier illisible`)
      continue
    }

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

      const ext = (nomFichier.split('.').pop() || 'jpg').toLowerCase()
      const chemin = `${existant.matricule}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(chemin, fichier.buffer, {
          upsert: true,
          contentType: fichier.mimetype || `image/${ext === 'jpg' ? 'jpeg' : ext}`
        })

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

  res.json({ importees, total_photos: req.files.length, non_trouves, erreurs })
})

export default router
