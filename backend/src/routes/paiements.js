import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { crediterCaissesParPaiement, getOrCreateCaisse, LABEL_CAISSE } from '../lib/caisse.js'
import { calculerFrais, getReductionActive } from '../lib/frais.js'
import { envoyerSmsEtJournaliser } from '../lib/sms.js'

const router = Router()

// GET /api/paiements/recherche?matricule=XXXX
// Retourne l'élève, le détail des frais dus, l'historique des paiements et le reste à payer.
router.get('/recherche', requireAuth, async (req, res) => {
  const matricule = (req.query.matricule || '').trim()
  if (!matricule) {
    return res.status(400).json({ error: 'Matricule requis' })
  }

  const { data: eleve, error: errEleve } = await supabase
    .from('eleves')
    .select('*')
    .ilike('matricule', matricule)
    .maybeSingle()

  if (errEleve) {
    console.error('[paiements] erreur recherche élève:', errEleve.message)
    return res.status(500).json({ error: 'Erreur lors de la recherche' })
  }
  if (!eleve) {
    return res.status(404).json({ error: `Aucun élève avec le matricule "${matricule}"` })
  }

  const { data: tarif } = await supabase
    .from('tarifs')
    .select('*')
    .eq('niveau', eleve.niveau)
    .maybeSingle()

  let reduction = null
  try {
    reduction = await getReductionActive(supabase, eleve.id)
  } catch (errReduction) {
    console.error('[paiements] erreur lecture réduction:', errReduction.message)
  }

  const frais = calculerFrais(tarif || {}, eleve, reduction?.pourcentage || 0)

  const { data: paiements, error: errPaiements } = await supabase
    .from('paiements')
    .select('*')
    .eq('eleve_id', eleve.id)
    .order('date_paiement', { ascending: false })

  if (errPaiements) {
    console.error('[paiements] erreur historique:', errPaiements.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des paiements' })
  }

  const totalPaye = (paiements || []).reduce((s, p) => s + Number(p.montant), 0)
  const reste_a_payer = Math.max(frais.total_du - totalPaye, 0)

  res.json({ eleve, tarif: tarif || null, frais, reduction, paiements: paiements || [], totalPaye, reste_a_payer })
})

// GET /api/paiements/tranches -> toutes les tranches de toutes les catégories,
// pour peupler le menu déroulant "Tranche / échéance" du formulaire de paiement.
router.get('/tranches', requireAuth, async (req, res) => {
  const { data: types, error: err1 } = await supabase
    .from('types_frais')
    .select('id, nom, ordre')
    .order('ordre', { ascending: true })

  if (err1) return res.status(500).json({ error: err1.message })

  const { data: tranches, error: err2 } = await supabase
    .from('tranches_frais')
    .select('*')
    .order('ordre', { ascending: true })

  if (err2) return res.status(500).json({ error: err2.message })

  const result = tranches.map((t) => {
    const type = types.find((ty) => ty.id === t.type_frais_id)
    return { id: t.id, label: `${type?.nom || '—'} — ${t.label}`, date_echeance: t.date_echeance }
  })

  res.json({ tranches: result })
})

// POST /api/paiements  { eleve_id, tranche_libelle, montant, date_paiement }
router.post('/', requireAuth, async (req, res) => {
  const { eleve_id, tranche_libelle, montant, date_paiement } = req.body || {}

  const montantNum = Number(montant)
  if (!eleve_id || !montantNum || montantNum <= 0) {
    return res.status(400).json({ error: 'Élève et montant valides requis' })
  }

  const { data: eleve, error: errEleve } = await supabase
    .from('eleves')
    .select('id, matricule, nom, tel_parent, parent')
    .eq('id', eleve_id)
    .maybeSingle()

  if (errEleve || !eleve) {
    return res.status(404).json({ error: 'Élève introuvable' })
  }

  // Un paiement crédite TOUJOURS les deux caisses : si l'une des deux est
  // fermée ou en pause, on bloque avant même de créer le paiement, plutôt
  // que d'enregistrer un paiement dont l'argent ne rentre nulle part.
  const [caissePrincipale, caisseSecondaire] = await Promise.all([
    getOrCreateCaisse('principale', req.user.etablissement),
    getOrCreateCaisse('secondaire', req.user.etablissement)
  ])
  const caissesFermees = [caissePrincipale, caisseSecondaire].filter((c) => c.statut !== 'ouverte')
  if (caissesFermees.length > 0) {
    const noms = caissesFermees.map((c) => LABEL_CAISSE[c.type_caisse]).join(' et ')
    return res.status(409).json({
      error: `${noms} ${caissesFermees.length > 1 ? 'sont fermées ou en pause' : 'est fermée ou en pause'} : ouvrez-${caissesFermees.length > 1 ? 'les' : 'la'} avant d'encaisser un paiement.`
    })
  }

  const { data, error } = await supabase
    .from('paiements')
    .insert({
      eleve_id,
      matricule: eleve.matricule,
      tranche_libelle: tranche_libelle || null,
      montant: montantNum,
      date_paiement: date_paiement || new Date().toISOString().slice(0, 10),
      valide_par: req.user.nom || req.user.role
    })
    .select()
    .single()

  if (error) {
    console.error('[paiements] erreur enregistrement:', error.message)
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du paiement" })
  }

  // Le paiement est déjà enregistré à ce stade : un souci de crédit caisse ne
  // doit pas faire échouer la réponse (le paiement reste valide), on log juste
  // un avertissement pour investigation. Les DEUX caisses (1 et 2) doivent
  // recevoir le même montant.
  let caisseAvertissement = null
  try {
    const { principale, secondaire } = await crediterCaissesParPaiement({
      montant: montantNum,
      libelle: `Paiement ${eleve.matricule} — ${tranche_libelle || 'frais'}`,
      etablissement: req.user.etablissement
    })

    const echecPrincipale = !principale || principale.error
    const echecSecondaire = !secondaire || secondaire.error

    if (echecPrincipale && echecSecondaire) {
      console.error('[paiements] erreur crédit caisses 1 et 2:', principale?.error, secondaire?.error)
      caisseAvertissement = 'Paiement enregistré, mais le crédit des Caisses 1 et 2 a échoué.'
    } else if (echecPrincipale) {
      console.error('[paiements] erreur crédit caisse 1:', principale?.error)
      caisseAvertissement = 'Paiement enregistré, mais le crédit de la Caisse 1 a échoué.'
    } else if (echecSecondaire) {
      console.error('[paiements] erreur crédit caisse 2:', secondaire?.error)
      caisseAvertissement = 'Paiement enregistré, mais le crédit de la Caisse 2 a échoué.'
    }
  } catch (errCaisse) {
    console.error('[paiements] erreur crédit caisses:', errCaisse.message)
    caisseAvertissement = 'Paiement enregistré, mais le crédit des caisses a échoué.'
  }

  // Le SMS au parent est un "plus" : s'il échoue (numéro manquant, passerelle
  // injoignable...), le paiement reste valide — on renvoie juste un statut au
  // frontend pour information, sans jamais faire échouer la requête.
  let sms = { envoye: false, motif: null }
  if (eleve.tel_parent) {
    const montantFmt = new Intl.NumberFormat('fr-FR').format(montantNum)
    const message = `${tranche_libelle ? `Paiement de ${montantFmt} F recu pour ${tranche_libelle} concernant ${eleve.nom} (${eleve.matricule}).` : `Paiement de ${montantFmt} F recu pour ${eleve.nom} (${eleve.matricule}).`} Merci.`

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

  res.json({ paiement: data, avertissement: caisseAvertissement, sms })
})

export default router
