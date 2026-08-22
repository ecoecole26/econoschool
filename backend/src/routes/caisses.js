import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import {
  TYPES_CAISSE,
  TYPE_ENCAISSEMENT,
  TYPE_SORTIE,
  LABEL_CAISSE,
  caissesVisiblesPourRole,
  roleAAccesCaisse,
  roleAAccesOperation,
  enregistrerMouvementCaisse,
  changerStatutCaisse,
  notifierRoles
} from '../lib/caisse.js'
import { consommerAutorisationApprouvee } from '../lib/autorisations.js'

const router = Router()

// GET /api/caisses -> les caisses visibles pour le rôle connecté DANS SON
// ÉTABLISSEMENT, chacune avec son journal.
router.get('/', requireAuth, async (req, res) => {
  const typesVisibles = caissesVisiblesPourRole(req.user.role)

  const { data: caisses, error: errCaisses } = await supabase
    .from('caisses')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .in('type_caisse', typesVisibles)

  if (errCaisses) {
    console.error('[caisses] erreur lecture caisses:', errCaisses.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des caisses' })
  }

  const { data: journal, error: errJournal } = await supabase
    .from('journal_caisse')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .in('caisse', typesVisibles)
    .order('date', { ascending: false })

  if (errJournal) {
    console.error('[caisses] erreur lecture journal:', errJournal.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture du journal' })
  }

  // On renvoie toujours les 2 types de caisses (même absentes de la table,
  // pas encore ouvertes) avec solde 0, pour que le frontend affiche une carte.
  const caissesCompletes = typesVisibles.map(
    (type) =>
      caisses.find((c) => c.type_caisse === type) || {
        type_caisse: type,
        solde: 0,
        statut: 'non_ouverte'
      }
  )

  res.json({ caisses: caissesCompletes, journal: journal || [] })
})

// POST /api/caisses/mouvements  { type_caisse, type_operation, libelle, montant, date }
// type_operation : 'Encaissement' | 'Sortie'
router.post('/mouvements', requireAuth, async (req, res) => {
  const { type_caisse, type_operation, libelle, montant, date } = req.body || {}

  if (!TYPES_CAISSE.includes(type_caisse)) {
    return res.status(400).json({ error: 'Caisse invalide' })
  }
  if (![TYPE_ENCAISSEMENT, TYPE_SORTIE].includes(type_operation)) {
    return res.status(400).json({ error: "Type d'opération invalide" })
  }
  if (!roleAAccesCaisse(req.user.role, type_caisse)) {
    return res.status(403).json({ error: "Tu n'as pas accès à cette caisse" })
  }

  // Une sortie est réservée au Fondateur — SAUF si l'Économe (ou le
  // Proviseur) dispose d'une autorisation "decaissement"/"depense" que le
  // Fondateur vient d'approuver depuis la page Autorisations. Dans ce cas
  // précis, l'autorisation est consommée ici (elle ne resservira pas) et
  // l'opération est laissée passer.
  let autorisationUtilisee = null
  if (type_operation === TYPE_SORTIE && !roleAAccesOperation(req.user.role, type_operation)) {
    autorisationUtilisee =
      (await consommerAutorisationApprouvee({
        code_etablissement: req.user.code_etablissement,
        econome_login: req.user.nom,
        type_action: 'decaissement'
      })) ||
      (await consommerAutorisationApprouvee({
        code_etablissement: req.user.code_etablissement,
        econome_login: req.user.nom,
        type_action: 'depense'
      }))

    if (!autorisationUtilisee) {
      return res.status(403).json({
        error:
          'Une sortie de caisse doit être validée par le Fondateur au préalable (page Autorisations).'
      })
    }
  }
  const montantNum = Number(montant)
  if (!montantNum || montantNum <= 0) {
    return res.status(400).json({ error: 'Montant invalide' })
  }

  const libelleFinal = autorisationUtilisee
    ? `${libelle || ''} [autorisation validée par ${autorisationUtilisee.decideur_login}]`.trim()
    : libelle

  try {
    const { mouvement, caisse } = await enregistrerMouvementCaisse({
      type_caisse,
      type_operation,
      montant: montantNum,
      libelle: libelleFinal,
      date,
      code_etablissement: req.user.code_etablissement,
      nom: req.user.nom || req.user.role
    })

    res.json({ mouvement, caisse })
  } catch (err) {
    console.error('[caisses] erreur enregistrement mouvement:', err.message)
    res.status(500).json({ error: err.message || "Erreur lors de l'enregistrement" })
  }
})

// POST /api/caisses/:type_caisse/statut  { statut: 'ouverte' | 'fermee' | 'pause' }
// Change l'état d'une caisse. Quand l'Économe ouvre une caisse, le Proviseur
// et le Fondateur reçoivent une notification.
router.post('/:type_caisse/statut', requireAuth, async (req, res) => {
  const { type_caisse } = req.params
  const { statut } = req.body || {}

  if (!TYPES_CAISSE.includes(type_caisse)) {
    return res.status(400).json({ error: 'Caisse invalide' })
  }
  if (!['ouverte', 'fermee', 'pause'].includes(statut)) {
    return res.status(400).json({ error: 'Statut invalide' })
  }
  if (!roleAAccesCaisse(req.user.role, type_caisse)) {
    return res.status(403).json({ error: "Tu n'as pas accès à cette caisse" })
  }

  try {
    const nom = req.user.nom || req.user.role
    const caisse = await changerStatutCaisse({
      type_caisse,
      statut,
      code_etablissement: req.user.code_etablissement,
      nom
    })

    if (statut === 'ouverte') {
      const maintenant = new Date()
      const dateAffichee = maintenant.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
      const heureAffichee = maintenant.toLocaleTimeString('fr-FR', {
        timeZone: 'UTC',
        hour: '2-digit',
        minute: '2-digit'
      })
      await notifierRoles({
        roles: ['proviseur', 'fondateur'],
        code_etablissement: req.user.code_etablissement,
        sauf_role: req.user.role,
        titre: `${LABEL_CAISSE[type_caisse]} ouverte`,
        message: `${nom} a ouvert la ${LABEL_CAISSE[type_caisse]} le ${dateAffichee} à ${heureAffichee}.`
      })
    }

    res.json({ caisse })
  } catch (err) {
    console.error('[caisses] erreur changement de statut:', err.message)
    res.status(500).json({ error: err.message || 'Erreur lors du changement de statut' })
  }
})

// GET /api/caisses/soldes-anterieurs -> historique des soldes de clôture
// archivés à chaque changement d'année ("ancien solde"). Fondateur SEUL
// (l'Économe ne doit pas voir ce qu'il y avait avant sa prise de poste).
router.get('/soldes-anterieurs', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: "Seul le Fondateur peut consulter l'ancien solde" })
  }

  const { data, error } = await supabase
    .from('caisses_soldes_anterieurs')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .order('annee_scolaire', { ascending: false })

  if (error) {
    console.error('[caisses] erreur lecture soldes antérieurs:', error.message)
    return res.status(500).json({ error: "Erreur lors de la lecture de l'ancien solde" })
  }

  res.json({ soldes: data || [] })
})

export default router
