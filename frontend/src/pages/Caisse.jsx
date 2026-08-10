import { useEffect, useMemo, useState } from 'react'
import Layout from '../components/Layout.jsx'
import Modal from '../components/Modal.jsx'
import { Field, Select, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} F`
}

const LABEL_CAISSE = { caisse_1: 'Caisse 1', caisse_2: 'Caisse 2' }
const LABEL_OPERATION = { entree: 'Entrée', sortie: 'Sortie', reduction: 'Réduction', paiement_auto: 'Paiement (auto)' }
const COULEUR_OPERATION = {
  entree: 'bg-[#dbeafe] text-[#2563eb]',
  paiement_auto: 'bg-teal-light text-teal',
  sortie: 'bg-rose-light text-rose',
  reduction: 'bg-amber-100 text-amber-700'
}

export default function Caisse() {
  const role = localStorage.getItem('econoschool_role')

  const [caisses, setCaisses] = useState([])
  const [journal, setJournal] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOperation, setModalOperation] = useState(null) // { type_caisse, type_operation } | null
  const [form, setForm] = useState({ libelle: '', montant: '' })
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [confirmationEnAttente, setConfirmationEnAttente] = useState(false)

  const [traitementId, setTraitementId] = useState(null)

  function load() {
    return api.getCaisses().then(({ caisses, journal }) => {
      setCaisses(caisses || [])
      setJournal(journal || [])
    })
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const enAttente = useMemo(() => journal.filter((m) => m.statut === 'en_attente'), [journal])

  function ouvrirOperation(type_caisse, type_operation) {
    setForm({ libelle: '', montant: '' })
    setModalError('')
    setConfirmationEnAttente(false)
    setModalOperation({ type_caisse, type_operation })
  }

  async function handleSaveOperation() {
    setSaving(true)
    setModalError('')
    try {
      const { enAttente: creeEnAttente } = await api.ajouterMouvementCaisse({
        type_caisse: modalOperation.type_caisse,
        type_operation: modalOperation.type_operation,
        libelle: form.libelle,
        montant: form.montant
      })
      await load()
      if (creeEnAttente) {
        setConfirmationEnAttente(true)
      } else {
        setModalOperation(null)
      }
    } catch (err) {
      setModalError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleValider(id) {
    setTraitementId(id)
    setError('')
    try {
      await api.validerMouvementCaisse(id)
      await load()
    } catch (err) {
      setError(err.message || 'Erreur lors de la validation')
    } finally {
      setTraitementId(null)
    }
  }

  async function handleRejeter(id) {
    setTraitementId(id)
    setError('')
    try {
      await api.rejeterMouvementCaisse(id)
      await load()
    } catch (err) {
      setError(err.message || 'Erreur lors du rejet')
    } finally {
      setTraitementId(null)
    }
  }

  return (
    <Layout title="Caisse">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          🗃️ Caisse
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          {role === 'fondateur'
            ? 'Caisse 1 (réservée) et Caisse 2 (opérations courantes).'
            : 'Caisse 2 — les réductions que tu saisis sont soumises à validation du Fondateur.'}
        </p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {caisses.map((c) => (
              <CarteCaisse
                key={c.type_caisse}
                caisse={c}
                role={role}
                onOperation={(type_operation) => ouvrirOperation(c.type_caisse, type_operation)}
              />
            ))}
          </div>

          {role === 'fondateur' && enAttente.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 p-5">
              <h4 className="text-base font-display font-bold text-vert-fonce flex items-center gap-2 mb-4">
                ⏳ Réductions en attente de validation
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {enAttente.length}
                </span>
              </h4>
              <div className="space-y-2">
                {enAttente.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-3 border border-amber-100 bg-amber-50 rounded-xl px-4 py-3"
                  >
                    <div>
                      <div className="text-sm font-semibold text-vert-fonce">
                        {formatFCFA(m.montant)} — {m.libelle || '—'}
                      </div>
                      <div className="text-xs text-[#6b7d74]">
                        {LABEL_CAISSE[m.caisse]} · demandé par {m.demande_par || '—'} · {m.date}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleRejeter(m.id)}
                        disabled={traitementId === m.id}
                        className="px-3 py-1.5 rounded-lg border border-[#d7e8de] text-xs font-semibold text-[#6b7d74] disabled:opacity-60"
                      >
                        Rejeter
                      </button>
                      <button
                        onClick={() => handleValider(m.id)}
                        disabled={traitementId === m.id}
                        className="px-3 py-1.5 rounded-lg bg-vert-fonce text-white text-xs font-semibold disabled:opacity-60"
                      >
                        {traitementId === m.id ? '…' : 'Valider'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
            <h4 className="text-base font-display font-bold text-vert-fonce flex items-center gap-2 mb-4">
              📒 Journal des mouvements
            </h4>
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[26%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Caisse</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Libellé</th>
                  <th className="py-2 pr-2 text-right">Montant</th>
                  <th className="py-2 pr-2">Statut</th>
                  <th className="py-2 pr-2">Par</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((m) => (
                  <tr key={m.id} className="border-b border-[#f1f5f2]">
                    <td className="py-2 pr-2 truncate">{m.date}</td>
                    <td className="py-2 pr-2 truncate">{LABEL_CAISSE[m.caisse] || m.caisse}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COULEUR_OPERATION[m.type_operation] || ''}`}
                      >
                        {LABEL_OPERATION[m.type_operation] || m.type_operation}
                      </span>
                    </td>
                    <td className="py-2 pr-2 truncate">{m.libelle || '—'}</td>
                    <td className="py-2 pr-2 text-right font-medium">{formatFCFA(m.montant)}</td>
                    <td className="py-2 pr-2">
                      {m.statut === 'en_attente' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          En attente
                        </span>
                      )}
                      {m.statut === 'validee' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-light text-teal">
                          Validée
                        </span>
                      )}
                      {m.statut === 'rejetee' && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-light text-rose">
                          Rejetée
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 truncate">{m.valide_par || m.demande_par || '—'}</td>
                  </tr>
                ))}
                {journal.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-[#6b7d74]">
                      Aucun mouvement pour l'instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Popup nouvelle opération */}
      <Modal
        open={!!modalOperation}
        onClose={() => setModalOperation(null)}
        title={
          modalOperation
            ? `${LABEL_OPERATION[modalOperation.type_operation]} — ${LABEL_CAISSE[modalOperation.type_caisse]}`
            : ''
        }
        footer={
          confirmationEnAttente ? (
            <button
              onClick={() => setModalOperation(null)}
              className="px-4 py-2 rounded-lg bg-vert-fonce text-white text-sm font-semibold"
            >
              Fermer
            </button>
          ) : (
            <>
              <button
                onClick={() => setModalOperation(null)}
                className="px-4 py-2 rounded-lg border border-[#d7e8de] text-sm font-semibold text-[#6b7d74]"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveOperation}
                disabled={saving || !form.montant}
                className="px-4 py-2 rounded-lg bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : 'Valider'}
              </button>
            </>
          )
        }
      >
        {confirmationEnAttente ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-3">
            ⏳ Cette réduction a été enregistrée en attente de validation du Fondateur. Elle n'impacte
            pas encore le solde de la caisse.
          </div>
        ) : (
          <>
            <Field label="Libellé">
              <TextInput
                value={form.libelle}
                onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
                placeholder="Ex: Achat fournitures, Réduction frais scolarité..."
              />
            </Field>
            <Field label="Montant (FCFA)" required>
              <TextInput
                type="number"
                value={form.montant}
                onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))}
              />
            </Field>
            {modalOperation?.type_operation === 'reduction' && role !== 'fondateur' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-1">
                Cette réduction sera soumise à la validation du Fondateur avant d'impacter le solde.
              </p>
            )}
            {modalError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {modalError}
              </div>
            )}
          </>
        )}
      </Modal>
    </Layout>
  )
}

function CarteCaisse({ caisse, role, onOperation }) {
  const peutSortie = role === 'fondateur'

  return (
    <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs font-semibold text-[#9aa8a1] uppercase mb-1">
            {LABEL_CAISSE[caisse.type_caisse]}
          </div>
          <div className="text-2xl font-display font-bold text-vert-fonce">
            {formatFCFA(caisse.solde)}
          </div>
        </div>
        {caisse.statut === 'non_ouverte' && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#f1f5f2] text-[#6b7d74]">
            Pas encore de mouvement
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onOperation('entree')}
          className="px-3 py-1.5 rounded-lg bg-[#2563eb] text-white text-xs font-semibold"
        >
          + Entrée
        </button>
        {peutSortie && (
          <button
            onClick={() => onOperation('sortie')}
            className="px-3 py-1.5 rounded-lg bg-danger text-white text-xs font-semibold"
          >
            − Sortie
          </button>
        )}
        <button
          onClick={() => onOperation('reduction')}
          className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold"
        >
          🎁 Réduction
        </button>
      </div>
      {!peutSortie && (
        <p className="text-xs text-[#9aa8a1] mt-2">
          Sorties/retraits/dépenses réservés au Fondateur.
        </p>
      )}
    </div>
  )
}
