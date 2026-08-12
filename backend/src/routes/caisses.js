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

const router = Router()

// GET /api/caisses -> les caisses visibles pour le rôle connecté, chacune
// avec son journal.
router.get('/', requireAuth, async (req, res) => {
  const typesVisibles = caissesVisiblesPourRole(req.user.role)

  const { data: caisses, error: errCaisses } = await supabase
    .from('caisses')
    .select('*')
    .in('type_caisse', typesVisibles)

  if (errCaisses) {
    console.error('[caisses] erreur lecture caisses:', errCaisses.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des caisses' })
  }

  const { data: journal, error: errJournal } = await supabase
    .from('journal_caisse')
    .select('*')
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
  if (!roleAAccesOperation(req.user.role, type_operation)) {
    return res
      .status(403)
      .json({ error: 'Les sorties/retraits/dépenses sont réservés au Fondateur' })
  }
  const montantNum = Number(montant)
  if (!montantNum || montantNum <= 0) {
    return res.status(400).json({ error: 'Montant invalide' })
  }

  try {
    const { data: caisseActuelle } = await supabase
      .from('caisses')
      .select('statut')
      .eq('type_caisse', type_caisse)
      .maybeSingle()

    if (caisseActuelle && caisseActuelle.statut !== 'ouverte') {
      const libelleStatut = caisseActuelle.statut === 'pause' ? 'en pause' : 'fermée'
      return res.status(409).json({ error: `Cette caisse est ${libelleStatut} : ouvrez-la avant d'enregistrer un mouvement` })
    }

    const { mouvement, caisse } = await enregistrerMouvementCaisse({
      type_caisse,
      type_operation,
      montant: montantNum,
      libelle,
      date,
      etablissement: req.user.etablissement,
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
      etablissement: req.user.etablissement,
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
        etablissement: req.user.etablissement,
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

export default router
