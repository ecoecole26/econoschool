import { Router } from 'express'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { calculerFrais } from '../lib/frais.js'
import { fetchTout } from '../lib/supabasePagination.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

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
const TAILLE_LOT = 300 // taille des lots pour les requêtes groupées (import, dette antérieure...)

// Colonnes attendues dans le fichier Excel à importer. "Code établissement"
// et "Nom établissement" sont désormais en tête : c'est le garde-fou qui
// empêche d'importer par erreur le fichier d'un AUTRE établissement dans le
// tien (voir logique de validation dans POST /import). Le reste reprend
// l'ordre du modèle ministériel téléchargeable.
const COLONNES_MODELE = [
  'Code établissement', 'Nom établissement',
  'Matricule', 'Nom', 'Prénom', 'Sexe', 'Date de naissance', 'Lieu de naissance',
  'Classe', 'Nom du parent', 'Téléphone 1', 'Téléphone 2',
  'Qualité', 'Statut'
]
const EXEMPLE_MODELE = [
  '017242', 'COLLEGE EXEMPLE',
  '21421986V', 'ABDON', 'GRACE EMMANUELA SARAH', 'F', '21/06/2009', 'SAOUNDI',
  '6eme6', 'ADBON KARIM', '0759109875', '0759109875',
  'NRedoublant', 'Affecte'
]

function decouper(tableau, taille) {
  const lots = []
  for (let i = 0; i < tableau.length; i += taille) lots.push(tableau.slice(i, i + taille))
  return lots
}

// GET /api/eleves?annee=&search=&classe=&statut=&page=1&pageSize=60
// Sans "annee" fourni : l'année scolaire ACTIVE de l'établissement. Toute
// autre année demandée (passée) est renvoyée telle quelle mais reste
// non modifiable côté frontend (voir garde-fous sur PUT/PATCH/DELETE).
router.get('/', requireAuth, async (req, res) => {
  const { search = '', classe = '', statut = '' } = req.query
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 60))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let annee
  try {
    annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) {
    return res.json({ eleves: [], total: 0, total_actifs: 0, page, pageSize, totalPages: 1, annee: null })
  }

  function appliquerFiltres(q) {
    q = q.eq('code_etablissement', req.user.code_etablissement).eq('annee_scolaire', annee)
    if (search) q = q.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
    if (classe) q = q.ilike('classe', `%${classe}%`)
    if (statut) q = q.eq('statut', statut)
    return q
  }

  const requetePage = appliquerFiltres(
    supabase.from('inscriptions').select('*', { count: 'exact' }).order('nom', { ascending: true })
  ).range(from, to)

  const requeteActifs = appliquerFiltres(
    supabase.from('inscriptions').select('id', { count: 'exact', head: true }).eq('statut', 'Actif')
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

  // Photo + contact vivent sur l'identité permanente (`eleves`), pas sur
  // l'inscription : un seul aller-retour pour les récupérer pour cette page.
  const eleveIds = [...new Set((data || []).map((i) => i.eleve_id))]
  const { data: identites } = eleveIds.length
    ? await supabase.from('eleves').select('id, photo_url, parent, tel_parent').in('id', eleveIds)
    : { data: [] }
  const identiteParId = new Map((identites || []).map((e) => [e.id, e]))

  const eleves = (data || []).map((insc) => {
    const identite = identiteParId.get(insc.eleve_id) || {}
    return {
      id: insc.eleve_id,
      matricule: insc.matricule,
      nom: insc.nom,
      classe: insc.classe,
      niveau: insc.niveau,
      statut: insc.statut,
      affecte: insc.affecte,
      redoublant: insc.redoublant,
      kit_rame: insc.kit_rame,
      kit_eps: insc.kit_eps,
      kit_autres: insc.kit_autres,
      photo_url: identite.photo_url || null,
      parent: identite.parent || null,
      tel_parent: identite.tel_parent || null
    }
  })

  res.json({
    eleves,
    total: count,
    total_actifs: totalActifs ?? null,
    page,
    pageSize,
    totalPages: count ? Math.ceil(count / pageSize) : 1,
    annee
  })
})

// Calcule, pour un ensemble d'inscriptions passées (années différentes de
// l'année en cours), le reste-à-payer de CHACUNE à l'époque — sert à
// détecter automatiquement une dette antérieure à l'import de la rentrée
// suivante (voir POST /import). `entrees` : [{ eleve_id, annee_scolaire,
// niveau, affecte, matricule }]. Renvoie une Map(eleve_id -> reste_a_payer).
async function calculerResteAnterieur(code_etablissement, entrees) {
  if (!entrees.length) return new Map()

  const annees = [...new Set(entrees.map((e) => e.annee_scolaire))]
  const eleveIds = [...new Set(entrees.map((e) => e.eleve_id))]

  const { data: tarifs } = await supabase
    .from('tarifs')
    .select('niveau, annee_scolaire, scolarite_annuelle, frais_inscription, frais_annexes, frais_examen, examen')
    .eq('code_etablissement', code_etablissement)
    .in('annee_scolaire', annees)

  const payeMap = new Map()
  const reducMap = new Map()
  for (const lot of decouper(eleveIds, TAILLE_LOT)) {
    const [{ data: paiements }, { data: reductions }] = await Promise.all([
      supabase
        .from('paiements')
        .select('eleve_id, annee_scolaire, montant')
        .eq('code_etablissement', code_etablissement)
        .in('eleve_id', lot)
        .in('annee_scolaire', annees),
      supabase
        .from('reductions')
        .select('eleve_id, annee_scolaire, pourcentage')
        .eq('code_etablissement', code_etablissement)
        .in('eleve_id', lot)
        .in('annee_scolaire', annees)
        .eq('statut', 'active')
    ])
    for (const p of paiements || []) {
      const cle = `${p.eleve_id}|${p.annee_scolaire}`
      payeMap.set(cle, (payeMap.get(cle) || 0) + Number(p.montant))
    }
    for (const r of reductions || []) {
      reducMap.set(`${r.eleve_id}|${r.annee_scolaire}`, r.pourcentage)
    }
  }

  const tarifParCle = new Map((tarifs || []).map((t) => [`${t.annee_scolaire}|${t.niveau}`, t]))

  const resteMap = new Map()
  for (const e of entrees) {
    const tarif = tarifParCle.get(`${e.annee_scolaire}|${e.niveau}`) || {}
    const cle = `${e.eleve_id}|${e.annee_scolaire}`
    const frais = calculerFrais(tarif, { affecte: e.affecte }, reducMap.get(cle) || 0)
    const paye = payeMap.get(cle) || 0
    const reste = Math.max(frais.total_du - paye, 0)
    if (reste > 0) resteMap.set(e.eleve_id, reste)
  }
  return resteMap
}

// Renvoie la date butoir applicable à un niveau donné : celle spécifique au
// niveau si elle existe, sinon la date globale, sinon null.
function dateButoirPourNiveau(niveau, { global, parNiveau }) {
  return (niveau && parNiveau[niveau]) || global || null
}

// Calcule le bilan (total dû/payé/reste + statut) pour chaque élève inscrit
// à l'ANNÉE DONNÉE. Si cette année est l'année active de l'établissement,
// une éventuelle dette antérieure (table `credits_reports`, alimentée
// automatiquement à l'import) s'ajoute au total dû — jamais sur une année
// passée consultée en lecture seule, qui garde ses chiffres tels qu'ils
// étaient à l'époque.
export async function calculerBilanEleves({
  code_etablissement,
  annee,
  search = '',
  classe = '',
  niveau = '',
  statutPaiementFiltre = ''
}) {
  const [inscriptions, tarifs, reductions, paiements, datesButoirBrutes, etabRes, dettesRes] = await Promise.all([
    fetchTout((from, to) => {
      let q = supabase
        .from('inscriptions')
        .select('*')
        .eq('code_etablissement', code_etablissement)
        .eq('annee_scolaire', annee)
        .order('nom', { ascending: true })
      if (search) q = q.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
      if (classe) q = q.ilike('classe', `%${classe}%`)
      if (niveau) q = q.eq('niveau', niveau)
      return q.range(from, to)
    }),
    fetchTout((from, to) =>
      supabase
        .from('tarifs')
        .select('*')
        .eq('code_etablissement', code_etablissement)
        .eq('annee_scolaire', annee)
        .range(from, to)
    ),
    fetchTout((from, to) =>
      supabase
        .from('reductions')
        .select('eleve_id, pourcentage')
        .eq('code_etablissement', code_etablissement)
        .eq('annee_scolaire', annee)
        .eq('statut', 'active')
        .range(from, to)
    ),
    fetchTout((from, to) =>
      supabase
        .from('paiements')
        .select('eleve_id, montant')
        .eq('code_etablissement', code_etablissement)
        .eq('annee_scolaire', annee)
        .range(from, to)
    ),
    fetchTout((from, to) =>
      supabase
        .from('dates_butoir')
        .select('niveau, date_butoir')
        .eq('code_etablissement', code_etablissement)
        .eq('annee_scolaire', annee)
        .range(from, to)
    ),
    supabase.from('etablissements').select('annee').eq('code_etablissement', code_etablissement).maybeSingle(),
    supabase.from('credits_reports').select('matricule, solde_reporte').eq('etablissement', code_etablissement)
  ])

  const anneeCourante = etabRes.data?.annee || null
  const dettesParMatricule = new Map((dettesRes.data || []).map((d) => [d.matricule, Number(d.solde_reporte) || 0]))

  const eleveIds = (inscriptions || []).map((i) => i.eleve_id)
  const identiteParId = new Map()
  for (const lot of decouper(eleveIds, TAILLE_LOT)) {
    const { data } = await supabase.from('eleves').select('id, photo_url').in('id', lot)
    for (const e of data || []) identiteParId.set(e.id, e)
  }

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

  let lignes = (inscriptions || []).map((insc) => {
    const tarif = tarifParNiveau.get(insc.niveau) || {}
    const reductionPourcentage = reductionParEleve.get(insc.eleve_id) || 0
    const frais = calculerFrais(tarif, insc, reductionPourcentage)
    const totalPaye = totalPayeParEleve.get(insc.eleve_id) || 0
    // La dette antérieure ne compte que si on regarde l'année EN COURS : sur
    // une année passée (lecture seule), on affiche ses propres chiffres tels
    // qu'ils étaient à l'époque, sans y mélanger une notion qui n'existait
    // pas encore.
    const detteAnterieure = annee === anneeCourante ? dettesParMatricule.get(insc.matricule) || 0 : 0
    const total_du = frais.total_du + detteAnterieure
    const reste_a_payer = Math.max(total_du - totalPaye, 0)
    const statut_paiement = reste_a_payer <= 0 ? 'solde' : totalPaye > 0 ? 'partiel' : 'non_paye'

    const date_butoir = dateButoirPourNiveau(insc.niveau, datesButoir)
    const en_retard = date_butoir ? reste_a_payer > 0 && aujourdhui > date_butoir : reste_a_payer > 0

    return {
      id: insc.eleve_id,
      matricule: insc.matricule,
      nom: insc.nom,
      niveau: insc.niveau,
      classe: insc.classe,
      photo_url: identiteParId.get(insc.eleve_id)?.photo_url || null,
      affecte: insc.affecte,
      statut: insc.statut,
      dette_anterieure: detteAnterieure,
      total_du,
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
    total_dette_anterieure: lignes.reduce((s, l) => s + l.dette_anterieure, 0),
    total_paye: lignes.reduce((s, l) => s + l.total_paye, 0),
    total_reste: lignes.reduce((s, l) => s + l.reste_a_payer, 0)
  }

  return { lignes, resume, annee }
}

// GET /api/eleves/bilan?annee=&search=&classe=&niveau=&statut_paiement=solde|retard
router.get('/bilan', requireAuth, async (req, res) => {
  const { search = '', classe = '', niveau = '', statut_paiement: statutPaiementFiltre = '' } = req.query

  try {
    const annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
    if (!annee) return res.json({ lignes: [], resume: null })

    const { lignes, resume } = await calculerBilanEleves({
      code_etablissement: req.user.code_etablissement,
      annee,
      search,
      classe,
      niveau,
      statutPaiementFiltre
    })
    res.json({ lignes, resume, annee })
  } catch (err) {
    console.error('[eleves] erreur bilan:', err.message)
    res.status(500).json({ error: 'Erreur lors du calcul du bilan' })
  }
})

// GET /api/eleves/bilan/export?annee=&search=&classe=&niveau=&statut_paiement=solde|retard
router.get('/bilan/export', requireAuth, async (req, res) => {
  const { search = '', classe = '', niveau = '', statut_paiement: statutPaiementFiltre = '' } = req.query

  let lignes
  try {
    const annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
    ;({ lignes } = await calculerBilanEleves({
      code_etablissement: req.user.code_etablissement,
      annee,
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
// Modifie l'inscription de l'ANNÉE EN COURS uniquement (garde-fou lecture
// seule sur le passé). Le nom vit sur l'identité permanente (`eleves`) mais
// reste dupliqué sur `inscriptions` pour les recherches/tris — les deux sont
// mis à jour ensemble.
router.put('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const { nom, classe, statut, niveau, affecte, redoublant } = req.body || {}

  if (!nom || !classe) {
    return res.status(400).json({ error: 'Nom et classe sont requis' })
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

  const { error: errIdentite } = await supabase
    .from('eleves')
    .update({ nom })
    .eq('id', id)
    .eq('code_etablissement', req.user.code_etablissement)

  if (errIdentite) {
    console.error('[eleves] erreur mise à jour identité:', errIdentite.message)
    return res.status(500).json({ error: "Erreur lors de la mise à jour de l'élève" })
  }

  const payload = { classe, statut, nom }
  if (niveau !== undefined) payload.niveau = niveau
  if (affecte !== undefined) payload.affecte = !!affecte
  if (redoublant !== undefined) payload.redoublant = !!redoublant

  const { data, error } = await supabase
    .from('inscriptions')
    .update(payload)
    .eq('eleve_id', id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .select()
    .maybeSingle()

  if (error) {
    console.error('[eleves] erreur mise à jour:', error.message)
    return res.status(500).json({ error: "Erreur lors de la mise à jour de l'élève" })
  }
  if (!data) {
    return res.status(404).json({ error: "Cet élève n'a pas d'inscription pour l'année en cours" })
  }

  res.json({ eleve: { id, ...data } })
})

// PATCH /api/eleves/:id/kits  { kit_rame, kit_eps, kit_autres }
// Coche/décoche les kits remis à l'inscription — sur l'ANNÉE EN COURS
// uniquement. Bascule immédiatement l'élève dans (ou hors de) la liste
// visible sur la page "Kit inscription".
router.patch('/:id/kits', requireAuth, async (req, res) => {
  const { id } = req.params
  const payload = {}
  for (const champ of ['kit_rame', 'kit_eps', 'kit_autres']) {
    if (req.body?.[champ] !== undefined) payload[champ] = !!req.body[champ]
  }
  if (Object.keys(payload).length === 0) {
    return res.status(400).json({ error: 'Aucun kit à mettre à jour' })
  }

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

  const { data, error } = await supabase
    .from('inscriptions')
    .update(payload)
    .eq('eleve_id', id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .select('eleve_id, kit_rame, kit_eps, kit_autres')
    .maybeSingle()

  if (error) {
    console.error('[eleves] erreur maj kits:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la mise à jour des kits' })
  }
  if (!data) {
    return res.status(404).json({ error: "Cet élève n'a pas d'inscription pour l'année en cours" })
  }

  res.json({ eleve: { id: data.eleve_id, kit_rame: data.kit_rame, kit_eps: data.kit_eps, kit_autres: data.kit_autres } })
})

// GET /api/eleves/kits?annee=&search=&classe=
router.get('/kits', requireAuth, async (req, res) => {
  const { search = '', classe = '' } = req.query

  let annee
  try {
    annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) return res.json({ eleves: [] })

  try {
    const inscriptions = await fetchTout((from, to) => {
      let q = supabase
        .from('inscriptions')
        .select('eleve_id, matricule, nom, classe, niveau, kit_rame, kit_eps, kit_autres')
        .eq('code_etablissement', req.user.code_etablissement)
        .eq('annee_scolaire', annee)
        .order('classe', { ascending: true })
        .order('nom', { ascending: true })
      if (search) q = q.or(`nom.ilike.%${search}%,matricule.ilike.%${search}%`)
      if (classe) q = q.ilike('classe', `%${classe}%`)
      return q.range(from, to)
    })

    res.json({
      eleves: (inscriptions || []).map((i) => ({
        id: i.eleve_id,
        matricule: i.matricule,
        nom: i.nom,
        classe: i.classe,
        niveau: i.niveau,
        kit_rame: i.kit_rame,
        kit_eps: i.kit_eps,
        kit_autres: i.kit_autres
      }))
    })
  } catch (err) {
    console.error('[eleves] erreur liste kits:', err.message)
    res.status(500).json({ error: 'Erreur lors de la lecture des kits' })
  }
})

// DELETE /api/eleves/:id
// Retire l'élève de l'ANNÉE EN COURS uniquement (son historique des années
// précédentes n'est jamais touché). Si cette suppression le laisse sans
// AUCUNE inscription restante (élève tout nouveau, mal saisi), son identité
// et sa photo sont nettoyées aussi — sinon son dossier reste intact.
router.delete('/:id', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut supprimer un élève' })
  }

  const { id } = req.params

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }

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

  const { error: errSuppInscription } = await supabase
    .from('inscriptions')
    .delete()
    .eq('eleve_id', id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)

  if (errSuppInscription) {
    console.error('[eleves] erreur suppression inscription:', errSuppInscription.message)
    return res.status(500).json({ error: "Erreur lors de la suppression de l'élève" })
  }

  const { count } = await supabase
    .from('inscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('eleve_id', id)

  if (!count) {
    if (eleve.photo_url) {
      const chemin = eleve.photo_url.split('/').pop()
      if (chemin) {
        const { error: erreurStorage } = await supabase.storage.from(PHOTOS_BUCKET).remove([chemin])
        if (erreurStorage) console.warn('[eleves] échec suppression photo:', erreurStorage.message)
      }
    }
    await supabase.from('eleves').delete().eq('id', id)
  }

  res.json({ ok: true })
})

// ---------- Import ZIP (CSV + photos) ----------

function normaliseCle(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normaliseValeur(val) {
  return normaliseCle(val).replace(/\s+/g, '')
}

function estAffecte(val) {
  const v = normaliseValeur(val)
  return v === 'affecte' || v === 'oui' || v === 'yes' || v === 'true' || v === '1'
}

function estRedoublant(val) {
  const v = normaliseValeur(val)
  return v === 'redoublant' || v === 'oui' || v === 'yes' || v === 'true' || v === '1'
}

// GET /api/eleves/modele  → télécharge un fichier .xlsx vierge (avec un exemple)
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
// Importe TOUJOURS dans l'ANNÉE EN COURS de l'établissement (pour démarrer
// une nouvelle année, on la crée d'abord via "Année scolaire" puis on
// réimporte la liste des élèves promus — voir POST /api/etablissement/annees).
//
// DÉTECTION AUTOMATIQUE DE DETTE ANTÉRIEURE : pour chaque matricule déjà
// connu (élève qui existait avant cet import) ayant une inscription sur une
// année différente, son reste-à-payer de cette année-là est calculé et,
// s'il est positif, enregistré dans `credits_reports` (cumulé avec une
// éventuelle dette déjà non soldée) — visible sur la page "Dette antérieure"
// et pris en compte automatiquement dans son bilan de l'année en cours.
router.post('/import', requireAuth, uploadExcel.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier reçu (champ "file" attendu)' })
  }

  let annee
  try {
    annee = await getAnneeCourante(req.user.code_etablissement)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
  if (!annee) {
    return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement — configure-la d'abord." })
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

  const monCode = req.user.code_etablissement

  const codesLignes = rows.map(
    (row) => String(row['code etablissement'] || row.codeets || row['code_etablissement'] || '').trim()
  )
  const lignesAvecCode = codesLignes.filter(Boolean)
  if (lignesAvecCode.length > 0) {
    const correspondantes = lignesAvecCode.filter((c) => c === monCode).length
    const ratioCorrespondant = correspondantes / lignesAvecCode.length
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

  const lignesValides = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const ligne = i + 2

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
    const affecte = estAffecte(row.statut || row.affecte)
    const redoublant = estRedoublant(row.qualite || row.redoublant)
    const parent = String(row['nom du parent'] || row.parent || row['nom parent'] || '').trim()
    let tel_parent = String(
      row['telephone 1'] || row['telephone1'] || row.tel_parent || row.telephone || ''
    ).trim()
    if (/^\d{9}$/.test(tel_parent)) {
      tel_parent = `0${tel_parent}`
    }

    lignesValides.push({
      ligne,
      matricule,
      nom,
      classe,
      niveau,
      affecte,
      redoublant,
      parent: parent || null,
      tel_parent: tel_parent || null
    })
  }

  try {
    const tousMatricules = lignesValides.map((l) => l.matricule)
    const eleveExistantParMatricule = new Map()
    for (const lot of decouper(tousMatricules, TAILLE_LOT)) {
      const { data, error } = await supabase
        .from('eleves')
        .select('id, matricule')
        .eq('code_etablissement', monCode)
        .in('matricule', lot)
      if (error) throw error
      for (const r of data || []) eleveExistantParMatricule.set(r.matricule, r.id)
    }

    const eleveIdParMatricule = new Map(eleveExistantParMatricule)
    for (const lot of decouper(lignesValides, TAILLE_LOT)) {
      const payload = lot.map((l) => {
        const p = { matricule: l.matricule, nom: l.nom, code_etablissement: monCode }
        if (l.parent) p.parent = l.parent
        if (l.tel_parent) p.tel_parent = l.tel_parent
        return p
      })
      const { data, error } = await supabase
        .from('eleves')
        .upsert(payload, { onConflict: 'code_etablissement,matricule' })
        .select('id, matricule')
      if (error) {
        for (const l of lot) erreurs.push(`Ligne ${l.ligne} (${l.matricule}) : ${error.message}`)
        continue
      }
      for (const r of data || []) eleveIdParMatricule.set(r.matricule, r.id)
    }

    for (const lot of decouper(lignesValides, TAILLE_LOT)) {
      const payload = lot
        .map((l) => {
          const eleve_id = eleveIdParMatricule.get(l.matricule)
          if (!eleve_id) return null
          const estNouveau = !eleveExistantParMatricule.has(l.matricule)
          return {
            eleve_id,
            code_etablissement: monCode,
            annee_scolaire: annee,
            matricule: l.matricule,
            nom: l.nom,
            classe: l.classe,
            niveau: l.niveau,
            affecte: l.affecte,
            redoublant: l.redoublant,
            ...(estNouveau ? { statut: 'Actif' } : {})
          }
        })
        .filter(Boolean)

      const { error } = await supabase
        .from('inscriptions')
        .upsert(payload, { onConflict: 'eleve_id,annee_scolaire' })
      if (error) {
        for (const l of lot) erreurs.push(`Ligne ${l.ligne} (${l.matricule}) : ${error.message}`)
        continue
      }
      for (const l of lot) {
        if (eleveExistantParMatricule.has(l.matricule)) mis_a_jour++
        else importes++
      }
    }

    let dettes_detectees = 0
    const idsConnus = [...eleveExistantParMatricule.values()]
    if (idsConnus.length) {
      const anciennesInscriptions = []
      for (const lot of decouper(idsConnus, TAILLE_LOT)) {
        const { data } = await supabase
          .from('inscriptions')
          .select('eleve_id, annee_scolaire, niveau, affecte, matricule')
          .eq('code_etablissement', monCode)
          .in('eleve_id', lot)
          .neq('annee_scolaire', annee)
        anciennesInscriptions.push(...(data || []))
      }

      const derniereParEleve = new Map()
      for (const insc of anciennesInscriptions) {
        const actuelle = derniereParEleve.get(insc.eleve_id)
        if (!actuelle || insc.annee_scolaire > actuelle.annee_scolaire) {
          derniereParEleve.set(insc.eleve_id, insc)
        }
      }

      if (derniereParEleve.size) {
        const resteMap = await calculerResteAnterieur(monCode, [...derniereParEleve.values()])

        if (resteMap.size) {
          const matriculesConcernes = [...resteMap.keys()].map((eleveId) => derniereParEleve.get(eleveId).matricule)
          const { data: dettesExistantes } = await supabase
            .from('credits_reports')
            .select('matricule, solde_reporte')
            .eq('etablissement', monCode)
            .in('matricule', matriculesConcernes)
          const detteExistanteParMatricule = new Map(
            (dettesExistantes || []).map((d) => [d.matricule, Number(d.solde_reporte) || 0])
          )

          const payloadDettes = []
          for (const [eleveId, reste] of resteMap) {
            const insc = derniereParEleve.get(eleveId)
            const ligne = lignesValides.find((l) => l.matricule === insc.matricule)
            const detteExistante = detteExistanteParMatricule.get(insc.matricule) || 0
            payloadDettes.push({
              matricule: insc.matricule,
              nom: ligne?.nom || insc.matricule,
              niveau: ligne?.niveau || insc.niveau,
              annee: insc.annee_scolaire,
              solde_reporte: detteExistante + reste,
              etablissement: monCode
            })
          }

          if (payloadDettes.length) {
            const { error: errDettes } = await supabase
              .from('credits_reports')
              .upsert(payloadDettes, { onConflict: 'etablissement,matricule' })
            if (errDettes) {
              console.error('[eleves/import] erreur enregistrement dettes:', errDettes.message)
            } else {
              dettes_detectees = payloadDettes.length
            }
          }
        }
      }
    }

    res.json({ importes, mis_a_jour, dettes_detectees, total_lignes: rows.length, erreurs, annee })
  } catch (err) {
    console.error('[eleves/import] erreur:', err.message)
    res.status(500).json({ error: `Erreur lors de l'import : ${err.message}` })
  }
})

// POST /api/eleves/import-photos  (multipart/form-data, champ "photos" = plusieurs fichiers)
// La photo vit sur l'identité permanente (`eleves`) : pas de notion
// d'année ici, une seule photo par élève quelle que soit l'année.
router.post('/import-photos', requireAuth, uploadZip.array('photos', 200), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Aucune photo reçue (champ "photos" attendu)' })
  }

  let importees = 0
  const non_trouves = []
  const erreurs = []

  for (const fichier of req.files) {
    const nomFichier = fichier.originalname
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
