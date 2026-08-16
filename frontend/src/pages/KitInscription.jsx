import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { api } from '../lib/api.js'

// Page dédiée au suivi des kits remis à l'inscription (paquet de rames, kit
// EPS, autres). Les cases sont cochées depuis la page Paiements ; ici on ne
// fait que CONSULTER l'état (lecture seule), filtrer par classe/recherche,
// et imprimer la liste classe par classe pour la remettre au Fondateur.
export default function KitInscription() {
  const [eleves, setEleves] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [classe, setClasse] = useState('')
  const [etablissement, setEtablissement] = useState(null)

  useEffect(() => {
    api
      .getEtablissement()
      .then(({ etablissement }) => setEtablissement(etablissement || null))
      .catch(() => {})
  }, [])

  function charger() {
    setLoading(true)
    setError('')
    api
      .getKitsEleves({ search: search.trim(), classe: classe.trim() })
      .then(({ eleves }) => setEleves(eleves || []))
      .catch((err) => setError(err.message || 'Erreur lors du chargement'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFiltrer(e) {
    e.preventDefault()
    charger()
  }

  return (
    <>
      <Layout title="Kit inscription">
        <div className="mb-6">
          <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
            🎒 Kit inscription
          </h2>
          <p className="text-sm text-[#6b7d74] mt-1">
            Suivi des kits remis à l'inscription (paquet de rames, kit EPS, autres), cochés depuis la
            page Paiements.
          </p>
        </div>

        <form onSubmit={handleFiltrer} className="flex flex-wrap justify-center gap-3 mb-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un élève (nom, matricule)…"
            className="w-full max-w-xs px-4 py-2.5 border border-[#d7e8de] rounded-xl text-sm bg-white focus:outline-none focus:border-teal"
          />
          <input
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            placeholder="Filtrer par classe (ex : 6eme1)"
            className="w-full max-w-xs px-4 py-2.5 border border-[#d7e8de] rounded-xl text-sm bg-white focus:outline-none focus:border-teal"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Chargement…' : 'Filtrer'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            disabled={eleves.length === 0}
            className="px-5 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 disabled:border-[#d7e8de] disabled:text-[#9aa8a1] flex items-center gap-1.5"
          >
            🖨️ Imprimer la liste
          </button>
        </form>

        {error && (
          <div className="max-w-lg mx-auto mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">
            {error}
          </div>
        )}

        <div className="bg-white rounded-2xl border border-[#e3ebe6] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e3ebe6] flex items-center justify-between">
            <span className="text-sm font-semibold text-vert-fonce">
              {eleves.length} élève{eleves.length > 1 ? 's' : ''}
              {classe ? ` · classe "${classe}"` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] bg-[#f6f8f7] border-b border-[#e3ebe6]">
                  <th className="py-2.5 px-4">Matricule</th>
                  <th className="py-2.5 px-4">Nom et prénoms</th>
                  <th className="py-2.5 px-4">Classe</th>
                  <th className="py-2.5 px-4 text-center">Rame</th>
                  <th className="py-2.5 px-4 text-center">Kit EPS</th>
                  <th className="py-2.5 px-4 text-center">Autres</th>
                </tr>
              </thead>
              <tbody>
                {eleves.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-[#9aa8a1]">
                      Aucun élève trouvé.
                    </td>
                  </tr>
                )}
                {eleves.map((e) => (
                  <tr key={e.id} className="border-b border-[#f1f5f2]">
                    <td className="py-2 px-4 text-[#6b7d74]">{e.matricule}</td>
                    <td className="py-2 px-4 font-medium text-vert-fonce">{e.nom}</td>
                    <td className="py-2 px-4">{e.classe || '—'}</td>
                    <td className="py-2 px-4 text-center">
                      <CaseEtat coche={e.kit_rame} />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <CaseEtat coche={e.kit_eps} />
                    </td>
                    <td className="py-2 px-4 text-center">
                      <CaseEtat coche={e.kit_autres} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Layout>

      {/* Bloc dédié à l'impression : invisible à l'écran, affiché uniquement sur la feuille
          imprimée. Placé hors de <Layout> (donc hors de #app-shell) comme les reçus/fiches
          imprimables des autres pages. */}
      <div className="hidden print:block">
        <ListeImpression eleves={eleves} classe={classe} etablissement={etablissement} />
      </div>
    </>
  )
}

function CaseEtat({ coche }) {
  return coche ? (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-teal-light text-teal font-bold">
      ✓
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[#f1f5f2] text-[#c3ccc7]">
      —
    </span>
  )
}

function ListeImpression({ eleves, classe, etablissement }) {
  return (
    <div className="text-sm text-[#132a1e] p-1">
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

      <div className="text-center mb-4">
        <span className="inline-block px-4 py-1 rounded-full bg-teal-light text-teal text-xs font-bold uppercase tracking-wide">
          Kits d'inscription {classe ? `— Classe ${classe}` : '— Toutes classes'}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-vert-fonce">
            <th className="py-1.5 pr-2">Matricule</th>
            <th className="py-1.5 pr-2">Nom et prénoms</th>
            <th className="py-1.5 pr-2">Classe</th>
            <th className="py-1.5 pr-2 text-center">Rame</th>
            <th className="py-1.5 pr-2 text-center">Kit EPS</th>
            <th className="py-1.5 pr-2 text-center">Autres</th>
          </tr>
        </thead>
        <tbody>
          {eleves.map((e) => (
            <tr key={e.id} className="border-b border-[#f1f5f2]">
              <td className="py-1.5 pr-2">{e.matricule}</td>
              <td className="py-1.5 pr-2">{e.nom}</td>
              <td className="py-1.5 pr-2">{e.classe || '—'}</td>
              <td className="py-1.5 pr-2 text-center">{e.kit_rame ? '✓' : '—'}</td>
              <td className="py-1.5 pr-2 text-center">{e.kit_eps ? '✓' : '—'}</td>
              <td className="py-1.5 pr-2 text-center">{e.kit_autres ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-center text-[10px] text-[#9aa8a1] mt-6 pt-3 border-t border-[#f1f5f2]">
        Édité le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} — EconoSchool
      </div>
    </div>
  )
}
