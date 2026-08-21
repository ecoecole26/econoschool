import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAnnee } from '../context/AnneeContext.jsx'

function formatDateAffichage(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function formatDateCourte(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function DateButoir() {
  const { anneeSelectionnee, estLectureSeule } = useAnnee()
  const [niveaux, setNiveaux] = useState([])
  const [global, setGlobal] = useState('')
  const [parNiveau, setParNiveau] = useState({})
  const [niveauSelectionne, setNiveauSelectionne] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingGlobal, setSavingGlobal] = useState(false)
  const [savingNiveau, setSavingNiveau] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [{ tarifs }, dates] = await Promise.all([
        api.getTarifs(anneeSelectionnee),
        api.getDatesButoir(anneeSelectionnee)
      ])
      const listeNiveaux = (tarifs || []).map((t) => t.niveau).filter(Boolean)
      setNiveaux(listeNiveaux)
      setGlobal(dates.global || '')
      setParNiveau(dates.parNiveau || {})
      // Pas de sélection par défaut : l'utilisateur choisit un niveau au clic.
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anneeSelectionnee])

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

  async function handleSaveNiveau(niveau, date) {
    setSavingNiveau(true)
    setMessage('')
    setError('')
    try {
      await api.saveDateButoirNiveau(niveau, date || null)
      setParNiveau((m) => ({ ...m, [niveau]: date || null }))
      setMessage(`Date butoir pour ${niveau} enregistrée ✅`)
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSavingNiveau(false)
    }
  }

  return (
    <Layout title="Date butoir">
      <PageHeader
        icon="📅"
        title="Date butoir"
        subtitle="Définit la date limite de paiement utilisée pour compter les élèves « en retard » (tableau de bord, retards, rapports)."
      />

      {estLectureSeule && (
        <div className="mb-5 text-xs font-medium text-orange bg-[#fff7ed] border border-orange/30 rounded-lg px-3 py-2">
          🔒 Année {anneeSelectionnee} : consultation uniquement, aucune modification possible.
        </div>
      )}

      {message && (
        <div className="mb-5 text-sm px-3 py-2 rounded-lg bg-teal-light text-teal inline-block">{message}</div>
      )}
      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          {/* Colonne gauche : carte globale, puis (si un niveau est
              sélectionné dans la carte de droite) l'édition de sa date
              juste en dessous — c'est ce bloc bas de colonne gauche qui
              apparaît/disparaît au clic sur un niveau. */}
          <div className="space-y-5">
            <Card title="Date butoir globale" icon="🌐">
              <p className="text-xs text-[#6b7d74] mb-3">
                S'applique à tous les niveaux sans date spécifique. Sans date définie, un élève est « en retard »
                dès qu'il n'a pas soldé.
              </p>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Date limite de paiement">
                    <TextInput
                      type="date"
                      value={global}
                      disabled={estLectureSeule}
                      onChange={(e) => setGlobal(e.target.value)}
                    />
                  </Field>
                </div>
                {!estLectureSeule && (
                  <button
                    onClick={handleSaveGlobal}
                    disabled={savingGlobal}
                    className="px-4 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60 mb-3 whitespace-nowrap"
                  >
                    {savingGlobal ? '…' : 'Enregistrer'}
                  </button>
                )}
              </div>
              {global && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[#6b7d74]">
                    En retard après le <strong>{formatDateAffichage(global)}</strong>.
                  </p>
                  {!estLectureSeule && (
                    <button
                      onClick={() => setGlobal('')}
                      disabled={savingGlobal}
                      className="text-xs text-[#6b7d74] underline"
                    >
                      Effacer
                    </button>
                  )}
                </div>
              )}
            </Card>

            {niveauSelectionne && (
              <Card title={`Date limite — ${niveauSelectionne}`} icon="🎓">
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="Date limite de paiement">
                      <TextInput
                        type="date"
                        value={parNiveau[niveauSelectionne] || ''}
                        disabled={estLectureSeule}
                        onChange={(e) =>
                          setParNiveau((m) => ({ ...m, [niveauSelectionne]: e.target.value }))
                        }
                      />
                    </Field>
                  </div>
                  {!estLectureSeule && (
                    <button
                      onClick={() => handleSaveNiveau(niveauSelectionne, parNiveau[niveauSelectionne])}
                      disabled={savingNiveau}
                      className="px-3.5 py-2.5 rounded-xl bg-vert-fonce text-white text-xs font-semibold disabled:opacity-60 mb-3 whitespace-nowrap"
                    >
                      {savingNiveau ? '…' : 'Enregistrer'}
                    </button>
                  )}
                </div>
                {parNiveau[niveauSelectionne] && !estLectureSeule && (
                  <button
                    onClick={() => handleSaveNiveau(niveauSelectionne, '')}
                    disabled={savingNiveau}
                    className="text-xs text-[#6b7d74] underline"
                  >
                    Effacer
                  </button>
                )}
              </Card>
            )}
          </div>

          {/* Colonne droite : uniquement le choix du niveau (pilules). Rien
              n'est sélectionné par défaut — la sélection se fait au clic,
              et la pilule choisie passe en vert (couleur du design),
              plus en bleu. */}
          <Card title="Dates par niveau (optionnel)" icon="🎓">
            <p className="text-xs text-[#6b7d74] mb-3">
              Remplace la date globale pour un niveau précis. Choisissez un niveau, puis définissez sa date
              ci-contre.
            </p>
            {niveaux.length === 0 ? (
              <p className="text-sm text-[#9aa8a1] py-4 text-center">
                Aucun niveau configuré — voir la page « Tarifs par niveau ».
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {niveaux.map((niveau) => {
                  const actif = niveau === niveauSelectionne
                  const date = parNiveau[niveau]
                  return (
                    <button
                      key={niveau}
                      type="button"
                      onClick={() => setNiveauSelectionne((sel) => (sel === niveau ? '' : niveau))}
                      className={`text-left px-3 py-2 rounded-xl border transition ${
                        actif
                          ? 'bg-vert-fonce border-vert-fonce text-white'
                          : 'bg-white border-[#d7e8de] text-vert-fonce hover:bg-teal-light'
                      }`}
                    >
                      <div className="text-sm font-semibold truncate">{niveau}</div>
                      <div className={`text-[11px] ${actif ? 'text-white/80' : 'text-[#9aa8a1]'}`}>
                        {date ? formatDateCourte(date) : 'Non défini'}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </Layout>
  )
}
