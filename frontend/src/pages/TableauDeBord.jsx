import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

export default function TableauDeBord() {
  const [lignes, setLignes] = useState([])
  const [resume, setResume] = useState(null)
  const [caisses, setCaisses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [bilan, caissesRes] = await Promise.all([api.getBilanEleves({}), api.getCaisses()])
      setLignes(bilan.lignes || [])
      setResume(bilan.resume || null)
      setCaisses(caissesRes.caisses || [])
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
  }, [])

  const soldeCaisse1 = caisses.find((c) => c.type_caisse === 'principale')?.solde || 0
  const soldeCaisse2 = caisses.find((c) => c.type_caisse === 'secondaire')?.solde || 0
  const nonAffectes = resume ? resume.total_eleves - (resume.affectes ?? 0) : 0

  const parNiveau = useMemo(() => {
    const map = new Map()
    for (const l of lignes) {
      const niveau = l.niveau || 'Non renseigné'
      if (!map.has(niveau)) {
        map.set(niveau, { niveau, effectif: 0, affectes: 0, total_du: 0, total_paye: 0, total_reste: 0, solde: 0 })
      }
      const g = map.get(niveau)
      g.effectif += 1
      if (l.affecte) g.affectes += 1
      g.total_du += l.total_du
      g.total_paye += l.total_paye
      g.total_reste += l.reste_a_payer
      if (l.statut_paiement === 'solde') g.solde += 1
    }
    return Array.from(map.values()).sort((a, b) => a.niveau.localeCompare(b.niveau))
  }, [lignes])

  return (
    <Layout title="Tableau de bord">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          📊 Tableau de bord
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">Vue d'ensemble de l'établissement, en temps réel.</p>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#9aa8a1] py-16 text-center">Chargement…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-8">
            <Carte label="Effectif total" valeur={resume?.total_eleves ?? 0} variante="orange" />
            <Carte label="Total actifs" valeur={resume?.total_actifs ?? 0} variante="orange" />
            <Carte label="Affectés" valeur={resume?.affectes ?? '—'} variante="blancVert" />
            <Carte label="Non affectés" valeur={resume ? nonAffectes : '—'} variante="blancVert" />

            <Carte label="Caisse 1 (principale)" valeur={formatFCFA(soldeCaisse1)} variante="vertDoux" />
            <Carte label="Caisse 2 (secondaire)" valeur={formatFCFA(soldeCaisse2)} variante="vertDoux" />

            <Carte label="Élèves en retard" valeur={resume?.en_retard ?? 0} variante="blancVert" />
            <Carte label="Élèves ayant soldé" valeur={resume?.solde ?? 0} variante="blancVert" />

            <Carte label="Somme encaissée" valeur={formatFCFA(resume?.total_paye)} variante="bleu" />
            <Carte label="Reste à payer" valeur={formatFCFA(resume?.total_reste)} variante="bleu" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 min-w-0">
              <h3 className="text-sm font-display font-bold text-vert-fonce mb-3">📋 Répartition par niveau</h3>
              <div className="bg-white rounded-2xl border border-[#e3ebe6] p-4 overflow-x-auto">
                {parNiveau.length === 0 ? (
                  <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune donnée disponible.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                        <th className="py-1.5 pr-2">Niveau</th>
                        <th className="py-1.5 pr-2 text-right">Effectif</th>
                        <th className="py-1.5 pr-2 text-right">Affectés</th>
                        <th className="py-1.5 pr-2 text-right">Soldés</th>
                        <th className="py-1.5 pr-2 text-right">Total dû</th>
                        <th className="py-1.5 pr-2 text-right">Total payé</th>
                        <th className="py-1.5 pr-2 text-right">Reste à payer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parNiveau.map((g) => (
                        <tr key={g.niveau} className="border-b border-[#f1f5f2]">
                          <td className="py-1.5 pr-2 font-medium text-vert-fonce whitespace-nowrap">{g.niveau}</td>
                          <td className="py-1.5 pr-2 text-right">{g.effectif}</td>
                          <td className="py-1.5 pr-2 text-right">{g.affectes}</td>
                          <td className="py-1.5 pr-2 text-right">{g.solde}</td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatFCFA(g.total_du)}</td>
                          <td className="py-1.5 pr-2 text-right whitespace-nowrap">{formatFCFA(g.total_paye)}</td>
                          <td className="py-1.5 pr-2 text-right font-semibold whitespace-nowrap">{formatFCFA(g.total_reste)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="min-w-0">
              <h3 className="text-sm font-display font-bold text-vert-fonce mb-3">💰 Résumé financier</h3>
              <div className="bg-white rounded-2xl border border-[#e3ebe6] p-4">
                <table className="w-full text-xs">
                  <tbody>
                    <tr className="border-b border-[#f1f5f2]">
                      <td className="py-2 pr-2 text-[#6b7d74]">Total dû</td>
                      <td className="py-2 text-right font-semibold text-vert-fonce whitespace-nowrap">
                        {formatFCFA((resume?.total_paye || 0) + (resume?.total_reste || 0))}
                      </td>
                    </tr>
                    <tr className="border-b border-[#f1f5f2]">
                      <td className="py-2 pr-2 text-[#6b7d74]">Total payé</td>
                      <td className="py-2 text-right font-semibold text-vert-fonce whitespace-nowrap">
                        {formatFCFA(resume?.total_paye)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#f1f5f2]">
                      <td className="py-2 pr-2 text-[#6b7d74]">Reste à payer</td>
                      <td className="py-2 text-right font-semibold text-orange whitespace-nowrap">
                        {formatFCFA(resume?.total_reste)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-2 text-[#6b7d74]">Taux de recouvrement</td>
                      <td className="py-2 text-right font-semibold text-vert-fonce whitespace-nowrap">
                        {(() => {
                          const total = (resume?.total_paye || 0) + (resume?.total_reste || 0)
                          const taux = total > 0 ? ((resume?.total_paye || 0) / total) * 100 : 0
                          return `${taux.toFixed(1)}%`
                        })()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}

const VARIANTES = {
  neutre: { fond: 'bg-white', label: 'text-[#9aa8a1]', valeur: 'text-vert-fonce' },
  // Effectif total / Total actifs
  orange: { fond: 'bg-orange', label: 'text-white/85', valeur: 'text-white' },
  // Affectés / Non affectés / Élèves en retard / Élèves ayant soldé
  blancVert: { fond: 'bg-white', label: 'text-vert-fonce/70', valeur: 'text-vert-fonce' },
  // Caisse 1 / Caisse 2 (vert doux, pas trop foncé)
  vertDoux: { fond: 'bg-vert-clair', label: 'text-white/85', valeur: 'text-white' },
  // Somme encaissée / Reste à payer
  bleu: { fond: 'bg-bleu', label: 'text-white/85', valeur: 'text-white' }
}

function Carte({ label, valeur, variante = 'neutre' }) {
  const style = VARIANTES[variante] || VARIANTES.neutre
  return (
    <div className={`rounded-xl border border-[#e3ebe6] px-4 py-2.5 inline-flex flex-col ${style.fond}`}>
      <div className={`text-[10px] font-semibold uppercase mb-0.5 whitespace-nowrap ${style.label}`}>{label}</div>
      <div className={`text-lg font-display font-bold whitespace-nowrap ${style.valeur}`}>{valeur}</div>
    </div>
  )
}
