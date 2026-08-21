import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Card, Field, TextInput, Select } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch {
    return d
  }
}

const LABEL_TYPE = {
  decaissement: 'Décaissement',
  reduction_scolarite: 'Réduction de scolarité',
  depense: 'Dépense',
  inscription_eleve: 'Inscription élève',
  autre: 'Autre'
}

const LABEL_STATUT = {
  en_attente: { texte: 'En attente', classe: 'bg-orange/10 text-orange border-orange/30' },
  approuvee: { texte: 'Approuvée', classe: 'bg-teal-light text-teal border-teal/30' },
  refusee: { texte: 'Refusée', classe: 'bg-red-50 text-red-600 border-red-100' }
}

function Badge({ statut }) {
  const info = LABEL_STATUT[statut] || LABEL_STATUT.en_attente
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${info.classe}`}>
      {info.texte}
    </span>
  )
}

export default function Autorisations() {
  const role = localStorage.getItem('econoschool_role')
  const [liste, setListe] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Formulaire de demande (Économe)
  const [typeAction, setTypeAction] = useState('decaissement')
  const [description, setDescription] = useState('')
  const [montant, setMontant] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const [succes, setSucces] = useState('')

  // Réponse en cours (Fondateur)
  const [traitementId, setTraitementId] = useState(null)
  const [noteRefus, setNoteRefus] = useState({}) // { [id]: texte }

  function charger() {
    setLoading(true)
    setError('')
    api
      .getAutorisations()
      .then(({ autorisations }) => setListe(autorisations || []))
      .catch((err) => setError(err.message || 'Erreur lors du chargement'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    charger()
  }, [])

  async function envoyerDemande(e) {
    e.preventDefault()
    if (!description.trim()) return
    setEnvoi(true)
    setError('')
    setSucces('')
    try {
      await api.demanderAutorisation({
        type_action: typeAction,
        description: description.trim(),
        montant: montant ? Number(montant) : undefined
      })
      setDescription('')
      setMontant('')
      setSucces('Demande envoyée au Fondateur.')
      charger()
    } catch (err) {
      setError(err.message || "Erreur lors de l'envoi de la demande")
    } finally {
      setEnvoi(false)
    }
  }

  async function repondre(id, statut) {
    setTraitementId(id)
    setError('')
    try {
      await api.repondreAutorisation(id, {
        statut,
        reponse_note: statut === 'refusee' ? noteRefus[id] || '' : undefined
      })
      charger()
    } catch (err) {
      setError(err.message || 'Erreur lors de la réponse')
    } finally {
      setTraitementId(null)
    }
  }

  const enAttente = liste.filter((a) => a.statut === 'en_attente')
  const traitees = liste.filter((a) => a.statut !== 'en_attente')

  return (
    <Layout title="Autorisations">
      <div className="mb-5">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          🔑 Autorisations
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          {role === 'fondateur'
            ? "Demandes ponctuelles de l'Économe pour une opération précise — valide ou refuse, avec trace."
            : "Demande une autorisation ponctuelle au Fondateur pour une opération précise (décaissement, réduction, dépense, inscription)."}
        </p>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {role !== 'fondateur' && (
        <Card title="Nouvelle demande" icon="✉️" className="max-w-xl mb-6">
          <form onSubmit={envoyerDemande} className="space-y-4">
            {succes && (
              <div className="text-sm text-teal bg-teal-light border border-teal/30 rounded-lg px-3 py-2">
                ✅ {succes}
              </div>
            )}
            <Field label="Type d'opération">
              <Select value={typeAction} onChange={(e) => setTypeAction(e.target.value)}>
                {Object.entries(LABEL_TYPE).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Description précise de l'opération *">
              <TextInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="ex : Décaisser 50 000 FCFA pour réparer la photocopieuse"
                required
              />
            </Field>
            <Field label="Montant concerné (optionnel, en FCFA)">
              <TextInput
                type="number"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="ex : 50000"
              />
            </Field>
            <button
              type="submit"
              disabled={envoi}
              className="w-full px-4 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
            >
              {envoi ? 'Envoi…' : "Envoyer la demande"}
            </button>
          </form>
        </Card>
      )}

      {loading ? (
        <p className="text-sm text-[#9aa8a1] py-10 text-center">Chargement…</p>
      ) : (
        <>
          {enAttente.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-vert-fonce mb-3">
                En attente ({enAttente.length})
              </h3>
              <div className="space-y-3">
                {enAttente.map((a) => (
                  <div key={a.id} className="bg-white rounded-2xl border border-orange/30 p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-[#6b7d74] uppercase tracking-wide">
                            {LABEL_TYPE[a.type_action] || 'Autre'}
                          </span>
                          <Badge statut={a.statut} />
                        </div>
                        <p className="text-sm text-vert-fonce font-medium">{a.description}</p>
                        <p className="text-xs text-[#9aa8a1] mt-1">
                          {a.econome_login} · {formatDate(a.created_at)}
                          {a.montant ? ` · ${formatFCFA(a.montant)}` : ''}
                        </p>
                      </div>
                      {role === 'fondateur' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => repondre(a.id, 'approuvee')}
                            disabled={traitementId === a.id}
                            className="px-3 py-1.5 rounded-lg bg-vert-fonce text-white text-xs font-semibold disabled:opacity-60"
                          >
                            ✅ Autoriser
                          </button>
                          <button
                            onClick={() => repondre(a.id, 'refusee')}
                            disabled={traitementId === a.id}
                            className="px-3 py-1.5 rounded-lg border border-danger text-danger text-xs font-semibold disabled:opacity-60"
                          >
                            ❌ Refuser
                          </button>
                        </div>
                      )}
                    </div>
                    {role === 'fondateur' && (
                      <input
                        value={noteRefus[a.id] || ''}
                        onChange={(e) => setNoteRefus((m) => ({ ...m, [a.id]: e.target.value }))}
                        placeholder="Motif si refus (optionnel)"
                        className="mt-3 w-full px-3 py-2 border border-[#e3ebe6] rounded-lg text-xs focus:outline-none focus:border-teal"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-vert-fonce mb-3">Historique</h3>
            {traitees.length === 0 ? (
              <p className="text-sm text-[#9aa8a1]">Aucune demande traitée pour l'instant.</p>
            ) : (
              <div className="bg-white rounded-2xl border border-[#e3ebe6] overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6] bg-[#f7faf8]">
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Description</th>
                      <th className="py-2.5 px-4">Demandeur</th>
                      <th className="py-2.5 px-4">Statut</th>
                      <th className="py-2.5 px-4">Répondu par</th>
                      <th className="py-2.5 px-4">Le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traitees.map((a) => (
                      <tr key={a.id} className="border-b border-[#f1f5f2] last:border-0">
                        <td className="py-2.5 px-4">{LABEL_TYPE[a.type_action] || 'Autre'}</td>
                        <td className="py-2.5 px-4">
                          {a.description}
                          {a.reponse_note && (
                            <div className="text-xs text-[#9aa8a1] mt-0.5">Motif : {a.reponse_note}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">{a.econome_login}</td>
                        <td className="py-2.5 px-4">
                          <Badge statut={a.statut} />
                        </td>
                        <td className="py-2.5 px-4">{a.decideur_login || '—'}</td>
                        <td className="py-2.5 px-4 text-xs text-[#9aa8a1]">{formatDate(a.decided_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
