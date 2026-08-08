import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import SegmentedTabs from '../components/SegmentedTabs.jsx'
import StatPill from '../components/StatPill.jsx'
import IconButton from '../components/IconButton.jsx'
import Modal from '../components/Modal.jsx'
import { api } from '../lib/api.js'

export default function Eleves() {
  const [tab, setTab] = useState('liste')
  const [search, setSearch] = useState('')
  const [classe, setClasse] = useState('')
  const [eleves, setEleves] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selected, setSelected] = useState(null) // élève ouvert dans la popup "voir"
  const [toDelete, setToDelete] = useState(null) // élève ciblé par la popup "supprimer"

  async function load() {
    setLoading(true)
    setError('')
    try {
      const { eleves, total } = await api.getEleves({ search, classe })
      setEleves(eleves || [])
      setTotal(total ?? (eleves || []).length)
    } catch (err) {
      setError(err.message || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSearchSubmit(e) {
    e.preventDefault()
    load()
  }

  const actifs = eleves.filter((e) => (e.statut || '').toLowerCase() === 'actif').length

  return (
    <Layout title="Élèves">
      {/* Barre de recherche */}
      <form onSubmit={handleSearchSubmit} className="flex justify-center gap-3 mb-8">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un élève (nom, matricule)…"
          className="w-full max-w-md px-4 py-2.5 border border-[#d7e8de] rounded-xl text-sm bg-white focus:outline-none focus:border-teal"
        />
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold"
        >
          Rechercher
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="text-lg font-display font-bold text-vert-fonce">
            Élèves — {classe ? classe : 'Toutes classes'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            options={[
              { value: 'liste', label: 'Liste' },
              { value: 'trombi', label: 'Trombinoscope' }
            ]}
          />
          <label className="text-sm text-[#6b7d74] flex items-center gap-2">
            Classe :
            <input
              value={classe}
              onChange={(e) => setClasse(e.target.value)}
              onBlur={load}
              placeholder="ex: 6eme1"
              className="px-3 py-1.5 border border-[#d7e8de] rounded-lg text-sm w-28"
            />
          </label>
          <button
            type="button"
            className="ml-auto px-4 py-1.5 rounded-lg bg-orange text-white text-sm font-semibold"
          >
            Imprimer
          </button>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          <StatPill label="Effectif total" value={total} variant="vert" />
          <StatPill label="Actifs" value={actifs} variant="teal" />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {tab === 'trombi' ? (
          <div className="text-center text-sm text-[#6b7d74] py-16">
            Pas de photos disponibles pour l'instant — le trombinoscope s'activera dès
            qu'une colonne photo sera ajoutée à la table élèves.
          </div>
        ) : loading ? (
          <div className="text-center text-sm text-[#6b7d74] py-16">Chargement…</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-2.5 pr-3">Matricule</th>
                <th className="py-2.5 pr-3">Nom</th>
                <th className="py-2.5 pr-3">Classe</th>
                <th className="py-2.5 pr-3">Statut</th>
                <th className="py-2.5 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {eleves.map((el) => (
                <tr key={el.id} className="border-b border-[#f1f5f2] hover:bg-[#f8fbf9]">
                  <td className="py-2.5 pr-3 font-medium text-vert-fonce">{el.matricule}</td>
                  <td className="py-2.5 pr-3">{el.nom}</td>
                  <td className="py-2.5 pr-3">{el.classe}</td>
                  <td className="py-2.5 pr-3">{el.statut}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex justify-end gap-2">
                      <IconButton variant="teal" title="Voir" onClick={() => setSelected(el)}>
                        👁️
                      </IconButton>
                      <IconButton variant="orange" title="Modifier">
                        ✏️
                      </IconButton>
                      <IconButton
                        variant="danger"
                        title="Supprimer"
                        onClick={() => setToDelete(el)}
                      >
                        🗑️
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
              {eleves.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-[#6b7d74]">
                    Aucun élève trouvé.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Popup "voir la fiche élève" */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Fiche élève">
        {selected && (
          <div className="space-y-2 text-sm">
            <Row label="Matricule" value={selected.matricule} />
            <Row label="Nom" value={selected.nom} />
            <Row label="Classe" value={selected.classe} />
            <Row label="Statut" value={selected.statut} />
          </div>
        )}
      </Modal>

      {/* Popup confirmation de suppression */}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cet élève ?"
        footer={
          <>
            <button
              onClick={() => setToDelete(null)}
              className="px-4 py-2 rounded-lg border border-[#d7e8de] text-sm font-semibold text-[#6b7d74]"
            >
              Annuler
            </button>
            <button
              onClick={() => setToDelete(null) /* branchement suppression réelle : étape suivante */}
              className="px-4 py-2 rounded-lg bg-danger text-white text-sm font-semibold"
            >
              Supprimer
            </button>
          </>
        }
      >
        {toDelete && (
          <p className="text-sm text-[#3d4f45]">
            Tu es sur le point de supprimer <b>{toDelete.nom}</b> ({toDelete.matricule}). Cette
            action est irréversible.
          </p>
        )}
      </Modal>
    </Layout>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between border-b border-[#f1f5f2] py-2">
      <span className="text-[#6b7d74]">{label}</span>
      <span className="font-medium text-vert-fonce">{value || '—'}</span>
    </div>
  )
}
