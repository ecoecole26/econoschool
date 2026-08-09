import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import SegmentedTabs from '../components/SegmentedTabs.jsx'
import StatPill from '../components/StatPill.jsx'
import IconButton from '../components/IconButton.jsx'
import Modal from '../components/Modal.jsx'
import { api } from '../lib/api.js'

function Badge({ ok, labelOui, labelNon }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
        ok ? 'bg-teal-light text-teal' : 'bg-[#f1f5f2] text-[#6b7d74]'
      }`}
    >
      {ok ? labelOui : labelNon}
    </span>
  )
}

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
  const [editing, setEditing] = useState(null) // élève ouvert dans la popup "modifier"
  const [editForm, setEditForm] = useState({
    nom: '',
    classe: '',
    statut: 'Actif',
    niveau: '',
    affecte: false,
    redoublant: false
  })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState('')

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

  function openEdit(el) {
    setEditing(el)
    setEditForm({
      nom: el.nom || '',
      classe: el.classe || '',
      statut: el.statut || 'Actif',
      niveau: el.niveau || '',
      affecte: !!el.affecte,
      redoublant: !!el.redoublant
    })
    setEditError('')
  }

  async function handleSaveEdit() {
    setSaving(true)
    setEditError('')
    try {
      await api.updateEleve(editing.id, editForm)
      setEditing(null)
      load()
    } catch (err) {
      setEditError(err.message || 'Erreur lors de la mise à jour')
    } finally {
      setSaving(false)
    }
  }

  const actifs = eleves.filter((e) => (e.statut || '').toLowerCase() === 'actif').length

  return (
    <Layout title="Élèves">
      {/* Barre de recherche */}
      <form onSubmit={handleSearchSubmit} className="flex justify-center gap-3 mb-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un élève (nom, matricule)…"
          className="w-full max-w-sm px-4 py-2 border border-[#d7e8de] rounded-xl text-sm bg-white focus:outline-none focus:border-teal"
        />
        <button
          type="submit"
          className="px-5 py-2 rounded-xl bg-vert-fonce text-white text-sm font-semibold"
        >
          Rechercher
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
          <h2 className="text-lg font-display font-bold text-vert-fonce">
            Élèves — {classe ? classe : 'Toutes classes'}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-3">
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

        <div className="flex flex-wrap gap-2 mb-4">
          <StatPill label="Effectif total" value={total} variant="vert" />
          <StatPill label="Actifs" value={actifs} variant="teal" />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {tab === 'trombi' ? (
          loading ? (
            <div className="text-center text-sm text-[#6b7d74] py-16">Chargement…</div>
          ) : eleves.length === 0 ? (
            <div className="text-center text-sm text-[#6b7d74] py-16">Aucun élève trouvé.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              {eleves.map((el) => (
                <div
                  key={el.id}
                  className="text-center cursor-pointer group"
                  onClick={() => setSelected(el)}
                >
                  <div className="w-full aspect-square rounded-xl overflow-hidden bg-[#eef6f1] border border-[#e3ebe6] mb-1.5">
                    {el.photo_url ? (
                      <img src={el.photo_url} alt={el.nom} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl text-[#a9bcb2]">
                        🧑‍🎓
                      </div>
                    )}
                  </div>
                  <div className="text-xs font-semibold text-vert-fonce truncate">{el.nom}</div>
                  <div className="text-[11px] text-[#6b7d74] truncate">{el.classe}</div>
                </div>
              ))}
            </div>
          )
        ) : loading ? (
          <div className="text-center text-sm text-[#6b7d74] py-16">Chargement…</div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[24%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-1.5 pr-3">Matricule</th>
                <th className="py-1.5 pr-3">Nom</th>
                <th className="py-1.5 pr-3">Classe</th>
                <th className="py-1.5 pr-3">Niveau</th>
                <th className="py-1.5 pr-3">Statut</th>
                <th className="py-1.5 pr-3">Qualité</th>
                <th className="py-1.5 pr-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {eleves.map((el) => (
                <tr key={el.id} className="border-b border-[#f1f5f2] hover:bg-[#f8fbf9]">
                  <td className="py-1.5 pr-3 font-medium text-vert-fonce truncate">{el.matricule}</td>
                  <td className="py-1.5 pr-3 truncate">{el.nom}</td>
                  <td className="py-1.5 pr-3 truncate">{el.classe}</td>
                  <td className="py-1.5 pr-3 truncate">{el.niveau || '—'}</td>
                  <td className="py-1.5 pr-3">
                    <Badge ok={!!el.affecte} labelOui="Affecté" labelNon="Non affecté" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <Badge ok={!!el.redoublant} labelOui="Redoublant" labelNon="Non redoublant" />
                  </td>
                  <td className="py-1.5 pr-3">
                    <div className="flex justify-end gap-2">
                      <IconButton variant="teal" title="Voir" onClick={() => setSelected(el)}>
                        👁️
                      </IconButton>
                      <IconButton variant="orange" title="Modifier" onClick={() => openEdit(el)}>
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
                  <td colSpan={7} className="text-center py-10 text-[#6b7d74]">
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
            {selected.photo_url && (
              <img
                src={selected.photo_url}
                alt={selected.nom}
                className="w-24 h-24 rounded-xl object-cover mb-3 border border-[#e3ebe6]"
              />
            )}
            <Row label="Matricule" value={selected.matricule} />
            <Row label="Nom" value={selected.nom} />
            <Row label="Classe" value={selected.classe} />
            <Row label="Niveau" value={selected.niveau} />
            <Row label="Statut" value={selected.statut} />
            <Row label="Affectation" value={selected.affecte ? 'Affecté' : 'Non affecté'} />
            <Row label="Qualité" value={selected.redoublant ? 'Redoublant' : 'Non redoublant'} />
          </div>
        )}
      </Modal>

      {/* Popup "modifier l'élève" */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Modifier l'élève"
        footer={
          <>
            <button
              onClick={() => setEditing(null)}
              className="px-4 py-2 rounded-lg border border-[#d7e8de] text-sm font-semibold text-[#6b7d74]"
            >
              Annuler
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="text-xs text-[#6b7d74]">
              Matricule <span className="font-medium text-vert-fonce">{editing.matricule}</span>{' '}
              (non modifiable)
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">Nom</label>
              <input
                value={editForm.nom}
                onChange={(e) => setEditForm((f) => ({ ...f, nom: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">Classe</label>
                <input
                  value={editForm.classe}
                  onChange={(e) => setEditForm((f) => ({ ...f, classe: e.target.value }))}
                  className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">Niveau</label>
                <input
                  value={editForm.niveau}
                  onChange={(e) => setEditForm((f) => ({ ...f, niveau: e.target.value }))}
                  placeholder="ex: 6eme"
                  className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">Statut</label>
              <select
                value={editForm.statut}
                onChange={(e) => setEditForm((f) => ({ ...f, statut: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
              >
                <option>Actif</option>
                <option>Inactif</option>
                <option>Transféré</option>
                <option>Exclu</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">
                  Affectation
                </label>
                <select
                  value={editForm.affecte ? 'oui' : 'non'}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, affecte: e.target.value === 'oui' }))
                  }
                  className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
                >
                  <option value="oui">Affecté</option>
                  <option value="non">Non affecté</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">Qualité</label>
                <select
                  value={editForm.redoublant ? 'oui' : 'non'}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, redoublant: e.target.value === 'oui' }))
                  }
                  className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
                >
                  <option value="non">Non redoublant</option>
                  <option value="oui">Redoublant</option>
                </select>
              </div>
            </div>

            {editError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {editError}
              </div>
            )}
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
