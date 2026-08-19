import { Router } from 'express'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { TYPE_ENCAISSEMENT, TYPE_SORTIE, caissesVisiblesPourRole } from '../lib/caisse.js'
import { fetchTout } from '../lib/supabasePagination.js'

const router = Router()

const LABEL_CAISSE = { principale: 'Caisse' }

function feuilleAvecLargeurs(aoa, largeurs) {
  const feuille = XLSX.utils.aoa_to_sheet(aoa)
  feuille['!cols'] = largeurs.map((wch) => ({ wch }))
  return feuille
}

// Calcule le bilan (encaissements / dépenses / solde / mouvements) pour la
// période donnée. Factorisé pour être réutilisé par l'affichage (GET /)
// et par l'export Excel (GET /export).
async function calculerBilanPeriodique(req, debut, fin) {
  const typesVisibles = caissesVisiblesPourRole(req.user.role)
  const finJournee = `${fin}T23:59:59.999`

  const [{ data: caisses, error: errCaisses }, mouvements] = await Promise.all([
    supabase
      .from('caisses')
      .select('*')
      .eq('code_etablissement', req.user.code_etablissement)
      .in('type_caisse', typesVisibles),
    fetchTout((from, to) =>
      supabase
        .from('journal_caisse')
        .select('*')
        .eq('code_etablissement', req.user.code_etablissement)
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
    (type) => caisses.find((c) => c.type_caisse === type) || { type_caisse: type, solde: 0, statut: 'non_ouverte' }
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

  const resume = {
    encaissements: parCaisse.principale.encaissements,
    depenses: parCaisse.principale.depenses,
    solde_actuel_total: parCaisse.principale.solde_actuel
  }
  resume.net_periode = resume.encaissements - resume.depenses

  return { debut, fin, resume, parCaisse, mouvements: mouvements || [] }
}

// GET /api/bilan-periodique?debut=YYYY-MM-DD&fin=YYYY-MM-DD
// Résumé financier sur une période choisie, POUR MON ÉTABLISSEMENT :
// encaissements, dépenses (sorties) et solde actuel des caisses visibles
// pour le rôle connecté, avec le détail caisse par caisse.
router.get('/', requireAuth, async (req, res) => {
  const { debut, fin } = req.query
  if (!debut || !fin) {
    return res.status(400).json({ error: 'Les dates de début et de fin sont obligatoires' })
  }
  if (debut > fin) {
    return res.status(400).json({ error: 'La date de début doit précéder la date de fin' })
  }

  try {
    const bilan = await calculerBilanPeriodique(req, debut, fin)
    res.json(bilan)
  } catch (err) {
    console.error('[bilan-periodique] erreur:', err.message)
    res.status(500).json({ error: 'Erreur lors du calcul du bilan périodique' })
  }
})

// GET /api/bilan-periodique/export?debut=&fin=
// Génère un vrai classeur Excel (.xlsx) téléchargeable du bilan périodique :
// une feuille "Résumé" (encaissements/dépenses/net/solde) et une feuille
// "Mouvements" (le détail ligne par ligne, avec le libellé complet incluant
// désormais le nom/niveau/classe de l'élève).
router.get('/export', requireAuth, async (req, res) => {
  const { debut, fin } = req.query
  if (!debut || !fin) {
    return res.status(400).json({ error: 'Les dates de début et de fin sont obligatoires' })
  }
  if (debut > fin) {
    return res.status(400).json({ error: 'La date de début doit précéder la date de fin' })
  }

  try {
    const { resume, mouvements } = await calculerBilanPeriodique(req, debut, fin)

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      feuilleAvecLargeurs(
        [
          ['Bilan périodique', `Du ${debut} au ${fin}`],
          [],
          ['Indicateur', 'Montant (FCFA)'],
          ['Encaissements', resume.encaissements],
          ['Dépenses', resume.depenses],
          ['Net sur la période', resume.net_periode],
          ['Solde actuel (total)', resume.solde_actuel_total]
        ],
        [30, 20]
      ),
      'Résumé'
    )

    XLSX.utils.book_append_sheet(
      workbook,
      feuilleAvecLargeurs(
        [
          ['Date', 'Libellé', 'Type', 'Montant (FCFA)'],
          ...mouvements.map((m) => [
            new Date(m.date).toLocaleString('fr-FR'),
            m.libelle,
            m.type_operation === TYPE_ENCAISSEMENT ? 'Encaissement' : 'Dépense',
            m.montant
          ])
        ],
        [20, 55, 16, 16]
      ),
      'Mouvements'
    )

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="bilan_periodique_${debut}_au_${fin}.xlsx"`)
    res.send(buffer)
  } catch (err) {
    console.error('[bilan-periodique] erreur export:', err.message)
    res.status(500).json({ error: 'Erreur lors de la génération du fichier Excel' })
  }
})

export default router
