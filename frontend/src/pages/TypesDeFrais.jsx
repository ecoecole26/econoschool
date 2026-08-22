import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { api } from '../lib/api.js'
import { useAnnee } from '../context/AnneeContext.jsx'

export default function TypesDeFrais() {
  const { anneeSelectionnee, estLectureSeule } = useAnnee()
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageEstErreur, setMessageEstErreur] = useState(false)
  const [busyType, setBusyType] = useState(null) // id du type en cours d'ajout/suppression

  function load() {
    return api
      .getTypesFrais(anneeSelectionnee)
      .then(({ types }) => setTypes(types || []))
      .catch((err) => {
        setMessage(err.message)
        setMessageEstErreur(true)
      })
  }

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anneeSelectionnee])

  function setTrancheField(typeId, trancheId, field, value) {
    setTypes((list) =>
      list.map((t) =>
        t.id !== typeId
          ? t
          : {
              ...t,
              tranches: t.tranches.map((tr) =>
                tr.id === trancheId ? { ...tr, [field]: value } : tr
              )
            }
      )
    )
  }

  async function handleAdd(typeId) {
    setBusyType(typeId)
    setMessage('')
    setMessageEstErreur(false)
    try {
      await api.addTranche(typeId)
      await load()
    } catch (err) {
      setMessage(err.message || "Erreur lors de l'ajout")
      setMessageEstErreur(true)
    } finally {
      setBusyType(null)
    }
  }

  async function handleDelete(typeId, trancheId) {
    setBusyType(typeId)
    setMessage('')
    setMessageEstErreur(false)
    try {
      await api.deleteTranche(trancheId)
      await load()
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la suppression')
      setMessageEstErreur(true)
    } finally {
      setBusyType(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    setMessageEstErreur(false)
    try {
      const allTranches = types.flatMap((t) => t.tranches)
      await api.saveTranches(allTranches)
      setMessage('Enregistré ✅')
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la sauvegarde')
      setMessageEstErreur(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Types de frais">
      <PageHeader
        icon="🏷️"
        title="Types de frais"
        subtitle="Échéances et structures de paiement."
        onSave={estLectureSeule ? undefined : handleSave}
        saving={saving}
      />

      {estLectureSeule && (
        <div className="mb-5 text-xs font-medium text-orange bg-[#fff7ed] border border-orange/30 rounded-lg px-3 py-2">
          🔒 Année {anneeSelectionnee} : consultation uniquement, aucune modification possible.
        </div>
      )}

      {message && (
        <div
          className={`mb-5 text-sm px-3 py-2 rounded-lg inline-block ${
            messageEstErreur ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-teal-light text-teal'
          }`}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {types.map((type) => {
            const atMax = type.tranches.length >= type.echeances_max
            return (
              <div key={type.id} className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <h3 className="text-base font-display font-bold text-vert-fonce">{type.nom}</h3>
                  <span className="text-[11px] font-semibold bg-teal-light text-teal px-2.5 py-1 rounded-full">
                    {type.echeances_max} échéance{type.echeances_max > 1 ? 's' : ''} max
                  </span>
                </div>

                <div className="space-y-2.5 mb-4">
                  {type.tranches.map((tr) => (
                    <div key={tr.id} className="flex items-center gap-3">
                      <input
                        value={tr.label}
                        disabled={estLectureSeule}
                        onChange={(e) =>
                          setTrancheField(type.id, tr.id, 'label', e.target.value)
                        }
                        className="flex-1 px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal disabled:opacity-60 disabled:bg-[#f5f8f6]"
                      />
                      <input
                        type="date"
                        value={tr.date_echeance || ''}
                        disabled={estLectureSeule}
                        onChange={(e) =>
                          setTrancheField(type.id, tr.id, 'date_echeance', e.target.value)
                        }
                        className="px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal disabled:opacity-60 disabled:bg-[#f5f8f6]"
                      />
                      {!estLectureSeule && (
                        <button
                          onClick={() => handleDelete(type.id, tr.id)}
                          disabled={busyType === type.id}
                          className="w-8 h-8 flex items-center justify-center rounded-lg border border-danger text-danger hover:bg-red-50 disabled:opacity-50"
                          title="Supprimer cette tranche"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                  {type.tranches.length === 0 && (
                    <div className="text-sm text-[#9aa8a1]">Aucune tranche pour l'instant.</div>
                  )}
                </div>

                {!estLectureSeule && (
                  <>
                    <button
                      onClick={() => handleAdd(type.id)}
                      disabled={atMax || busyType === type.id}
                      className="px-4 py-2 rounded-lg border border-[#d7e8de] text-sm font-semibold text-vert-fonce hover:bg-teal-light disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      + Ajouter
                    </button>
                    {atMax && (
                      <span className="ml-3 text-xs text-[#9aa8a1]">Maximum atteint</span>
                    )}
                  </>
                )}
              </div>
            )
          })}

          {types.length === 0 && (
            <div className="col-span-full text-sm text-[#6b7d74] bg-white rounded-2xl border border-[#e3ebe6] p-8 text-center">
              Aucun type de frais trouvé — exécute la migration SQL{' '}
              <code>003_types_frais.sql</code> dans Supabase.
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
