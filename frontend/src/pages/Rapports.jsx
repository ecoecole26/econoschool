import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { api } from '../lib/api.js'

const LABEL_CAISSE = { principale: 'Caisse 1', secondaire: 'Caisse 2' }

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function formatDateAujourdhui() {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function Rapports() {
  const [lignes, setLignes] = useState([])
  const [resume, setResume] = useState(null)
  const [caisses, setCaisses] = useState([])
  const [etablissement, setEtablissement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api
      .getEtablissement()
      .then(({ etablissement }) => setEtablissement(etablissement || null))
      .catch(() => {})
  }, [])

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

  const affectes = useMemo(() => lignes.filter((l) => l.affecte).length, [lignes])
  const nonAffectes = lignes.length - affectes

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

  const soldeCaisse1 = caisses.find((c) => c.type_caisse === 'principale')?.solde || 0
  const soldeCaisse2 = caisses.find((c) => c.type_caisse === 'secondaire')?.solde || 0

  async function handleExporter() {
    setExporting(true)
    setError('')
    try {
      await api.exporterBilanEleves({})
    } catch (err) {
      setError(err.message || "Erreur lors de l'export")
    } finally {
      setExporting(false)
    }
  }

  function handleImprimer() {
    window.print()
  }

  return (
    <>
      <Layout title="Rapports">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
              📈 Rapports
            </h2>
            <p className="text-sm text-[#6b7d74] mt-1">
              Synthèse générale de l'établissement : effectifs, finances et caisses.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExporter}
              disabled={exporting || lignes.length === 0}
              className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              📊 {exporting ? 'Export…' : 'Export Excel'}
            </button>
            <button
              onClick={handleImprimer}
              disabled={lignes.length === 0}
              className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5"
            >
              🖨️ Imprimer
            </button>
          </div>
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
            {/* Effectifs */}
            <SectionTitle>👥 Effectifs</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Carte label="Effectif total" valeur={resume?.total_eleves ?? 0} />
              <Carte label="Affectés" valeur={affectes} couleur="text-teal" fond="bg-teal-light" />
              <Carte label="Non affectés" valeur={nonAffectes} />
              <Carte
                label="Soldés / En retard"
                valeur={`${resume?.solde ?? 0} / ${resume?.en_retard ?? 0}`}
                couleur="text-orange"
                fond="bg-[#fff1e0]"
              />
            </div>

            {/* Finances */}
            <SectionTitle>💰 Finances</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Carte label="Total dû" valeur={formatFCFA(resume?.total_du)} />
              <Carte
                label="Total encaissé"
                valeur={formatFCFA(resume?.total_paye)}
                couleur="text-teal"
                fond="bg-teal-light"
              />
              <Carte
                label="Reste à percevoir"
                valeur={formatFCFA(resume?.total_reste)}
                couleur="text-orange"
                fond="bg-[#fff1e0]"
              />
              <Carte
                label="Taux de recouvrement"
                valeur={
                  resume?.total_du
                    ? `${Math.round((resume.total_paye / resume.total_du) * 100)}%`
                    : '—'
                }
              />
            </div>

            {/* Caisses */}
            <SectionTitle>🏦 Caisses</SectionTitle>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Carte label="Caisse 1 (principale)" valeur={formatFCFA(soldeCaisse1)} couleur="text-vert-fonce" fond="bg-teal-light" />
              <Carte label="Caisse 2 (secondaire)" valeur={formatFCFA(soldeCaisse2)} couleur="text-vert-fonce" fond="bg-teal-light" />
            </div>

            {/* Répartition par niveau */}
            <SectionTitle>📋 Répartition par niveau</SectionTitle>
            <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
              {parNiveau.length === 0 ? (
                <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune donnée disponible.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                      <th className="py-2 pr-2">Niveau</th>
                      <th className="py-2 pr-2 text-right">Effectif</th>
                      <th className="py-2 pr-2 text-right">Affectés</th>
                      <th className="py-2 pr-2 text-right">Soldés</th>
                      <th className="py-2 pr-2 text-right">Total dû</th>
                      <th className="py-2 pr-2 text-right">Total payé</th>
                      <th className="py-2 pr-2 text-right">Reste à payer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parNiveau.map((g) => (
                      <tr key={g.niveau} className="border-b border-[#f1f5f2]">
                        <td className="py-2 pr-2 font-medium text-vert-fonce">{g.niveau}</td>
                        <td className="py-2 pr-2 text-right">{g.effectif}</td>
                        <td className="py-2 pr-2 text-right">{g.affectes}</td>
                        <td className="py-2 pr-2 text-right">{g.solde}</td>
                        <td className="py-2 pr-2 text-right">{formatFCFA(g.total_du)}</td>
                        <td className="py-2 pr-2 text-right">{formatFCFA(g.total_paye)}</td>
                        <td className="py-2 pr-2 text-right font-semibold">{formatFCFA(g.total_reste)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </Layout>

      {/* Bloc dédié à l'impression : hors du #app-shell (voir Retards.jsx / Paiements.jsx
          pour l'explication du même principe). */}
      <div className="hidden print:block p-6">
        <div className="flex items-center gap-3 pb-3 border-b-2 border-vert-fonce mb-4">
          {etablissement?.logo_url ? (
            <img
              src={etablissement.logo_url}
              alt="Logo"
              className="w-14 h-14 rounded-full object-cover border border-[#e3ebe6]"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-teal-light flex items-center justify-center text-2xl">
              🏫
            </div>
          )}
          <div>
            <div className="font-display font-bold text-vert-fonce text-base">
              {etablissement?.nom || 'Établissement'}
            </div>
            <div className="text-xs text-[#6b7d74]">
              {[etablissement?.adresse, etablissement?.ville].filter(Boolean).join(', ')}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-vert-fonce text-lg">Rapport général</h3>
          <span className="text-xs text-[#6b7d74]">Édité le {formatDateAujourdhui()}</span>
        </div>

        {resume && (
          <div className="grid grid-cols-2 gap-2 text-sm mb-4">
            <span>Effectif total : <strong>{resume.total_eleves}</strong></span>
            <span>Affectés : <strong>{affectes}</strong> / Non affectés : <strong>{nonAffectes}</strong></span>
            <span>Soldés : <strong>{resume.solde}</strong> / En retard : <strong>{resume.en_retard}</strong></span>
            <span>Total dû : <strong>{formatFCFA(resume.total_du)}</strong></span>
            <span>Total encaissé : <strong>{formatFCFA(resume.total_paye)}</strong></span>
            <span>Reste à percevoir : <strong>{formatFCFA(resume.total_reste)}</strong></span>
            <span>Caisse 1 : <strong>{formatFCFA(soldeCaisse1)}</strong></span>
            <span>Caisse 2 : <strong>{formatFCFA(soldeCaisse2)}</strong></span>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
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
                <td className="py-1 pr-2">{g.niveau}</td>
                <td className="py-1 pr-2 text-right">{g.effectif}</td>
                <td className="py-1 pr-2 text-right">{g.affectes}</td>
                <td className="py-1 pr-2 text-right">{g.solde}</td>
                <td className="py-1 pr-2 text-right">{formatFCFA(g.total_du)}</td>
                <td className="py-1 pr-2 text-right">{formatFCFA(g.total_paye)}</td>
                <td className="py-1 pr-2 text-right font-semibold">{formatFCFA(g.total_reste)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function SectionTitle({ children }) {
  return <h3 className="text-sm font-display font-bold text-vert-fonce mb-3">{children}</h3>
}

function Carte({ label, valeur, couleur = 'text-vert-fonce', fond = 'bg-white' }) {
  return (
    <div className={`rounded-2xl border border-[#e3ebe6] p-4 ${fond}`}>
      <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">{label}</div>
      <div className={`text-xl font-display font-bold ${couleur}`}>{valeur}</div>
    </div>
  )
}
