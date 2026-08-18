import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { crediterCaisseParPaiement, getOrCreateCaisse, LABEL_CAISSE } from '../lib/caisse.js'
import { calculerFrais, getReductionActive } from '../lib/frais.js'
import { envoyerSmsEtJournaliser } from '../lib/sms.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

const router = Router()

// GET /api/paiements/recherche?matricule=XXXX
// Retourne l'élève, sa fiche pour l'ANNÉE EN COURS (classe/niveau/statut),
// le détail des frais dus (incluant une éventuelle dette antérieure — voir
// `credits_reports`, alimentée automatiquement à l'import de rentrée),
// l'historique des paiements DE CETTE ANNÉE et le reste à payer.
router.get('/recherche', requireAuth, async (req, res) => {
  const matricule = (req.query.matricule || '').trim()
  if (!matricule) {
    return res.status(400).json({ error: 'Matricule requis' })
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

  const { data: identite, error: errEleve } = await supabase
    .from('eleves')
    .select('id, matricule, nom, tel_parent, parent, photo_url')
    .eq('code_etablissement', req.user.code_etablissement)
    .ilike('matricule', matricule)
    .maybeSingle()

  if (errEleve) {
    console.error('[paiements] erreur recherche élève:', errEleve.message)
    return res.status(500).json({ error: 'Erreur lors de la recherche' })
  }
  if (!identite) {
    return res.status(404).json({ error: `Aucun élève avec le matricule "${matricule}"` })
  }

  const { data: inscription, error: errInscription } = await supabase
    .from('inscriptions')
    .select('*')
    .eq('eleve_id', identite.id)
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .maybeSingle()

  if (errInscription) {
    console.error('[paiements] erreur recherche inscription:', errInscription.message)
    return res.status(500).json({ error: 'Erreur lors de la recherche' })
  }
  if (!inscription) {
    return res.status(404).json({ error: `${identite.nom} n'est pas inscrit(e) pour l'année ${annee}` })
  }

  const eleve = { ...identite, ...inscription, id: identite.id }

  const { data: tarif } = await supabase
    .from('tarifs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .eq('annee_scolaire', annee)
    .eq('niveau', eleve.niveau)
    .maybeSingle()

  let reduction = null
  try {
    reduction = await getReductionActive(supabase, eleve.id, annee)
  } catch (errReduction) {
    console.error('[paiements] erreur lecture réduction:', errReduction.message)
  }

  const { data: detteRow } = await supabase
    .from('credits_reports')
    .select('solde_reporte, annee')
    .eq('etablissement', req.user.code_etablissement)
    .eq('matricule', eleve.matricule)
    .maybeSingle()
  const dette_anterieure = Number(detteRow?.solde_reporte) || 0

  const fraisAnnee = calculerFrais(tarif || {}, eleve, reduction?.pourcentage || 0)
  const frais = { ...fraisAnnee, dette_anterieure, total_du: fraisAnnee.total_du + dette_anterieure }

  const { data: paiements, error: errPaiements } = await supabase
    .from('paiements')
    .select('*')
    .eq('eleve_id', eleve.id)
    .eq('annee_scolaire', annee)
    .order('date_paiement', { ascending: false })

  if (errPaiements) {
    console.error('[paiements] erreur historique:', errPaiements.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des paiements' })
  }

  const totalPaye = (paiements || []).reduce((s, p) => s + Number(p.montant), 0)
  const reste_a_payer = Math.max(frais.total_du - totalPaye, 0)

  res.json({ eleve, tarif: tarif || null, frais, reduction, paiements: paiements || [], totalPaye, reste_a_payer, annee })
})

// GET /api/paiements/tranches -> toutes les tranches de toutes les catégories,
// pour peupler le menu déroulant "Tranche / échéance" du formulaire de paiement.
// (Les catégories de frais elles-mêmes ne dépendent pas de l'année.)
router.get('/tranches', requireAuth, async (req, res) => {
  const { data: types, error: err1 } = await supabase
    .from('types_frais')
    .select('id, nom, ordre')
    .eq('code_etablissement', req.user.code_etablissement)
    .order('ordre', { ascending: true })

  if (err1) return res.status(500).json({ error: err1.message })

  const { data: tranches, error: err2 } = await supabase
    .from('tranches_frais')
    .select('*')
    .in('type_frais_id', (types || []).map((t) => t.id))
    .order('ordre', { ascending: true })

  if (err2) return res.status(500).json({ error: err2.message })

  const result = (tranches || []).map((t) => {
    const type = types.find((ty) => ty.id === t.type_frais_id)
    return { id: t.id, label: `${type?.nom || '—'} — ${t.label}`, date_echeance: t.date_echeance }
  })

  res.json({ tranches: result })
})

// POST /api/paiements  { eleve_id, tranche_libelle, montant, date_paiement }
// Toujours enregistré sur l'ANNÉE EN COURS de l'établissement (on ne peut
// pas encaisser un paiement sur une année passée, consultable en lecture
// seule uniquement).
//
// IMPUTATION FIFO : si l'élève a une dette antérieure non soldée
// (`credits_reports`), le paiement l'éponge EN PRIORITÉ, avant de compter
// pour les frais de l'année en cours. Si le montant versé couvre les deux,
// DEUX lignes de paiement sont créées (une par année concernée) pour que
// le reçu et l'historique soient parfaitement clairs pour le parent.
router.post('/', requireAuth, async (req, res) => {
  const { eleve_id, tranche_libelle, montant, date_paiement } = req.body || {}

  const montantNum = Number(montant)
  if (!eleve_id || !montantNum || montantNum <= 0) {
    return res.status(400).json({ error: 'Élève et montant valides requis' })
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

  const { data: eleve, error: errEleve } = await supabase
    .from('eleves')
    .select('id, matricule, nom, tel_parent, parent')
    .eq('id', eleve_id)
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (errEleve || !eleve) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  // Un paiement crédite TOUJOURS la caisse : si elle est fermée ou en pause,
  // on bloque avant même de créer le paiement, plutôt que d'enregistrer un
  // paiement dont l'argent ne rentre nulle part.
  const caisse = await getOrCreateCaisse('principale', req.user.code_etablissement)
  if (caisse.statut !== 'ouverte') {
    return res.status(409).json({
      error: `${LABEL_CAISSE[caisse.type_caisse]} fermée ou en pause : ouvrez-la avant d'encaisser un paiement.`
    })
  }

  // --- Imputation FIFO sur une éventuelle dette antérieure ---
  const { data: detteRow } = await supabase
    .from('credits_reports')
    .select('id, solde_reporte, annee')
    .eq('etablissement', req.user.code_etablissement)
    .eq('matricule', eleve.matricule)
    .maybeSingle()

  const soldeReporte = Number(detteRow?.solde_reporte) || 0
  const montantVersDette = Math.min(montantNum, soldeReporte)
  const montantVersAnnee = montantNum - montantVersDette

  const lignesAInserer = []
  if (montantVersDette > 0) {
    lignesAInserer.push({
      eleve_id,
      matricule: eleve.matricule,
      tranche_libelle: `Reliquat ${detteRow.annee}`,
      montant: montantVersDette,
      date_paiement: date_paiement || new Date().toISOString().slice(0, 10),
      valide_par: req.user.nom || req.user.role,
      code_etablissement: req.user.code_etablissement,
      annee_scolaire: detteRow.annee
    })
  }
  if (montantVersAnnee > 0) {
    lignesAInserer.push({
      eleve_id,
      matricule: eleve.matricule,
      tranche_libelle: tranche_libelle || null,
      montant: montantVersAnnee,
      date_paiement: date_paiement || new Date().toISOString().slice(0, 10),
      valide_par: req.user.nom || req.user.role,
      code_etablissement: req.user.code_etablissement,
      annee_scolaire: annee
    })
  }

  const { data: paiementsCrees, error } = await supabase.from('paiements').insert(lignesAInserer).select()

  if (error) {
    console.error('[paiements] erreur enregistrement:', error.message)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du paiement" })
  }

  // Solde la dette (partiellement ou en totalité) une fois le paiement acté.
  if (montantVersDette > 0) {
    const { error: errDette } = await supabase
      .from('credits_reports')
      .update({ solde_reporte: soldeReporte - montantVersDette, updated_at: new Date().toISOString() })
      .eq('id', detteRow.id)
    if (errDette) console.error('[paiements] erreur mise à jour dette antérieure:', errDette.message)
  }

  // Le paiement est déjà enregistré à ce stade : un souci de crédit caisse ne
  // doit pas faire échouer la réponse (le paiement reste valide), on log juste
  // un avertissement pour investigation.
  let caisseAvertissement = null
  try {
    await crediterCaisseParPaiement({
      montant: montantNum,
      libelle: `Paiement ${eleve.matricule} — ${tranche_libelle || 'frais'}`,
      code_etablissement: req.user.code_etablissement
    })
  } catch (errCaisse) {
    console.error('[paiements] erreur crédit caisse:', errCaisse.message)
    caisseAvertissement = 'Paiement enregistré, mais le crédit de la caisse a échoué.'
  }

  // Le SMS au parent est un "plus" : s'il échoue (numéro manquant, passerelle
  // injoignable...), le paiement reste valide — on renvoie juste un statut au
  // frontend pour information, sans jamais faire échouer la requête.
  let sms = { envoye: false, motif: null }
  if (eleve.tel_parent) {
    const montantFmt = new Intl.NumberFormat('fr-FR').format(montantNum)
    let detailPaiement = tranche_libelle ? `pour ${tranche_libelle}` : ''
    if (montantVersDette > 0 && montantVersAnnee > 0) {
      detailPaiement = `dont un reliquat de l'année précédente${tranche_libelle ? ` et ${tranche_libelle}` : ''}`
    } else if (montantVersDette > 0) {
      detailPaiement = `en règlement d'un reliquat de l'année précédente`
    }
    const message = `Paiement de ${montantFmt} F recu ${detailPaiement} concernant ${eleve.nom} (${eleve.matricule}). Merci.`

    const resultatSms = await envoyerSmsEtJournaliser({
      eleve_id: eleve.id,
      matricule: eleve.matricule,
      telephoneBrut: eleve.tel_parent,
      message,
      contexte: 'paiement'
    })
    sms = resultatSms.ok
      ? { envoye: true, motif: null }
      : { envoye: false, motif: resultatSms.error }
  } else {
    sms = { envoye: false, motif: 'Aucun numéro de parent renseigné pour cet élève' }
  }

  res.json({
    paiements: paiementsCrees,
    paiement: paiementsCrees[paiementsCrees.length - 1],
    montant_vers_dette: montantVersDette,
    montant_vers_annee: montantVersAnnee,
    avertissement: caisseAvertissement,
    sms
  })
})

export default router
