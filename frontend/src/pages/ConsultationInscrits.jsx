import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Field, TextInput, Select } from '../components/ui.jsx'
import { api } from '../lib/api.js'

// Niveaux standards de l'établissement (mêmes que la page Tarifs par niveau).
const NIVEAUX = ['6eme', '5eme', '4eme', '3eme', 'Seconde', 'Premiere', 'Terminale']

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function formatDateAujourdhui() {
  return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatDateFr(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR')
}

function premierJourDuMois() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function aujourdhuiISO() {
  return new Date().toISOString().slice(0, 10)
}

// Export CSV générique (même principe que Entrées / Dépenses) : ouvrable
// directement dans Excel, encodage UTF-8 avec BOM pour les accents.
function exporterCSV(entetes, rangees, nomFichier) {
  const csv = [entetes, ...rangees]
    .map((ligne) => ligne.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function EnTeteImpression({ etablissement, titre }) {
  return (
    <div className="flex items-center justify-between pb-3 border-b-2 border-vert-fonce mb-4">
      <div className="flex items-center gap-3">
        {etablissement?.logo_url ? (
          <img
            src={etablissement.logo_url}
            alt="Logo"
            className="w-14 h-14 rounded-full object-cover border border-[#e3ebe6]"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-teal-light flex items-center justify-center text-2xl">🏫</div>
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
      <div className="text-right">
        <h3 className="font-display font-bold text-vert-fonce text-lg">{titre}</h3>
        <span className="text-xs text-[#6b7d74]">Édité le {formatDateAujourdhui()}</span>
      </div>
    </div>
  )
}

const ONGLETS = [
  { id: 'tableau', label: 'Tableau', icon: '📋' },
  { id: 'statistiques', label: 'Statistiques', icon: '📊' },
  { id: 'tracabilite', label: 'Traçabilité', icon: '🔍' }
]

export default function ConsultationInscrits() {
  const [onglet, setOnglet] = useState('tableau')
  const [etablissement, setEtablissement] = useState(null)

  useEffect(() => {
    api
      .getEtablissement()
      .then(({ etablissement }) => setEtablissement(etablissement || null))
      .catch(() => {})
  }, [])

  return (
    <Layout title="Consultation Inscrits">
      <div className="mb-5">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          📁 Consultation Inscrits
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          Chaque encaissement validé sur la page Paiements apparaît automatiquement ici — aucune saisie
          séparée.
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-[#e3ebe6]">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`px-4 py-2.5 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition ${
              onglet === o.id
                ? 'border-vert-fonce text-vert-fonce'
                : 'border-transparent text-[#6b7d74] hover:text-vert-fonce'
            }`}
          >
            {o.icon} {o.label}
          </button>
        ))}
      </div>

      {onglet === 'tableau' && <OngletTableau etablissement={etablissement} />}
      {onglet === 'statistiques' && <OngletStatistiques etablissement={etablissement} />}
      {onglet === 'tracabilite' && <OngletTracabilite etablissement={etablissement} />}
    </Layout>
  )
}

// ============================================================
// Onglet 1 : Tableau — élèves inscrits (ayant payé) sur une période,
// filtrables par niveau/classe, imprimables.
// ============================================================
function OngletTableau({ etablissement }) {
  const [debut, setDebut] = useState(premierJourDuMois())
  const [fin, setFin] = useState(aujourdhuiISO())
  const [niveau, setNiveau] = useState('')
  const [classe, setClasse] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function charger(e) {
    if (e) e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const params = { debut, fin }
      if (niveau) params.niveau = niveau
      if (classe.trim()) params.classe = classe.trim()
      const res = await api.getConsultationInscrits(params)
      setData(res)
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleExporter() {
    if (!data || data.lignes.length === 0) return
    const entetes = ['Date', 'Matricule', 'Nom & Prénoms', 'Niveau', 'Classe', 'Somme encaissée (FCFA)', 'Type de paiement', 'Encaissé par']
    const rangees = data.lignes.map((l) => [
      formatDateFr(l.date_premier_paiement),
      l.matricule,
      l.nom,
      l.niveau,
      l.classe,
      l.montant,
      l.types_paiement,
      l.agents
    ])
    exporterCSV(entetes, rangees, `consultation_inscrits_${debut}_au_${fin}.csv`)
  }

  function handleImprimer() {
    window.print()
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 mb-5">
        <form onSubmit={charger} className="flex flex-wrap items-end gap-3">
          <Field label="Du">
            <TextInput type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required />
          </Field>
          <Field label="Au">
            <TextInput type="date" value={fin} onChange={(e) => setFin(e.target.value)} required />
          </Field>
          <Field label="Niveau">
            <Select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
              <option value="">Tous les niveaux</option>
              {NIVEAUX.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Classe">
            <TextInput value={classe} onChange={(e) => setClasse(e.target.value)} placeholder="ex : 6eme1" />
          </Field>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold h-fit disabled:opacity-60"
          >
            {loading ? 'Chargement…' : 'Filtrer'}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleExporter}
            disabled={!data || data.lignes.length === 0}
            className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 h-fit whitespace-nowrap"
          >
            ⬇️ Exporter CSV
          </button>
          <button
            type="button"
            onClick={handleImprimer}
            disabled={!data || data.lignes.length === 0}
            className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 h-fit whitespace-nowrap"
          >
            🖨️ Imprimer
          </button>
        </form>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <ResumeCarte label="Élèves inscrits (période)" valeur={data.total_eleves} />
          <ResumeCarte label="Montant encaissé" valeur={formatFCFA(data.total_montant)} couleur="text-teal" fond="bg-teal-light" />
          <ResumeCarte label="Période" valeur={`${formatDateFr(debut)} → ${formatDateFr(fin)}`} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Chargement…</p>
        ) : !data || data.lignes.length === 0 ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucun élève inscrit (payé) sur cette période.</p>
        ) : (
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Matricule</th>
                <th className="py-2 pr-2">Nom &amp; Prénoms</th>
                <th className="py-2 pr-2">Niveau</th>
                <th className="py-2 pr-2">Classe</th>
                <th className="py-2 pr-2 text-right">Somme encaissée</th>
                <th className="py-2 pr-2">Type de paiement</th>
                <th className="py-2 pr-2">Encaissé par</th>
              </tr>
            </thead>
            <tbody>
              {data.lignes.map((l) => (
                <tr key={l.eleve_id} className="border-b border-[#f1f5f2]">
                  <td className="py-2 pr-2 whitespace-nowrap">{formatDateFr(l.date_premier_paiement)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{l.matricule}</td>
                  <td className="py-2 pr-2 font-medium text-vert-fonce">{l.nom}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{l.niveau || '—'}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{l.classe || '—'}</td>
                  <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap">{formatFCFA(l.montant)}</td>
                  <td className="py-2 pr-2">{l.types_paiement}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{l.agents}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#e3ebe6] font-semibold text-vert-fonce">
                <td className="py-2 pr-2" colSpan={5}>
                  Total ({data.total_eleves} élève{data.total_eleves > 1 ? 's' : ''})
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatFCFA(data.total_montant)}</td>
                <td className="py-2 pr-2" colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Bloc dédié à l'impression, hors #app-shell (même principe que Rapports/Retards). */}
      <div className="hidden print:block p-6">
        <EnTeteImpression etablissement={etablissement} titre="Consultation Inscrits — Tableau" />
        <div className="flex gap-6 text-sm mb-4">
          <span>
            Période : <strong>{formatDateFr(debut)} au {formatDateFr(fin)}</strong>
          </span>
          {niveau && (
            <span>
              Niveau : <strong>{niveau}</strong>
            </span>
          )}
          {classe && (
            <span>
              Classe : <strong>{classe}</strong>
            </span>
          )}
          <span>
            Élèves inscrits : <strong>{data?.total_eleves ?? 0}</strong>
          </span>
          <span>
            Total encaissé : <strong>{formatFCFA(data?.total_montant)}</strong>
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
              <th className="py-1.5 pr-2">Date</th>
              <th className="py-1.5 pr-2">Matricule</th>
              <th className="py-1.5 pr-2">Nom &amp; Prénoms</th>
              <th className="py-1.5 pr-2">Niveau</th>
              <th className="py-1.5 pr-2">Classe</th>
              <th className="py-1.5 pr-2 text-right">Somme encaissée</th>
              <th className="py-1.5 pr-2">Type de paiement</th>
            </tr>
          </thead>
          <tbody>
            {(data?.lignes || []).map((l) => (
              <tr key={l.eleve_id} className="border-b border-[#f1f5f2]">
                <td className="py-1 pr-2">{formatDateFr(l.date_premier_paiement)}</td>
                <td className="py-1 pr-2">{l.matricule}</td>
                <td className="py-1 pr-2">{l.nom}</td>
                <td className="py-1 pr-2">{l.niveau || '—'}</td>
                <td className="py-1 pr-2">{l.classe || '—'}</td>
                <td className="py-1 pr-2 text-right font-semibold">{formatFCFA(l.montant)}</td>
                <td className="py-1 pr-2">{l.types_paiement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============================================================
// Onglet 2 : Statistiques — vue statique par niveau (indépendante de toute
// période) : inscrits/non-inscrits, sommes, pourcentages.
// ============================================================
function OngletStatistiques({ etablissement }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api
      .getConsultationInscritsStatistiques()
      .then(setData)
      .catch((err) => setError(err.message || 'Erreur lors du chargement'))
      .finally(() => setLoading(false))
  }, [])

  function handleExporter() {
    if (!data) return
    const entetes = ['Niveau', 'Effectif', 'Inscrits', '% Inscrits', 'Non inscrits', '% Non inscrits', 'Somme encaissée', 'Somme restante']
    const rangees = data.parNiveau.map((g) => [
      g.niveau,
      g.effectif,
      g.inscrits,
      `${g.pct_inscrits}%`,
      g.non_inscrits,
      `${g.pct_non_inscrits}%`,
      g.montant_encaisse,
      g.montant_restant
    ])
    rangees.push([
      'TOTAL',
      data.total.effectif,
      data.total.inscrits,
      `${data.total.pct_inscrits}%`,
      data.total.non_inscrits,
      `${data.total.pct_non_inscrits}%`,
      data.total.montant_encaisse,
      data.total.montant_restant
    ])
    exporterCSV(entetes, rangees, `statistiques_inscrits_${data.annee}.csv`)
  }

  function handleImprimer() {
    window.print()
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 mb-5">
        <button
          onClick={handleExporter}
          disabled={!data}
          className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40"
        >
          ⬇️ Exporter CSV
        </button>
        <button
          onClick={handleImprimer}
          disabled={!data}
          className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40"
        >
          🖨️ Imprimer
        </button>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          <ResumeCarte label="Effectif total" valeur={data.total.effectif} />
          <ResumeCarte
            label="Inscrits"
            valeur={`${data.total.inscrits} (${data.total.pct_inscrits}%)`}
            couleur="text-teal"
            fond="bg-teal-light"
          />
          <ResumeCarte
            label="Non inscrits"
            valeur={`${data.total.non_inscrits} (${data.total.pct_non_inscrits}%)`}
            couleur="text-orange"
            fond="bg-[#fff1e0]"
          />
          <ResumeCarte label="Somme encaissée" valeur={formatFCFA(data.total.montant_encaisse)} />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Chargement…</p>
        ) : !data || data.parNiveau.length === 0 ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune donnée disponible.</p>
        ) : (
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-2 pr-2">Niveau</th>
                <th className="py-2 pr-2 text-right">Effectif</th>
                <th className="py-2 pr-2 text-right">Inscrits</th>
                <th className="py-2 pr-2 text-right">Non inscrits</th>
                <th className="py-2 pr-2 text-right">Somme encaissée</th>
                <th className="py-2 pr-2 text-right">Somme restante</th>
              </tr>
            </thead>
            <tbody>
              {data.parNiveau.map((g) => (
                <tr key={g.niveau} className="border-b border-[#f1f5f2]">
                  <td className="py-2 pr-2 font-medium text-vert-fonce">{g.niveau}</td>
                  <td className="py-2 pr-2 text-right">{g.effectif}</td>
                  <td className="py-2 pr-2 text-right">
                    <span className="font-semibold text-teal">{g.inscrits}</span>
                    <span className="text-[#9aa8a1]"> ({g.pct_inscrits}%)</span>
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <span className="font-semibold text-orange">{g.non_inscrits}</span>
                    <span className="text-[#9aa8a1]"> ({g.pct_non_inscrits}%)</span>
                  </td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{formatFCFA(g.montant_encaisse)}</td>
                  <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap">{formatFCFA(g.montant_restant)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#e3ebe6] font-semibold text-vert-fonce">
                <td className="py-2 pr-2">TOTAL</td>
                <td className="py-2 pr-2 text-right">{data.total.effectif}</td>
                <td className="py-2 pr-2 text-right">
                  {data.total.inscrits} ({data.total.pct_inscrits}%)
                </td>
                <td className="py-2 pr-2 text-right">
                  {data.total.non_inscrits} ({data.total.pct_non_inscrits}%)
                </td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatFCFA(data.total.montant_encaisse)}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatFCFA(data.total.montant_restant)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="hidden print:block p-6">
        <EnTeteImpression etablissement={etablissement} titre="Consultation Inscrits — Statistiques" />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
              <th className="py-1.5 pr-2">Niveau</th>
              <th className="py-1.5 pr-2 text-right">Effectif</th>
              <th className="py-1.5 pr-2 text-right">Inscrits</th>
              <th className="py-1.5 pr-2 text-right">Non inscrits</th>
              <th className="py-1.5 pr-2 text-right">Somme encaissée</th>
              <th className="py-1.5 pr-2 text-right">Somme restante</th>
            </tr>
          </thead>
          <tbody>
            {(data?.parNiveau || []).map((g) => (
              <tr key={g.niveau} className="border-b border-[#f1f5f2]">
                <td className="py-1 pr-2">{g.niveau}</td>
                <td className="py-1 pr-2 text-right">{g.effectif}</td>
                <td className="py-1 pr-2 text-right">
                  {g.inscrits} ({g.pct_inscrits}%)
                </td>
                <td className="py-1 pr-2 text-right">
                  {g.non_inscrits} ({g.pct_non_inscrits}%)
                </td>
                <td className="py-1 pr-2 text-right">{formatFCFA(g.montant_encaisse)}</td>
                <td className="py-1 pr-2 text-right font-semibold">{formatFCFA(g.montant_restant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ============================================================
// Onglet 3 : Traçabilité — qui (Fondateur/Proviseur/Économe) a encaissé
// quels élèves, par niveau, et combien au total, sur une période choisie.
// ============================================================
function OngletTracabilite({ etablissement }) {
  const [debut, setDebut] = useState(premierJourDuMois())
  const [fin, setFin] = useState(aujourdhuiISO())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function charger(e) {
    if (e) e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.getConsultationInscritsTracabilite({ debut, fin })
      setData(res)
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleExporter() {
    if (!data || data.agents.length === 0) return
    const entetes = ['Agent (encaissé par)', ...data.niveaux, 'Total élèves', 'Montant encaissé', '% du total']
    const rangees = data.agents.map((a) => [a.agent, ...a.parNiveau, a.total_inscrits, a.montant, `${a.pct}%`])
    rangees.push([
      'TOTAL',
      ...data.niveaux.map(() => ''),
      data.total.eleves,
      data.total.montant,
      '100%'
    ])
    exporterCSV(entetes, rangees, `tracabilite_inscrits_${debut}_au_${fin}.csv`)
  }

  function handleImprimer() {
    window.print()
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 mb-5">
        <form onSubmit={charger} className="flex flex-wrap items-end gap-3">
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
            {loading ? 'Chargement…' : 'Filtrer'}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleExporter}
            disabled={!data || data.agents.length === 0}
            className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 h-fit whitespace-nowrap"
          >
            ⬇️ Exporter CSV
          </button>
          <button
            type="button"
            onClick={handleImprimer}
            disabled={!data || data.agents.length === 0}
            className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 h-fit whitespace-nowrap"
          >
            🖨️ Imprimer
          </button>
        </form>
      </div>

      <p className="text-xs text-[#7c948e] bg-[#fbfdfc] border border-dashed border-[#d7e6e1] rounded-xl px-4 py-2.5 mb-5">
        💡 Chaque paiement enregistre automatiquement le nom du compte connecté qui l'a encaissé
        (Fondateur, Proviseur ou Économe). Ce tableau permet de vérifier, à tout moment, que le total
        encaissé par chaque agent correspond bien à ce qui a été reversé en caisse.
      </p>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <ResumeCarte label="Agents actifs sur la période" valeur={data.agents.length} />
          <ResumeCarte label="Élèves encaissés" valeur={data.total.eleves} />
          <ResumeCarte
            label="Montant total encaissé"
            valeur={formatFCFA(data.total.montant)}
            couleur="text-teal"
            fond="bg-teal-light"
          />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Chargement…</p>
        ) : !data || data.agents.length === 0 ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucun encaissement sur cette période.</p>
        ) : (
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-2 pr-2">Agent (encaissé par)</th>
                {data.niveaux.map((n) => (
                  <th key={n} className="py-2 pr-2 text-right whitespace-nowrap">
                    {n}
                  </th>
                ))}
                <th className="py-2 pr-2 text-right">Total élèves</th>
                <th className="py-2 pr-2 text-right">Montant encaissé</th>
                <th className="py-2 pr-2 text-right">% du total</th>
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => (
                <tr key={a.agent} className="border-b border-[#f1f5f2]">
                  <td className="py-2 pr-2 font-medium text-vert-fonce whitespace-nowrap">{a.agent}</td>
                  {a.parNiveau.map((v, i) => (
                    <td key={data.niveaux[i]} className="py-2 pr-2 text-right">
                      {v}
                    </td>
                  ))}
                  <td className="py-2 pr-2 text-right font-semibold">{a.total_inscrits}</td>
                  <td className="py-2 pr-2 text-right font-semibold whitespace-nowrap">{formatFCFA(a.montant)}</td>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{a.pct}%</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#e3ebe6] font-semibold text-vert-fonce">
                <td className="py-2 pr-2" colSpan={1 + data.niveaux.length}>
                  Total
                </td>
                <td className="py-2 pr-2 text-right">{data.total.eleves}</td>
                <td className="py-2 pr-2 text-right whitespace-nowrap">{formatFCFA(data.total.montant)}</td>
                <td className="py-2 pr-2 text-right">100%</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div className="hidden print:block p-6">
        <EnTeteImpression etablissement={etablissement} titre="Consultation Inscrits — Traçabilité par agent" />
        <div className="flex gap-6 text-sm mb-4">
          <span>
            Période : <strong>{formatDateFr(debut)} au {formatDateFr(fin)}</strong>
          </span>
          <span>
            Montant total encaissé : <strong>{formatFCFA(data?.total.montant)}</strong>
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
              <th className="py-1.5 pr-2">Agent</th>
              {(data?.niveaux || []).map((n) => (
                <th key={n} className="py-1.5 pr-2 text-right">
                  {n}
                </th>
              ))}
              <th className="py-1.5 pr-2 text-right">Total</th>
              <th className="py-1.5 pr-2 text-right">Montant</th>
              <th className="py-1.5 pr-2 text-right">%</th>
            </tr>
          </thead>
          <tbody>
            {(data?.agents || []).map((a) => (
              <tr key={a.agent} className="border-b border-[#f1f5f2]">
                <td className="py-1 pr-2">{a.agent}</td>
                {a.parNiveau.map((v, i) => (
                  <td key={data.niveaux[i]} className="py-1 pr-2 text-right">
                    {v}
                  </td>
                ))}
                <td className="py-1 pr-2 text-right font-semibold">{a.total_inscrits}</td>
                <td className="py-1 pr-2 text-right font-semibold">{formatFCFA(a.montant)}</td>
                <td className="py-1 pr-2 text-right">{a.pct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function ResumeCarte({ label, valeur, couleur = 'text-vert-fonce', fond = 'bg-white' }) {
  return (
    <div className={`rounded-2xl border border-[#e3ebe6] p-4 ${fond}`}>
      <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">{label}</div>
      <div className={`text-xl font-display font-bold ${couleur}`}>{valeur}</div>
    </div>
  )
}
