import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

const LABEL_CAISSE = { principale: 'Caisse' }

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function premierJourDuMois() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function aujourdhuiISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function BilanPeriodique() {
  const [debut, setDebut] = useState(premierJourDuMois())
  const [fin, setFin] = useState(aujourdhuiISO())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [genereLe, setGenereLe] = useState(null)
  const [exporting, setExporting] = useState(false)

  async function charger(e) {
    if (e) e.preventDefault()
    if (!debut || !fin) {
      setError('Merci de renseigner les deux dates (Du / Au).')
      return
    }
    if (debut > fin) {
      setError('La date de début doit précéder la date de fin.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await api.getBilanPeriodique(debut, fin)
      setData(res)
      // Confirmation visible que le clic a bien déclenché un nouveau calcul
      // (utile même quand le résultat est identique au précédent).
      setGenereLe(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }))
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
      setGenereLe(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleExporter() {
    if (!debut || !fin) return
    setExporting(true)
    setError('')
    try {
      await api.exporterBilanPeriodique(debut, fin)
    } catch (err) {
      setError(err.message || 'Erreur lors de la génération du fichier Excel')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Layout title="Bilan périodique">
      <PageHeader
        icon="📋"
        title="Bilan périodique"
        subtitle="Résumé financier sur une période choisie : encaissements, dépenses et solde des caisses."
      />

      <form onSubmit={charger} className="no-print flex flex-wrap items-end gap-3 mb-6">
        <Field label="Du">
          <TextInput type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required />
        </Field>
        <Field label="Au">
          <TextInput type="date" value={fin} onChange={(e) => setFin(e.target.value)} required />
        </Field>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold h-fit disabled:opacity-60"
        >
          {loading ? 'Chargement…' : 'Générer le bilan'}
        </button>
        {genereLe && !loading && (
          <span className="text-xs text-teal font-semibold h-fit pb-2.5">✓ Bilan généré à {genereLe}</span>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleExporter}
          disabled={exporting || !data}
          className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 h-fit whitespace-nowrap"
        >
          {exporting ? 'Génération…' : '📊 Télécharger en Excel'}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!data}
          className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 h-fit whitespace-nowrap"
        >
          🖨️ Imprimer
        </button>
      </form>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-[#9aa8a1] py-16 text-center">Chargement…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Carte label="Encaissements" valeur={formatFCFA(data.resume.encaissements)} variante="vertDoux" />
            <Carte label="Dépenses" valeur={formatFCFA(data.resume.depenses)} variante="orange" />
            <Carte
              label="Net sur la période"
              valeur={formatFCFA(data.resume.net_periode)}
              variante={data.resume.net_periode >= 0 ? 'vertDoux' : 'orange'}
            />
            <Carte label="Solde actuel (total)" valeur={formatFCFA(data.resume.solde_actuel_total)} variante="bleu" />
          </div>

          <h3 className="text-sm font-display font-bold text-vert-fonce mb-3">🏦 Détail de la caisse</h3>
          <div className="grid grid-cols-1 md:max-w-sm gap-4 mb-6">
            {Object.entries(data.parCaisse).map(([type, c]) => (
              <Card key={type} title={LABEL_CAISSE[type] || type}>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6b7d74]">Encaissements de la période</span>
                    <span className="font-semibold text-vert-fonce">{formatFCFA(c.encaissements)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6b7d74]">Dépenses de la période</span>
                    <span className="font-semibold text-orange">{formatFCFA(c.depenses)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#f1f5f2]">
                    <span className="text-[#6b7d74]">Solde actuel</span>
                    <span className="font-semibold text-vert-fonce">{formatFCFA(c.solde_actuel)}</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <h3 className="text-sm font-display font-bold text-vert-fonce mb-3">
            📜 Mouvements de la période ({data.mouvements.length})
          </h3>
          {/* Hauteur plafonnée + en-tête collant : le tableau reste
              consultable même avec beaucoup de mouvements, sans jamais
              étirer toute la page (scroll interne uniquement). */}
          <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
            {data.mouvements.length === 0 ? (
              <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucun mouvement sur cette période.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                      <th className="py-2 pr-2">Date</th>
                      <th className="py-2 pr-2">Libellé</th>
                      <th className="py-2 pr-2">Type</th>
                      <th className="py-2 pr-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mouvements.map((m) => (
                      <tr key={m.id} className="border-b border-[#f1f5f2]">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {new Date(m.date).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="py-2 pr-2 max-w-[220px] truncate" title={m.libelle || ''}>
                          {m.libelle || '—'}
                        </td>
                        <td className="py-2 pr-2">
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                              m.type_operation === 'Sortie' ? 'bg-[#fff1e0] text-orange' : 'bg-teal-light text-teal'
                            }`}
                          >
                            {m.type_operation}
                          </span>
                        </td>
                        <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap">
                          {formatFCFA(m.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </Layout>
  )
}

const VARIANTES = {
  vertDoux: { fond: 'bg-vert-clair', label: 'text-white/85', valeur: 'text-white' },
  orange: { fond: 'bg-orange', label: 'text-white/85', valeur: 'text-white' },
  bleu: { fond: 'bg-bleu', label: 'text-white/85', valeur: 'text-white' }
}

function Carte({ label, valeur, variante }) {
  const style = VARIANTES[variante]
  return (
    <div className={`rounded-2xl border border-[#e3ebe6] p-4 ${style.fond}`}>
      <div className={`text-[11px] font-semibold uppercase mb-1 ${style.label}`}>{label}</div>
      <div className={`text-xl font-display font-bold ${style.valeur}`}>{valeur}</div>
    </div>
  )
}
