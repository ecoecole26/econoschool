import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatDateAffichage(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default function DateButoir() {
  const [niveaux, setNiveaux] = useState([])
  const [global, setGlobal] = useState('')
  const [parNiveau, setParNiveau] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savingNiveau, setSavingNiveau] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [{ tarifs }, dates] = await Promise.all([api.getTarifs(), api.getDatesButoir()])
      setNiveaux((tarifs || []).map((t) => t.niveau).filter(Boolean))
      setGlobal(dates.global || '')
      setParNiveau(dates.parNiveau || {})
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
  }, [])

  async function handleSaveGlobal() {
    setSavingGlobal(true)
    setMessage('')
    setError('')
    try {
      await api.saveDateButoirGlobale(global || null)
      setMessage('Date butoir globale enregistrée ✅')
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSavingGlobal(false)
    }
  }

  async function handleSaveNiveau(niveau) {
    setSavingNiveau(niveau)
    setMessage('')
    setError('')
    try {
      await api.saveDateButoirNiveau(niveau, parNiveau[niveau] || null)
      setMessage(`Date butoir pour ${niveau} enregistrée ✅`)
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSavingNiveau('')
    }
  }

  return (
    <Layout title="Date butoir">
      <PageHeader
        icon="📅"
        title="Date butoir"
        subtitle="Définit la date limite de paiement utilisée pour compter les élèves « en retard » (tableau de bord, retards, rapports)."
      />

      {message && (
        <div className="mb-5 text-sm px-3 py-2 rounded-lg bg-teal-light text-teal inline-block">{message}</div>
      )}
      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Card title="Date butoir globale" icon="🌐">
            <p className="text-xs text-[#6b7d74] mb-4">
              S'applique à tous les niveaux qui n'ont pas de date spécifique ci-contre. Tant qu'aucune date
              n'est définie, un élève est considéré « en retard » dès qu'il n'a pas soldé (comportement
              d'origine).
            </p>
            <Field label="Date limite de paiement">
              <TextInput type="date" value={global} onChange={(e) => setGlobal(e.target.value)} />
            </Field>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleSaveGlobal}
                disabled={savingGlobal}
                className="px-4 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
              >
                {savingGlobal ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {global && (
                <button
                  onClick={() => setGlobal('')}
                  disabled={savingGlobal}
                  className="text-xs text-[#6b7d74] underline"
                >
                  Effacer
                </button>
              )}
            </div>
            {global && (
              <p className="text-xs text-[#6b7d74] mt-3">
                Actuellement : élèves non soldés en retard après le <strong>{formatDateAffichage(global)}</strong>.
              </p>
            )}
          </Card>

          <Card title="Dates par niveau (optionnel)" icon="🎓">
            <p className="text-xs text-[#6b7d74] mb-4">
              Remplace la date globale pour un niveau précis. Laisser vide pour utiliser la date globale.
            </p>
            {niveaux.length === 0 ? (
              <p className="text-sm text-[#9aa8a1] py-4 text-center">
                Aucun niveau configuré — voir la page « Tarifs par niveau ».
              </p>
            ) : (
              <div className="space-y-3">
                {niveaux.map((niveau) => (
                  <div key={niveau} className="flex items-end gap-2">
                    <Field label={niveau}>
                      <TextInput
                        type="date"
                        value={parNiveau[niveau] || ''}
                        onChange={(e) =>
                          setParNiveau((m) => ({ ...m, [niveau]: e.target.value }))
                        }
                      />
                    </Field>
                    <button
                      onClick={() => handleSaveNiveau(niveau)}
                      disabled={savingNiveau === niveau}
                      className="px-3.5 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-xs font-semibold disabled:opacity-60 mb-3 whitespace-nowrap"
                    >
                      {savingNiveau === niveau ? '…' : 'Enregistrer'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </Layout>
  )
}
