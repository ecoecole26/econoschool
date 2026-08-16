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

// Colonnes attendues dans le fichier Excel à importer. "Code établissement"
// et "Nom établissement" sont désormais en tête : c'est le garde-fou qui
// empêche d'importer par erreur le fichier d'un AUTRE établissement dans le
// tien (voir logique de validation dans POST /import). Le reste reprend
// l'ordre du modèle ministériel téléchargeable.
const COLONNES_MODELE = [
  'Code établissement', 'Nom établissement',
  'Matricule', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Lieu de naissance',
  'Classe', 'Nom du parent', 'Téléphone 1', 'Téléphone 2',
  'Moyenne_t1', 'Moyenne_t2', 'Moyenne_t3', 'moyenne_generale',
  'decision_fin_annee', 'Qualité', 'rang_classe', 'Statut'
]
const EXEMPLE_MODELE = [
  '017242', 'COLLEGE EXEMPLE',
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
    q = q.eq('code_etablissement', req.user.code_etablissement)
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
// correspondant aux filtres donnés, POUR L'ÉTABLISSEMENT DONNÉ. Partagé par
// GET /bilan (JSON, pour la page Retards) et GET /bilan/export (fichier Excel).
// Renvoie la date butoir applicable à un niveau donné : celle spécifique au
// niveau si elle existe, sinon la date globale, sinon null (pas de notion de
// date — on retombe alors sur l'ancien comportement "non soldé = en retard").
function dateButoirPourNiveau(niveau, { global, parNiveau }) {
  return (niveau && parNiveau[niveau]) || global || null
}

export async function calculerBilanEleves({
  code_etablissement,
  search = '',
  classe = '',
  niveau = '',
  statutPaiementFiltre = ''
}) {
  const eleves = await fetchTout((from, to) => {
    let q = supabase
      .from('eleves')
      .select('*')
      .eq('code_etablissement', code_etablissement)
      .order('nom', { ascending: true })
    if (search) q = q.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
    if (classe) q = q.ilike('classe', `%${classe}%`)
    if (niveau) q = q.eq('niveau', niveau)
    return q.range(from, to)
  })

  const [tarifs, reductions, paiements, datesButoirBrutes] = await Promise.all([
    fetchTout((from, to) =>
      supabase.from('tarifs').select('*').eq('code_etablissement', code_etablissement).range(from, to)
    ),
    fetchTout((from, to) =>
      supabase
        .from('reductions')
        .select('eleve_id, pourcentage')
        .eq('code_etablissement', code_etablissement)
        .eq('statut', 'active')
        .range(from, to)
    ),
    fetchTout((from, to) =>
      supabase
        .from('paiements')
        .select('eleve_id, montant')
        .eq('code_etablissement', code_etablissement)
        .range(from, to)
    ),
    fetchTout((from, to) =>
      supabase
        .from('dates_butoir')
        .select('niveau, date_butoir')
        .eq('code_etablissement', code_etablissement)
        .range(from, to)
    )
  ])

  const tarifParNiveau = new Map((tarifs || []).map((t) => [t.niveau, t]))
  const reductionParEleve = new Map((reductions || []).map((r) => [r.eleve_id, r.pourcentage]))
  const totalPayeParEleve = new Map()
  for (const p of paiements || []) {
    totalPayeParEleve.set(p.eleve_id, (totalPayeParEleve.get(p.eleve_id) || 0) + Number(p.montant))
  }

  const datesButoir = { global: null, parNiveau: {} }
  for (const d of datesButoirBrutes || []) {
    if (d.niveau) datesButoir.parNiveau[d.niveau] = d.date_butoir
    else datesButoir.global = d.date_butoir
  }
  const aujourdhui = new Date().toISOString().slice(0, 10)

  let lignes = (eleves || []).map((eleve) => {
    const tarif = tarifParNiveau.get(eleve.niveau) || {}
    const reductionPourcentage = reductionParEleve.get(eleve.id) || 0
    const frais = calculerFrais(tarif, eleve, reductionPourcentage)
    const totalPaye = totalPayeParEleve.get(eleve.id) || 0
    const reste_a_payer = Math.max(frais.total_du - totalPaye, 0)
    const statut_paiement =
      reste_a_payer <= 0 ? 'solde' : totalPaye > 0 ? 'partiel' : 'non_paye'

    const date_butoir = dateButoirPourNiveau(eleve.niveau, datesButoir)
    // Si une date butoir s'applique (niveau ou globale) : en retard = pas
    // soldé ET date butoir dépassée. Sinon (aucune date configurée) : on
    // garde l'ancien comportement, en retard = simplement pas soldé.
    const en_retard = date_butoir
      ? reste_a_payer > 0 && aujourdhui > date_butoir
      : reste_a_payer > 0

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
      statut_paiement,
      date_butoir,
      en_retard
    }
  })

  if (statutPaiementFiltre === 'solde') {
    lignes = lignes.filter((l) => l.statut_paiement === 'solde')
  } else if (statutPaiementFiltre === 'retard') {
    lignes = lignes.filter((l) => l.en_retard)
  }

  const resume = {
    total_eleves: lignes.length,
    total_actifs: lignes.filter((l) => (l.statut || '').toLowerCase() === 'actif').length,
    affectes: lignes.filter((l) => l.affecte).length,
    solde: lignes.filter((l) => l.statut_paiement === 'solde').length,
    en_retard: lignes.filter((l) => l.en_retard).length,
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
    const { lignes, resume } = await calculerBilanEleves({
      code_etablissement: req.user.code_etablissement,
      search,
      classe,
      niveau,
      statutPaiementFiltre
    })
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
    ;({ lignes } = await calculerBilanEleves({
      code_etablissement: req.user.code_etablissement,
      search,
      classe,
      niveau,
      statutPaiementFiltre
    }))
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
    .eq('code_etablissement', req.user.code_etablissement)
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
    .eq('code_etablissement', req.user.code_etablissement)
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

  const { error } = await supabase
    .from('eleves')
    .delete()
    .eq('id', id)
    .eq('code_etablissement', req.user.code_etablissement)

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
// reprenant exactement les colonnes attendues (format export ministériel +
// code/nom établissement). La ligne d'exemple reprend le code et le nom du
// PROPRE établissement de l'utilisateur connecté quand ils sont déjà
// configurés (page "Identification de l'établissement"), pour qu'il n'y ait
// aucune ambiguïté sur ce qu'il faut mettre dans ces deux colonnes.
router.get('/modele', requireAuth, async (req, res) => {
  const { data: etab } = await supabase
    .from('etablissements')
    .select('code_etablissement, nom')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  const exemple = [...EXEMPLE_MODELE]
  exemple[0] = etab?.code_etablissement || req.user.code_etablissement || ''
  exemple[1] = etab?.nom || ''

  const feuille = XLSX.utils.aoa_to_sheet([COLONNES_MODELE, exemple])
  feuille['!cols'] = COLONNES_MODELE.map((c) => ({ wch: Math.max(12, c.length + 2) }))

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, feuille, 'Elèves')

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="modele_import_eleves.xlsx"')
  res.send(buffer)
})

// POST /api/eleves/import  (multipart/form-data, champ "file" = un .xlsx)
// Le fichier Excel (modèle maison ou export ministériel), avec au minimum
// les colonnes Matricule, Nom, Classe (+ Prénom, Qualité, Statut si présentes).
// N'importe pas les photos : voir POST /api/eleves/import-photos.
//
// GARDE-FOU MULTI-ÉTABLISSEMENT : si le fichier contient une colonne
// "Code établissement" (ou la colonne ministérielle "CodeEts"), chaque ligne
// est comparée au code de l'établissement connecté :
//   - si la GRANDE MAJORITÉ des lignes portent un code différent, le fichier
//     vient manifestement d'un autre établissement → import refusé en bloc ;
//   - si seulement une poignée de lignes isolées diffèrent (erreur de frappe
//     ponctuelle dans le fichier source), ces lignes-là sont simplement
//     ignorées (comptées en erreur) plutôt que de bloquer tout le reste.
// Si la colonne est absente (anciens fichiers simplifiés), toutes les lignes
// sont rattachées à l'établissement connecté, comme avant.
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

  const monCode = req.user.code_etablissement

  // --- Garde-fou établissement : détecte un fichier importé par erreur ---
  const codesLignes = rows.map(
    (row) => String(row['code etablissement'] || row.codeets || row['code_etablissement'] || '').trim()
  )
  const lignesAvecCode = codesLignes.filter(Boolean)
  if (lignesAvecCode.length > 0) {
    const correspondantes = lignesAvecCode.filter((c) => c === monCode).length
    const ratioCorrespondant = correspondantes / lignesAvecCode.length
    // Moins de la moitié des lignes correspondent à mon établissement :
    // ce fichier vient très probablement d'une autre école, on bloque tout.
    if (ratioCorrespondant < 0.5) {
      const autreCode = lignesAvecCode.find((c) => c !== monCode)
      return res.status(400).json({
        error: `Ce fichier semble provenir d'un autre établissement (code "${autreCode}" détecté, attendu "${monCode}"). Import annulé — vérifie le fichier avant de réessayer.`
      })
    }
  }

  let importes = 0
  let mis_a_jour = 0
  const erreurs = []

  // On prépare toutes les lignes valides d'abord (validation uniquement,
  // pas d'appel réseau ici), puis on les envoie à Supabase par LOTS
  // (upsert groupé) plutôt qu'une ligne à la fois. Avec 2000+ élèves,
  // faire un aller-retour réseau par ligne (comme avant) prend plusieurs
  // minutes et dépasse largement le temps limite d'une fonction Vercel —
  // d'où le "Failed to fetch" silencieux. Un upsert groupé fait la même
  // chose en quelques secondes.
  const lignesValides = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const ligne = i + 2 // +2 : ligne 1 = en-têtes, index 0-based

    // Ligne isolée dont le code établissement ne correspond pas au mien
    // (erreur de frappe ponctuelle dans le fichier source) : on l'ignore
    // plutôt que de l'importer chez le mauvais établissement.
    const codeLigne = codesLignes[i]
    if (codeLigne && codeLigne !== monCode) {
      erreurs.push(`Ligne ${ligne} : code établissement "${codeLigne}" différent du tien ("${monCode}") — ligne ignorée`)
      continue
    }

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
    // Nom et téléphone du parent (colonnes ministérielles "Nom du parent" /
    // "Téléphone 1" — utilisés pour le SMS de confirmation de paiement).
    // Plusieurs libellés possibles selon la casse/variante du fichier fourni.
    const parent = String(row['nom du parent'] || row.parent || row['nom parent'] || '').trim()
    // Piège Excel : une colonne "téléphone" lue comme un NOMBRE perd son 0
    // de tête (0574644209 devient 574644209, 9 chiffres au lieu de 10).
    // On restaure ce 0 ici, à l'import, pour que le numéro soit correct
    // dès l'enregistrement en base (le même filet existe aussi côté envoi
    // SMS pour les numéros déjà importés avant ce correctif).
    let tel_parent = String(
      row['telephone 1'] || row['telephone1'] || row.tel_parent || row.telephone || ''
    ).trim()
    if (/^\d{9}$/.test(tel_parent)) {
      tel_parent = `0${tel_parent}`
    }

    const payloadCommun = { matricule, nom, classe, niveau, affecte, redoublant, code_etablissement: monCode }
    // On ne renseigne parent/tel_parent que s'ils sont présents dans le
    // fichier, pour ne jamais écraser une valeur déjà en base (ex: un
    // ré-import fait avec un fichier simplifié qui ne contient pas ces
    // colonnes) par une valeur vide.
    if (parent) payloadCommun.parent = parent
    if (tel_parent) payloadCommun.tel_parent = tel_parent

    lignesValides.push({ ligne, matricule, payloadCommun })
  }

  const TAILLE_LOT = 300

  try {
    // 1) On repère en une poignée de requêtes quels matricules existent déjà
    // DANS MON ÉTABLISSEMENT, pour distinguer créations et mises à jour
    // (sans faire un SELECT par ligne).
    const tousMatricules = lignesValides.map((l) => l.matricule)
    const matriculesExistants = new Set()
    for (let i = 0; i < tousMatricules.length; i += TAILLE_LOT) {
      const lot = tousMatricules.slice(i, i + TAILLE_LOT)
      const { data, error } = await supabase
        .from('eleves')
        .select('matricule')
        .eq('code_etablissement', monCode)
        .in('matricule', lot)
      if (error) throw error
      for (const r of data || []) matriculesExistants.add(r.matricule)
    }

    // 2) Upsert groupé : "statut" n'est envoyé QUE pour les nouveaux élèves
    // (mis à 'Actif'), jamais pour une mise à jour, afin de ne jamais écraser
    // un statut (Actif/Inactif/Transféré/Exclu) déjà changé manuellement.
    // onConflict porte sur (code_etablissement, matricule) : le même
    // matricule peut exister dans deux établissements différents sans
    // jamais se marcher dessus.
    for (let i = 0; i < lignesValides.length; i += TAILLE_LOT) {
      const lot = lignesValides.slice(i, i + TAILLE_LOT)
      const payloadLot = lot.map(({ matricule, payloadCommun }) => {
        const estNouveau = !matriculesExistants.has(matricule)
        return estNouveau ? { ...payloadCommun, statut: 'Actif' } : payloadCommun
      })

      const { error } = await supabase
        .from('eleves')
        .upsert(payloadLot, { onConflict: 'code_etablissement,matricule' })
      if (error) {
        for (const { ligne, matricule } of lot) {
          erreurs.push(`Ligne ${ligne} (${matricule}) : ${error.message}`)
        }
        continue
      }

      for (const { matricule } of lot) {
        if (matriculesExistants.has(matricule)) mis_a_jour++
        else importes++
      }
    }
  } catch (err) {
    console.error('[eleves/import] erreur:', err.message)
    return res.status(500).json({ error: `Erreur lors de l'import : ${err.message}` })
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
        .eq('code_etablissement', req.user.code_etablissement)
        .ilike('matricule', matricule)
        .maybeSingle()

      if (erreurRecherche) throw erreurRecherche

      if (!existant) {
        non_trouves.push(`${nomFichier} : aucun élève avec le matricule "${matricule}"`)
        continue
      }

      const ext = (nomFichier.split('.').pop() || 'jpg').toLowerCase()
      // Le chemin de stockage inclut le code établissement pour ne jamais
      // faire collision entre deux écoles ayant un élève au même matricule.
      const chemin = `${req.user.code_etablissement}/${existant.matricule}.${ext}`

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
