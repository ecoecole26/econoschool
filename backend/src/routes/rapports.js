import { Router } from 'express'
import * as XLSX from 'xlsx'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { calculerBilanEleves } from './eleves.js'
import { TYPES_CAISSE, caissesVisiblesPourRole } from '../lib/caisse.js'

const router = Router()

const LABEL_CAISSE = { principale: 'Caisse' }

function feuilleAvecLargeurs(aoa, largeurs) {
  const feuille = XLSX.utils.aoa_to_sheet(aoa)
  feuille['!cols'] = largeurs.map((wch) => ({ wch }))
  return feuille
}

// GET /api/rapports/export
// Génère le classeur Excel du rapport général (page Rapports) : une feuille
// par section (Effectifs, Finances, Caisses, Répartition par niveau), avec
// les mêmes chiffres que ceux affichés à l'écran.
router.get('/export', requireAuth, async (req, res) => {
  try {
    const { lignes, resume } = await calculerBilanEleves({})

    const typesVisibles = caissesVisiblesPourRole(req.user.role)
    const { data: caissesData, error: errCaisses } = await supabase
      .from('caisses')
      .select('*')
      .in('type_caisse', typesVisibles)
    if (errCaisses) throw errCaisses
    const caisses = TYPES_CAISSE.filter((t) => typesVisibles.includes(t)).map(
      (type) => caissesData.find((c) => c.type_caisse === type) || { type_caisse: type, solde: 0 }
    )

    // --- Répartition par niveau (mêmes calculs que le frontend) ---
    const parNiveauMap = new Map()
    for (const l of lignes) {
      const niveau = l.niveau || 'Non renseigné'
      if (!parNiveauMap.has(niveau)) {
        parNiveauMap.set(niveau, {
          niveau,
          effectif: 0,
          affectes: 0,
          solde: 0,
          total_du: 0,
          total_paye: 0,
          total_reste: 0
        })
      }
      const g = parNiveauMap.get(niveau)
      g.effectif += 1
      if (l.affecte) g.affectes += 1
      if (l.statut_paiement === 'solde') g.solde += 1
      g.total_du += l.total_du
      g.total_paye += l.total_paye
      g.total_reste += l.reste_a_payer
    }
    const parNiveau = Array.from(parNiveauMap.values()).sort((a, b) => a.niveau.localeCompare(b.niveau))

    const affectes = lignes.filter((l) => l.affecte).length
    const nonAffectes = lignes.length - affectes
    const tauxRecouvrement = resume.total_du ? Math.round((resume.total_paye / resume.total_du) * 100) : null

    const workbook = XLSX.utils.book_new()

    // Feuille Effectifs
    XLSX.utils.book_append_sheet(
      workbook,
      feuilleAvecLargeurs(
        [
          ['Indicateur', 'Valeur'],
          ['Effectif total', resume.total_eleves],
          ['Affectés', affectes],
          ['Non affectés', nonAffectes],
          ['Soldés', resume.solde],
          ['En retard', resume.en_retard]
        ],
        [26, 16]
      ),
      'Effectifs'
    )

    // Feuille Finances
    XLSX.utils.book_append_sheet(
      workbook,
      feuilleAvecLargeurs(
        [
          ['Indicateur', 'Valeur (FCFA)'],
          ['Total dû', resume.total_du],
          ['Total encaissé', resume.total_paye],
          ['Reste à percevoir', resume.total_reste],
          ['Taux de recouvrement (%)', tauxRecouvrement ?? '—']
        ],
        [26, 18]
      ),
      'Finances'
    )

    // Feuille Caisses
    XLSX.utils.book_append_sheet(
      workbook,
      feuilleAvecLargeurs(
        [
          ['Caisse', 'Solde (FCFA)'],
          ...caisses.map((c) => [LABEL_CAISSE[c.type_caisse] || c.type_caisse, c.solde || 0])
        ],
        [26, 18]
      ),
      'Caisses'
    )

    // Feuille Répartition par niveau
    XLSX.utils.book_append_sheet(
      workbook,
      feuilleAvecLargeurs(
        [
          ['Niveau', 'Effectif', 'Affectés', 'Soldés', 'Total dû (FCFA)', 'Total payé (FCFA)', 'Reste à payer (FCFA)'],
          ...parNiveau.map((g) => [g.niveau, g.effectif, g.affectes, g.solde, g.total_du, g.total_paye, g.total_reste])
        ],
        [16, 12, 12, 10, 16, 16, 18]
      ),
      'Répartition par niveau'
    )

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', 'attachment; filename="rapport_general.xlsx"')
    res.send(buffer)
  } catch (err) {
    console.error('[rapports] erreur export:', err.message)
    res.status(500).json({ error: "Erreur lors de la génération du rapport" })
  }
})

export default router
