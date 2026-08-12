import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { api } from '../lib/api.js'

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

  const tauxRecouvrement = resume?.total_du
    ? `${Math.round((resume.total_paye / resume.total_du) * 100)}%`
    : '—'

  const lignesEffectifs = [
    { label: 'Effectif total', valeur: resume?.total_eleves ?? 0 },
    { label: 'Affectés', valeur: affectes, accent: true },
    { label: 'Non affectés', valeur: nonAffectes },
    { label: 'Soldés', valeur: resume?.solde ?? 0, accent: true },
    { label: 'En retard', valeur: resume?.en_retard ?? 0, alerte: true }
  ]

  const lignesFinances = [
    { label: 'Total dû', valeur: formatFCFA(resume?.total_du) },
    { label: 'Total encaissé', valeur: formatFCFA(resume?.total_paye), accent: true },
    { label: 'Reste à percevoir', valeur: formatFCFA(resume?.total_reste), alerte: true },
    { label: 'Taux de recouvrement', valeur: tauxRecouvrement }
  ]

  const lignesCaisses = [
    { label: 'Caisse 1 (principale)', valeur: formatFCFA(soldeCaisse1), accent: true },
    { label: 'Caisse 2 (secondaire)', valeur: formatFCFA(soldeCaisse2), accent: true }
  ]

  async function handleExporter() {
    setExporting(true)
    setError('')
    try {
      await api.exporterRapport()
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
              disabled={exporting}
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
            {/* Effectifs / Finances / Caisses : 3 petits tableaux côte à côte,
                jamais très longs (5 lignes max chacun) pour rester lisibles
                sur tous les écrans, y compris mobile où ils s'empilent. */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <TableauResume titre="👥 Effectifs" lignes={lignesEffectifs} />
              <TableauResume titre="💰 Finances" lignes={lignesFinances} />
              <TableauResume titre="🏦 Caisses" lignes={lignesCaisses} />
            </div>

            {/* Répartition par niveau */}
            <SectionTitle>📋 Répartition par niveau</SectionTitle>
            <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
              {parNiveau.length === 0 ? (
                <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune donnée disponible.</p>
              ) : (
                <>
                  {/* Version tableau : à partir de md, écran assez large pour
                      afficher les 7 colonnes sans scroll horizontal. */}
                  <div className="hidden md:block overflow-x-auto">
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
                  </div>

                  {/* Version carte : en dessous de md (mobile / petits écrans),
                      pas de tableau large -> chaque niveau devient une
                      mini-carte à 2 colonnes, sans scroll gauche-droite. */}
                  <div className="md:hidden space-y-3">
                    {parNiveau.map((g) => (
                      <div key={g.niveau} className="rounded-xl border border-[#e3ebe6] p-3">
                        <div className="font-display font-bold text-vert-fonce text-sm mb-2">{g.niveau}</div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                          <LigneMini label="Effectif" valeur={g.effectif} />
                          <LigneMini label="Affectés" valeur={g.affectes} />
                          <LigneMini label="Soldés" valeur={g.solde} />
                          <LigneMini label="Total dû" valeur={formatFCFA(g.total_du)} />
                          <LigneMini label="Total payé" valeur={formatFCFA(g.total_paye)} />
                          <LigneMini label="Reste à payer" valeur={formatFCFA(g.total_reste)} accent />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
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

        <div className="grid grid-cols-3 gap-4 mb-4">
          <TableauImpression titre="Effectifs" lignes={lignesEffectifs} />
          <TableauImpression titre="Finances" lignes={lignesFinances} />
          <TableauImpression titre="Caisses" lignes={lignesCaisses} />
        </div>

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

// Petit tableau à 2 colonnes (libellé / valeur), volontairement court
// (jamais plus de 5 lignes) : lisible, joli et facile à imprimer, sans
// prendre toute la hauteur de l'écran comme le faisaient les grilles de
// cartes précédentes.
function TableauResume({ titre, lignes }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e3ebe6] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e3ebe6]">
        <h3 className="text-sm font-display font-bold text-vert-fonce">{titre}</h3>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {lignes.map((l) => (
            <tr key={l.label} className="border-b border-[#f1f5f2] last:border-b-0">
              <td className="py-2.5 px-4 text-[#6b7d74]">{l.label}</td>
              <td
                className={`py-2.5 px-4 text-right font-display font-bold ${
                  l.alerte ? 'text-orange' : l.accent ? 'text-teal' : 'text-vert-fonce'
                }`}
              >
                {l.valeur}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LigneMini({ label, valeur, accent }) {
  return (
    <div className="flex flex-col">
      <span className="text-[#9aa8a1] uppercase text-[10px] font-semibold">{label}</span>
      <span className={`font-semibold ${accent ? 'text-orange' : 'text-vert-fonce'}`}>{valeur}</span>
    </div>
  )
}

// Version imprimée du TableauResume : plus compacte, pas de bordure arrondie.
function TableauImpression({ titre, lignes }) {
  return (
    <div>
      <h4 className="text-xs font-display font-bold text-vert-fonce uppercase mb-1.5">{titre}</h4>
      <table className="w-full text-xs">
        <tbody>
          {lignes.map((l) => (
            <tr key={l.label} className="border-b border-[#f1f5f2]">
              <td className="py-1 pr-2 text-[#6b7d74]">{l.label}</td>
              <td className="py-1 text-right font-semibold">{l.valeur}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
