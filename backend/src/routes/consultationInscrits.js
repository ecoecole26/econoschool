import { Router } from 'express'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { fetchTout } from '../lib/supabasePagination.js'
import { calculerBilanEleves } from './eleves.js'
import { getAnneeCourante } from '../lib/anneeScolaire.js'

const router = Router()

// GET /api/consultation-inscrits?debut=&fin=&niveau=&classe=&annee=
//
// "Feuille des inscrits" : chaque paiement enregistré depuis la page
// Paiements y apparaît AUTOMATIQUEMENT (aucune saisie manuelle séparée),
// regroupé par élève sur la période choisie : date du 1er versement dans
// cette période, matricule, nom, niveau, classe, somme encaissée sur la
// période, et le ou les type(s) de paiement réglés (tranches).
router.get('/', requireAuth, async (req, res) => {
  const { debut, fin, niveau = '', classe = '' } = req.query
  if (!debut || !fin) {
    return res.status(400).json({ error: 'Les dates de début et de fin sont obligatoires' })
  }
  if (debut > fin) {
    return res.status(400).json({ error: 'La date de début doit précéder la date de fin' })
  }

  try {
    const annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
    if (!annee) return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement" })

    const paiements = await fetchTout((from, to) =>
      supabase
        .from('paiements')
        .select('*')
        .eq('code_etablissement', req.user.code_etablissement)
        .eq('annee_scolaire', annee)
        .gte('date_paiement', debut)
        .lte('date_paiement', fin)
        .order('date_paiement', { ascending: true })
        .range(from, to)
    )

    if (!paiements || paiements.length === 0) {
      return res.json({ debut, fin, annee, lignes: [], total_montant: 0, total_eleves: 0 })
    }

    const eleveIds = [...new Set(paiements.map((p) => p.eleve_id))]
    const { data: inscriptions, error: errInsc } = await supabase
      .from('inscriptions')
      .select('eleve_id, matricule, nom, niveau, classe')
      .eq('code_etablissement', req.user.code_etablissement)
      .eq('annee_scolaire', annee)
      .in('eleve_id', eleveIds)
    if (errInsc) throw errInsc

    const inscParEleve = new Map((inscriptions || []).map((i) => [i.eleve_id, i]))
    const parEleve = new Map()

    for (const p of paiements) {
      const insc = inscParEleve.get(p.eleve_id)
      if (!insc) continue
      if (niveau && insc.niveau !== niveau) continue
      if (classe && !(insc.classe || '').toLowerCase().includes(String(classe).toLowerCase())) continue

      if (!parEleve.has(p.eleve_id)) {
        parEleve.set(p.eleve_id, {
          eleve_id: p.eleve_id,
          matricule: insc.matricule,
          nom: insc.nom,
          niveau: insc.niveau,
          classe: insc.classe,
          date_premier_paiement: p.date_paiement,
          montant: 0,
          types_paiement: new Set(),
          agents: new Set()
        })
      }
      const ligne = parEleve.get(p.eleve_id)
      ligne.montant += Number(p.montant) || 0
      if (p.date_paiement < ligne.date_premier_paiement) ligne.date_premier_paiement = p.date_paiement
      if (p.tranche_libelle) ligne.types_paiement.add(p.tranche_libelle)
      if (p.valide_par) ligne.agents.add(p.valide_par)
    }

    const lignes = Array.from(parEleve.values())
      .map((l) => ({
        eleve_id: l.eleve_id,
        matricule: l.matricule,
        nom: l.nom,
        niveau: l.niveau,
        classe: l.classe,
        date_premier_paiement: l.date_premier_paiement,
        montant: l.montant,
        types_paiement: Array.from(l.types_paiement).join(', ') || '—',
        agents: Array.from(l.agents).join(', ') || '—'
      }))
      .sort((a, b) => (a.nom || '').localeCompare(b.nom || ''))

    const total_montant = lignes.reduce((s, l) => s + l.montant, 0)

    res.json({ debut, fin, annee, lignes, total_montant, total_eleves: lignes.length })
  } catch (err) {
    console.error('[consultation-inscrits] erreur tableau:', err.message)
    res.status(500).json({ error: 'Erreur lors du chargement de la consultation des inscrits' })
  }
})

// GET /api/consultation-inscrits/statistiques?annee=
//
// Vue statique PAR NIVEAU (indépendante de toute période) : effectif,
// inscrits (élèves ayant réglé au moins un paiement depuis le début de
// l'année) / non-inscrits, somme encaissée / restante, avec pourcentages.
// S'appuie sur calculerBilanEleves (même source que Rapports) pour rester
// rigoureusement cohérent avec le reste de l'application.
router.get('/statistiques', requireAuth, async (req, res) => {
  try {
    const annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
    if (!annee) return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement" })

    const { lignes, resume } = await calculerBilanEleves({ code_etablissement: req.user.code_etablissement, annee })

    const parNiveauMap = new Map()
    for (const l of lignes) {
      const niveau = l.niveau || 'Non renseigné'
      if (!parNiveauMap.has(niveau)) {
        parNiveauMap.set(niveau, { niveau, effectif: 0, inscrits: 0, montant_encaisse: 0, montant_restant: 0 })
      }
      const g = parNiveauMap.get(niveau)
      g.effectif += 1
      if (l.total_paye > 0) g.inscrits += 1
      g.montant_encaisse += l.total_paye
      g.montant_restant += l.reste_a_payer
    }

    const parNiveau = Array.from(parNiveauMap.values())
      .sort((a, b) => a.niveau.localeCompare(b.niveau))
      .map((g) => ({
        ...g,
        non_inscrits: g.effectif - g.inscrits,
        pct_inscrits: g.effectif ? Math.round((g.inscrits / g.effectif) * 100) : 0,
        pct_non_inscrits: g.effectif ? Math.round(((g.effectif - g.inscrits) / g.effectif) * 100) : 0
      }))

    const totalInscrits = lignes.filter((l) => l.total_paye > 0).length

    res.json({
      annee,
      parNiveau,
      total: {
        effectif: resume.total_eleves,
        inscrits: totalInscrits,
        non_inscrits: resume.total_eleves - totalInscrits,
        montant_encaisse: resume.total_paye,
        montant_restant: resume.total_reste,
        pct_inscrits: resume.total_eleves ? Math.round((totalInscrits / resume.total_eleves) * 100) : 0,
        pct_non_inscrits: resume.total_eleves
          ? Math.round(((resume.total_eleves - totalInscrits) / resume.total_eleves) * 100)
          : 0
      }
    })
  } catch (err) {
    console.error('[consultation-inscrits] erreur statistiques:', err.message)
    res.status(500).json({ error: 'Erreur lors du calcul des statistiques' })
  }
})

// GET /api/consultation-inscrits/tracabilite?debut=&fin=&annee=
//
// Traçabilité PAR AGENT (Fondateur / Proviseur / Économe) : `paiements.
// valide_par` enregistre déjà le nom complet du compte connecté au moment
// de l'encaissement (voir routes/paiements.js) — on regroupe simplement par
// cette valeur, avec la répartition par niveau et le montant total encaissé,
// pour répondre précisément au besoin : savoir qui a inscrit/encaissé quel
// élève et combien au total, et éviter tout écart de caisse inexpliqué.
router.get('/tracabilite', requireAuth, async (req, res) => {
  const { debut, fin } = req.query
  if (!debut || !fin) {
    return res.status(400).json({ error: 'Les dates de début et de fin sont obligatoires' })
  }
  if (debut > fin) {
    return res.status(400).json({ error: 'La date de début doit précéder la date de fin' })
  }

  try {
    const annee = req.query.annee || (await getAnneeCourante(req.user.code_etablissement))
    if (!annee) return res.status(400).json({ error: "Aucune année scolaire active pour cet établissement" })

    const paiements = await fetchTout((from, to) =>
      supabase
        .from('paiements')
        .select('*')
        .eq('code_etablissement', req.user.code_etablissement)
        .eq('annee_scolaire', annee)
        .gte('date_paiement', debut)
        .lte('date_paiement', fin)
        .range(from, to)
    )

    if (!paiements || paiements.length === 0) {
      return res.json({ debut, fin, niveaux: [], agents: [], total: { eleves: 0, montant: 0 } })
    }

    const eleveIds = [...new Set(paiements.map((p) => p.eleve_id))]
    const { data: inscriptions, error: errInsc } = await supabase
      .from('inscriptions')
      .select('eleve_id, niveau')
      .eq('code_etablissement', req.user.code_etablissement)
      .eq('annee_scolaire', annee)
      .in('eleve_id', eleveIds)
    if (errInsc) throw errInsc
    const niveauParEleve = new Map((inscriptions || []).map((i) => [i.eleve_id, i.niveau]))

    const niveauxSet = new Set()
    const agentsMap = new Map()
    const elevesComptesParAgent = new Map() // agent -> Set("eleve::niveau") pour ne compter chaque élève qu'une fois

    for (const p of paiements) {
      const agent = p.valide_par || 'Non renseigné'
      const niveau = niveauParEleve.get(p.eleve_id) || 'Non renseigné'
      niveauxSet.add(niveau)

      if (!agentsMap.has(agent)) {
        agentsMap.set(agent, { agent, parNiveau: {}, montant: 0 })
        elevesComptesParAgent.set(agent, new Set())
      }
      const ligneAgent = agentsMap.get(agent)
      ligneAgent.montant += Number(p.montant) || 0

      const dejaVus = elevesComptesParAgent.get(agent)
      const cle = `${p.eleve_id}::${niveau}`
      if (!dejaVus.has(cle)) {
        dejaVus.add(cle)
        ligneAgent.parNiveau[niveau] = (ligneAgent.parNiveau[niveau] || 0) + 1
      }
    }

    const niveaux = Array.from(niveauxSet).sort((a, b) => a.localeCompare(b))
    const montantTotal = paiements.reduce((s, p) => s + (Number(p.montant) || 0), 0)

    const agents = Array.from(agentsMap.values())
      .map((a) => ({
        agent: a.agent,
        parNiveau: niveaux.map((n) => a.parNiveau[n] || 0),
        total_inscrits: Object.values(a.parNiveau).reduce((s, n) => s + n, 0),
        montant: a.montant,
        pct: montantTotal ? Math.round((a.montant / montantTotal) * 100) : 0
      }))
      .sort((a, b) => b.montant - a.montant)

    res.json({
      debut,
      fin,
      niveaux,
      agents,
      total: {
        eleves: agents.reduce((s, a) => s + a.total_inscrits, 0),
        montant: montantTotal
      }
    })
  } catch (err) {
    console.error('[consultation-inscrits] erreur traçabilité:', err.message)
    res.status(500).json({ error: 'Erreur lors du calcul de la traçabilité' })
  }
})

export default router
