import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { api } from '../lib/api.js'

export default function TypesDeFrais() {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [busyType, setBusyType] = useState(null) // id du type en cours d'ajout/suppression

  function load() {
    return api
      .getTypesFrais()
      .then(({ types }) => setTypes(types || []))
      .catch((err) => setMessage(err.message))
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

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
    try {
      await api.addTranche(typeId)
      await load()
    } catch (err) {
      setMessage(err.message || "Erreur lors de l'ajout")
    } finally {
      setBusyType(null)
    }
  }

  async function handleDelete(typeId, trancheId) {
    setBusyType(typeId)
    setMessage('')
    try {
      await api.deleteTranche(trancheId)
      await load()
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la suppression')
    } finally {
      setBusyType(null)
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const allTranches = types.flatMap((t) => t.tranches)
      await api.saveTranches(allTranches)
      setMessage('Enregistré ✅')
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la sauvegarde')
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
        onSave={handleSave}
        saving={saving}
      />

      {message && (
        <div className="mb-5 text-sm px-3 py-2 rounded-lg bg-teal-light text-teal inline-block">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {types.map((type) => {
            const sansEcheances = type.echeances_max === 0
            const atMax = type.tranches.length >= type.echeances_max
            return (
              <div key={type.id} className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
                <div className="flex items-center gap-2.5 mb-4">
                  <h3 className="text-base font-display font-bold text-vert-fonce">{type.nom}</h3>
                  {sansEcheances ? (
                    <span className="text-[11px] font-semibold bg-[#f6f8f7] text-[#6b7d74] px-2.5 py-1 rounded-full">
                      Payé en une fois
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold bg-teal-light text-teal px-2.5 py-1 rounded-full">
                      {type.echeances_max} échéances max
                    </span>
                  )}
                </div>

                {sansEcheances ? (
                  <p className="text-sm text-[#9aa8a1]">
                    Pas d'échéancier pour cette catégorie — le montant est réglé en totalité au moment du paiement.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2.5 mb-4">
                      {type.tranches.map((tr) => (
                        <div key={tr.id} className="flex items-center gap-3">
                          <input
                            value={tr.label}
                            onChange={(e) =>
                              setTrancheField(type.id, tr.id, 'label', e.target.value)
                            }
                            className="flex-1 px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
                          />
                          <input
                            type="date"
                            value={tr.date_echeance || ''}
                            onChange={(e) =>
                              setTrancheField(type.id, tr.id, 'date_echeance', e.target.value)
                            }
                            className="px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm focus:outline-none focus:border-teal"
                          />
                          <button
                            onClick={() => handleDelete(type.id, tr.id)}
                            disabled={busyType === type.id}
                            className="w-8 h-8 flex items-center justify-center rounded-lg border border-danger text-danger hover:bg-red-50 disabled:opacity-50"
                            title="Supprimer cette tranche"
                          >
                            🗑️
                          </button>
                        </div>
                      ))}
                      {type.tranches.length === 0 && (
                        <div className="text-sm text-[#9aa8a1]">Aucune tranche pour l'instant.</div>
                      )}
                    </div>

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
