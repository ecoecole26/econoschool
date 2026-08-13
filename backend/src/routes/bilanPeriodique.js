import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { TYPE_ENCAISSEMENT, TYPE_SORTIE, caissesVisiblesPourRole } from '../lib/caisse.js'
import { fetchTout } from '../lib/supabasePagination.js'

const router = Router()

// GET /api/bilan-periodique?debut=YYYY-MM-DD&fin=YYYY-MM-DD
// Résumé financier sur une période choisie : encaissements, dépenses (sorties)
// et solde actuel des caisses visibles pour le rôle connecté, avec le détail
// caisse par caisse.
router.get('/', requireAuth, async (req, res) => {
  const { debut, fin } = req.query
  if (!debut || !fin) {
    return res.status(400).json({ error: 'Les dates de début et de fin sont obligatoires' })
  }
  if (debut > fin) {
    return res.status(400).json({ error: 'La date de début doit précéder la date de fin' })
  }

  const typesVisibles = caissesVisiblesPourRole(req.user.role)

  // `journal_caisse.date` stocke un horodatage complet (date + heure), mais
  // `fin` arrive du frontend en simple "YYYY-MM-DD" (équivalent à minuit ce
  // jour-là) : sans correction, tout mouvement enregistré après minuit le
  // jour "fin" lui-même serait exclu du bilan. On étend donc "fin" jusqu'à
  // la toute fin de cette journée (23:59:59.999) avant de filtrer.
  const finJournee = `${fin}T23:59:59.999`

  try {
    const [{ data: caisses, error: errCaisses }, mouvements] = await Promise.all([
      supabase.from('caisses').select('*').in('type_caisse', typesVisibles),
      fetchTout((from, to) =>
        supabase
          .from('journal_caisse')
          .select('*')
          .in('caisse', typesVisibles)
          .eq('statut', 'validee')
          .gte('date', debut)
          .lte('date', finJournee)
          .order('date', { ascending: false })
          .range(from, to)
      )
    ])
    if (errCaisses) throw errCaisses

    const caissesCompletes = typesVisibles.map(
      (type) =>
        caisses.find((c) => c.type_caisse === type) || { type_caisse: type, solde: 0, statut: 'non_ouverte' }
    )

    const parCaisse = {}
    for (const type of typesVisibles) {
      const mvtsCaisse = (mouvements || []).filter((m) => m.caisse === type)
      parCaisse[type] = {
        solde_actuel: caissesCompletes.find((c) => c.type_caisse === type)?.solde || 0,
        encaissements: mvtsCaisse
          .filter((m) => m.type_operation === TYPE_ENCAISSEMENT)
          .reduce((s, m) => s + Number(m.montant), 0),
        depenses: mvtsCaisse
          .filter((m) => m.type_operation === TYPE_SORTIE)
          .reduce((s, m) => s + Number(m.montant), 0)
      }
    }

    // Caisse 1 (principale) reçoit une copie de chaque encaissement — c'est
    // volontaire (contrôle anti-fraude du Fondateur), mais ça veut dire que
    // Caisse 1 et Caisse 2 représentent souvent le MÊME argent vu sous deux
    // angles, pas deux sommes distinctes. Additionner les deux dans un total
    // doublerait artificiellement les montants réels. Quand la Caisse 1 est
    // visible (rôle Fondateur), elle sert donc de référence unique pour le
    // total — les autres rôles (Économe/Proviseur) ne voient de toute façon
    // que la Caisse 2 seule, donc pas de changement pour eux.
    const resume = parCaisse.principale
      ? {
          encaissements: parCaisse.principale.encaissements,
          depenses: parCaisse.principale.depenses,
          solde_actuel_total: parCaisse.principale.solde_actuel
        }
      : {
          encaissements: Object.values(parCaisse).reduce((s, c) => s + c.encaissements, 0),
          depenses: Object.values(parCaisse).reduce((s, c) => s + c.depenses, 0),
          solde_actuel_total: Object.values(parCaisse).reduce((s, c) => s + c.solde_actuel, 0)
        }
    resume.net_periode = resume.encaissements - resume.depenses

    res.json({ debut, fin, resume, parCaisse, mouvements: mouvements || [] })
  } catch (err) {
    console.error('[bilan-periodique] erreur:', err.message)
    res.status(500).json({ error: 'Erreur lors du calcul du bilan périodique' })
  }
})

export default router
