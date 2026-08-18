import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'

const router = Router()

// Un établissement par utilisateur connecté : on prend la ligne dont
// code_etablissement correspond au code dans le token (posé à la
// connexion). Chaque établissement a désormais sa propre ligne.

router.get('/', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('etablissements')
    .select('*')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (error) {
    console.error('[etablissement] erreur lecture:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la lecture de l\'établissement' })
  }

  res.json({ etablissement: data })
})

router.put('/', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut modifier ces paramètres' })
  }

  const payload = req.body || {}
  delete payload.id
  // Le code établissement ne peut jamais être changé depuis cette route :
  // le changer détacherait toutes les données déjà rattachées à ce code
  // (élèves, tarifs, paiements...). Il reste toujours celui du compte connecté.
  delete payload.code_etablissement
  // L'année scolaire active ne se change JAMAIS depuis ce formulaire général
  // (risque d'erreur) : uniquement via POST /api/etablissement/annees.
  delete payload.annee

  const { data: existing } = await supabase
    .from('etablissements')
    .select('id')
    .eq('code_etablissement', req.user.code_etablissement)
    .maybeSingle()

  if (!existing) {
    return res.status(404).json({ error: 'Établissement introuvable pour ce compte' })
  }

  const { data, error } = await supabase
    .from('etablissements')
    .update(payload)
    .eq('id', existing.id)
    .select()
    .single()

  if (error) {
    console.error('[etablissement] erreur sauvegarde:', error.message)
    return res.status(500).json({ error: 'Erreur lors de la sauvegarde' })
  }

  res.json({ etablissement: data })
})

// GET /api/etablissement/annees -> toutes les années scolaires pour
// lesquelles il existe déjà des données (inscriptions ou tarifs), plus
// systématiquement l'année active de l'établissement même si elle est
// encore vide. Triées de la plus récente à la plus ancienne, pour peupler
// le sélecteur d'année (façon EcoleWeb).
router.get('/annees', requireAuth, async (req, res) => {
  const code_etablissement = req.user.code_etablissement

  const [{ data: etab }, { data: insc, error: errInsc }, { data: tarifs, error: errTarifs }] =
    await Promise.all([
      supabase.from('etablissements').select('annee').eq('code_etablissement', code_etablissement).maybeSingle(),
      supabase.from('inscriptions').select('annee_scolaire').eq('code_etablissement', code_etablissement),
      supabase.from('tarifs').select('annee_scolaire').eq('code_etablissement', code_etablissement)
    ])

  if (errInsc || errTarifs) {
    console.error('[etablissement] erreur lecture années:', (errInsc || errTarifs).message)
    return res.status(500).json({ error: 'Erreur lors de la lecture des années disponibles' })
  }

  const annees = new Set()
  if (etab?.annee) annees.add(etab.annee)
  for (const i of insc || []) if (i.annee_scolaire) annees.add(i.annee_scolaire)
  for (const t of tarifs || []) if (t.annee_scolaire) annees.add(t.annee_scolaire)

  const liste = [...annees].sort((a, b) => b.localeCompare(a))

  res.json({ annees: liste, annee_courante: etab?.annee || null })
})

// POST /api/etablissement/annees  { annee: "2027-2028" }
// Démarre une NOUVELLE année scolaire (Fondateur uniquement) : l'année qui
// se termine reste intacte et consultable en lecture seule (rien n'est vidé
// ni déplacé), et l'établissement bascule sur la nouvelle année, qui devient
// la seule modifiable. Les tarifs de l'année qui se termine sont recopiés
// comme point de départ pour la nouvelle année (l'Économe les ajuste
// ensuite si besoin) — évite de repartir de zéro chaque rentrée.
router.post('/annees', requireAuth, async (req, res) => {
  if (req.user.role !== 'fondateur') {
    return res.status(403).json({ error: 'Seul le Fondateur peut démarrer une nouvelle année scolaire' })
  }

  const nouvelleAnnee = String(req.body?.annee || '').trim()
  if (!/^\d{4}-\d{4}$/.test(nouvelleAnnee)) {
    return res.status(400).json({ error: 'Format attendu : "2027-2028"' })
  }

  const code_etablissement = req.user.code_etablissement

  const { data: etab, error: errEtab } = await supabase
    .from('etablissements')
    .select('id, annee')
    .eq('code_etablissement', code_etablissement)
    .maybeSingle()

  if (errEtab || !etab) {
    return res.status(404).json({ error: 'Établissement introuvable' })
  }
  if (etab.annee === nouvelleAnnee) {
    return res.status(400).json({ error: `${nouvelleAnnee} est déjà l'année en cours` })
  }

  const { data: dejaExistante } = await supabase
    .from('tarifs')
    .select('id')
    .eq('code_etablissement', code_etablissement)
    .eq('annee_scolaire', nouvelleAnnee)
    .limit(1)
    .maybeSingle()

  if (dejaExistante) {
    return res.status(400).json({ error: `L'année ${nouvelleAnnee} existe déjà dans ce compte` })
  }

  // Recopie les tarifs de l'année qui se termine comme base de départ pour
  // la nouvelle année (sans écraser l'ancienne, qui reste intacte).
  if (etab.annee) {
    const { data: ancienTarifs, error: errLecture } = await supabase
      .from('tarifs')
      .select('niveau, ordre, examen, scolarite_annuelle, frais_inscription, frais_annexes, frais_examen')
      .eq('code_etablissement', code_etablissement)
      .eq('annee_scolaire', etab.annee)

    if (errLecture) {
      console.error('[etablissement] erreur lecture anciens tarifs:', errLecture.message)
      return res.status(500).json({ error: 'Erreur lors de la préparation de la nouvelle année' })
    }

    if (ancienTarifs?.length) {
      const { error: errCopie } = await supabase
        .from('tarifs')
        .insert(ancienTarifs.map((t) => ({ ...t, code_etablissement, annee_scolaire: nouvelleAnnee })))
      if (errCopie) {
        console.error('[etablissement] erreur copie tarifs nouvelle année:', errCopie.message)
        return res.status(500).json({ error: 'Erreur lors de la préparation de la nouvelle année' })
      }
    }
  }

  const { data, error } = await supabase
    .from('etablissements')
    .update({ annee: nouvelleAnnee })
    .eq('id', etab.id)
    .select()
    .single()

  if (error) {
    console.error('[etablissement] erreur bascule année:', error.message)
    return res.status(500).json({ error: "Erreur lors du changement d'année" })
  }

  res.json({ etablissement: data, annee_precedente: etab.annee })
})

export default router
