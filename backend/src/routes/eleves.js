import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { calculerFrais } from '../lib/frais.js'
import { fetchTout } from '../lib/supabasePagination.js'

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

// GET /api/eleves?search=...&classe=...&statut=...&page=1&pageSize=60
router.get('/', requireAuth, async (req, res) => {
  const { search = '', classe = '', statut = '' } = req.query
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 60))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  function appliquerFiltres(q) {
    if (search) q = q.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
    if (classe) q = q.ilike('classe', `%${classe}%`)
    if (statut) q = q.eq('statut', statut)
    return q
  }

  const requetePage = appliquerFiltres(
    supabase.from('eleves').select('*', { count: 'exact' }).order('nom', { ascending: true })
  ).range(from, to)

  const requeteActifs = appliquerFiltres(
    supabase.from('eleves').select('id', { count: 'exact', head: true }).eq('statut', 'Actif')
  )

  const [{ data, error, count }, { count: totalActifs, error: errActifs }] = await Promise.all([
    requetePage,
    requeteActifs
  ])

  if (error) {
    console.error('[eleves] erreur Supabase:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des élèves' })
  }
  if (errActifs) {
    console.error('[eleves] erreur comptage actifs:', errActifs.message)
  }

  res.json({
    eleves: data,
    total: count,
    total_actifs: totalActifs ?? null,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 1
  })
})

// Calcule le bilan (total dû/payé/reste + statut) pour chaque élève
// correspondant aux filtres donnés. Partagé par GET /bilan (JSON, pour la
// page Retards) et GET /bilan/export (fichier Excel).
async function calculerBilanEleves({ search = '', classe = '', niveau = '', statutPaiementFiltre = '' }) {
  const eleves = await fetchTout((from, to) => {
    let q = supabase.from('eleves').select('*').order('nom', { ascending: true })
    if (search) q = q.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
    if (classe) q = q.ilike('classe', `%${classe}%`)
    if (niveau) q = q.eq('niveau', niveau)
    return q.range(from, to)
  })

  const [tarifs, reductions, paiements] = await Promise.all([
    fetchTout((from, to) => supabase.from('tarifs').select('*').range(from, to)),
    fetchTout((from, to) =>
      supabase.from('reductions').select('eleve_id, pourcentage').eq('statut', 'active').range(from, to)
    ),
    fetchTout((from, to) => supabase.from('paiements').select('eleve_id, montant').range(from, to))
  ])

  const tarifParNiveau = new Map((tarifs || []).map((t) => [t.niveau, t]))
  const reductionParEleve = new Map((reductions || []).map((r) => [r.eleve_id, r.pourcentage]))
  const totalPayeParEleve = new Map()
  for (const p of paiements || []) {
    totalPayeParEleve.set(p.eleve_id, (totalPayeParEleve.get(p.eleve_id) || 0) + Number(p.montant))
  }

  let lignes = (eleves || []).map((eleve) => {
    const tarif = tarifParNiveau.get(eleve.niveau) || {}
    const reductionPourcentage = reductionParEleve.get(eleve.id) || 0
    const frais = calculerFrais(tarif, eleve, reductionPourcentage)
    const totalPaye = totalPayeParEleve.get(eleve.id) || 0
    const reste_a_payer = Math.max(frais.total_du - totalPaye, 0)
    const statut_paiement =
      reste_a_payer <= 0 ? 'solde' : totalPaye > 0 ? 'partiel' : 'non_paye'

    return {
      id: eleve.id,
      matricule: eleve.matricule,
      nom: eleve.nom,
      niveau: eleve.niveau,
      classe: eleve.classe,
      photo_url: eleve.photo_url,
      affecte: eleve.affecte,
      statut: eleve.statut,
      total_du: frais.total_du,
      total_paye: totalPaye,
      reste_a_payer,
      statut_paiement
    }
  })

  if (statutPaiementFiltre === 'solde') {
    lignes = lignes.filter((l) => l.statut_paiement === 'solde')
  } else if (statutPaiementFiltre === 'retard') {
    lignes = lignes.filter((l) => l.statut_paiement !== 'solde')
  }

  const resume = {
    total_eleves: lignes.length,
    total_actifs: lignes.filter((l) => (l.statut || '').toLowerCase() === 'actif').length,
    affectes: lignes.filter((l) => l.affecte).length,
    solde: lignes.filter((l) => l.statut_paiement === 'solde').length,
    en_retard: lignes.filter((l) => l.statut_paiement !== 'solde').length,
    total_du: lignes.reduce((s, l) => s + l.total_du, 0),
    total_paye: lignes.reduce((s, l) => s + l.total_paye, 0),
    total_reste: lignes.reduce((s, l) => s + l.reste_a_payer, 0)
  }

  return { lignes, resume }
}

// GET /api/eleves/bilan?search=...&classe=...&niveau=...&statut_paiement=solde|retard
// Pour CHAQUE élève (filtré éventuellement) : total dû, total payé, reste à
// payer et statut ("solde" / "partiel" / "non_paye"), calculés avec la même
// logique que la fiche élève de la page Paiements (calculerFrais + réduction
// active + somme des paiements). Sert la page "Retards".
router.get('/bilan', requireAuth, async (req, res) => {
  const {
    search = '',
    classe = '',
    niveau = '',
    statut_paiement: statutPaiementFiltre = ''
  } = req.query

  try {
    const { lignes, resume } = await calculerBilanEleves({ search, classe, niveau, statutPaiementFiltre })
    res.json({ lignes, resume })
  } catch (err) {
    console.error('[eleves] erreur bilan:', err.message)
    res.status(500).json({ error: 'Erreur lors du calcul du bilan' })
  }
})

// GET /api/eleves/bilan/export?search=...&classe=...&niveau=...&statut_paiement=solde|retard
// Même filtre que /bilan, mais renvoie un fichier .xlsx prêt à télécharger
// (une ligne par élève : matricule, nom, classe, total dû/payé/reste, statut).
// Utile pour relancer les parents en retard de paiement.
router.get('/bilan/export', requireAuth, async (req, res) => {
  const {
    search = '',
    classe = '',
    niveau = '',
    statut_paiement: statutPaiementFiltre = ''
  } = req.query

  let lignes
  try {
    ;({ lignes } = await calculerBilanEleves({ search, classe, niveau, statutPaiementFiltre }))
  } catch (err) {
    console.error('[eleves] erreur export bilan:', err.message)
    return res.status(500).json({ error: 'Erreur lors du calcul du bilan' })
  }

  const LABEL_STATUT = { solde: 'Soldé', partiel: 'Partiel', non_paye: 'Non payé' }
  const entetes = ['Matricule', 'Nom', 'Classe', 'Total dû (FCFA)', 'Total payé (FCFA)', 'Reste à payer (FCFA)', 'Statut']
  const donnees = lignes.map((l) => [
    l.matricule,
    l.nom,
    l.classe || '',
    l.total_du,
    l.total_paye,
    l.reste_a_payer,
    LABEL_STATUT[l.statut_paiement] || l.statut_paiement
  ])

  const feuille = XLSX.utils.aoa_to_sheet([entetes, ...donnees])
  feuille['!cols'] = [
    { wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 10 }
  ]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, feuille, 'Retards')

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="retards_paiements.xlsx"')
  res.send(buffer)
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
