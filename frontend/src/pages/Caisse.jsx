import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import Modal from '../components/Modal.jsx'
import { Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} F`
}

// Affiche la date/heure du mouvement en clair (ex. "11/08/2026 à 13:32").
// Reste robuste si l'ancienne valeur (date seule, sans heure) est encore
// présente pour des mouvements enregistrés avant ce correctif.
function formatDateHeure(valeur) {
  if (!valeur) return '—'
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return valeur
  const datePart = d.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
  const heurePart = d.toLocaleTimeString('fr-FR', {
    timeZone: 'UTC',
    hour: '2-digit',
    minute: '2-digit'
  })
  // Les anciens mouvements sans heure tombent tous à 00:00 : on masque
  // l'heure dans ce cas précis pour ne pas laisser croire qu'ils datent
  // tous de minuit.
  if (heurePart === '00:00') return datePart
  return `${datePart} à ${heurePart}`
}

const LABEL_CAISSE = { principale: 'Caisse' }
const COULEUR_OPERATION = {
  Encaissement: 'bg-teal-light text-teal',
  Sortie: 'bg-rose-light text-rose'
}

export default function Caisse() {
  const role = localStorage.getItem('econoschool_role')

  const [caisses, setCaisses] = useState([])
  const [journal, setJournal] = useState([])
  const [soldesAnterieurs, setSoldesAnterieurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [modalOperation, setModalOperation] = useState(null) // { type_caisse, type_operation } | null
  const [form, setForm] = useState({ libelle: '', montant: '' })
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')
  const [changementStatut, setChangementStatut] = useState('') // type_caisse en cours de changement, ou ''

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
    if (role === 'fondateur') {
      api
        .getSoldesAnterieurs()
        .then(({ soldes }) => setSoldesAnterieurs(soldes || []))
        .catch(() => {}) // discret : ne bloque pas l'affichage principal de la caisse
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function ouvrirOperation(type_caisse, type_operation) {
    setForm({ libelle: '', montant: '' })
    setModalError('')
    setModalOperation({ type_caisse, type_operation })
  }

  async function handleChangerStatut(type_caisse, statut) {
    setChangementStatut(type_caisse)
    setError('')
    try {
      await api.changerStatutCaisse(type_caisse, statut)
      await load()
    } catch (err) {
      setError(err.message || 'Erreur lors du changement de statut')
    } finally {
      setChangementStatut('')
    }
  }

  async function handleSaveOperation() {
    setSaving(true)
    setModalError('')
    try {
      await api.ajouterMouvementCaisse({
        type_caisse: modalOperation.type_caisse,
        type_operation: modalOperation.type_operation,
        libelle: form.libelle,
        montant: form.montant
      })
      await load()
      setModalOperation(null)
    } catch (err) {
      setModalError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Caisse">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          🗃️ Caisse
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          Économe, Fondateur et Directeur des Études gèrent la caisse ensemble — seul le Fondateur autorise les sorties.
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
          <div className="grid grid-cols-1 md:max-w-sm gap-4">
            {caisses.map((c) => (
              <CarteCaisse
                key={c.type_caisse}
                caisse={c}
                role={role}
                onOperation={(type_operation) => ouvrirOperation(c.type_caisse, type_operation)}
                onChangerStatut={(statut) => handleChangerStatut(c.type_caisse, statut)}
                changement={changementStatut === c.type_caisse}
              />
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
            <h4 className="text-base font-display font-bold text-vert-fonce flex items-center gap-2 mb-4">
              📒 Journal des mouvements
            </h4>
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[38%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Libellé</th>
                  <th className="py-2 pr-2 text-right">Montant</th>
                  <th className="py-2 pr-2">Par</th>
                </tr>
              </thead>
              <tbody>
                {journal.map((m) => (
                  <tr key={m.id} className="border-b border-[#f1f5f2]">
                    <td className="py-2 pr-2 truncate">{formatDateHeure(m.date)}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COULEUR_OPERATION[m.type_operation] || ''}`}
                      >
                        {m.type_operation}
                      </span>
                    </td>
                    <td className="py-2 pr-2 truncate">{m.libelle || '—'}</td>
                    <td className="py-2 pr-2 text-right font-medium">{formatFCFA(m.montant)}</td>
                    <td className="py-2 pr-2 truncate">{m.valide_par || m.demande_par || '—'}</td>
                  </tr>
                ))}
                {journal.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-[#6b7d74]">
                      Aucun mouvement pour l'instant.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {role === 'fondateur' && soldesAnterieurs.length > 0 && (
            <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
              <h4 className="text-base font-display font-bold text-vert-fonce flex items-center gap-2 mb-1">
                🔒 Ancien solde
              </h4>
              <p className="text-xs text-[#9aa8a1] mb-4">
                Solde de caisse figé à chaque changement d'année — visible seulement par toi, distinct des entrées de l'année en cours.
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                    <th className="py-2 pr-2">Année</th>
                    <th className="py-2 pr-2">Caisse</th>
                    <th className="py-2 pr-2 text-right">Solde de clôture</th>
                  </tr>
                </thead>
                <tbody>
                  {soldesAnterieurs.map((s) => (
                    <tr key={s.id} className="border-b border-[#f1f5f2]">
                      <td className="py-2 pr-2">{s.annee_scolaire}</td>
                      <td className="py-2 pr-2">{LABEL_CAISSE[s.type_caisse] || s.type_caisse}</td>
                      <td className="py-2 pr-2 text-right font-medium">{formatFCFA(s.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Popup nouvelle opération */}
      <Modal
        open={!!modalOperation}
        onClose={() => setModalOperation(null)}
        title={
          modalOperation
            ? `${modalOperation.type_operation} — ${LABEL_CAISSE[modalOperation.type_caisse]}`
            : ''
        }
        footer={
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
        }
      >
        <Field label="Libellé">
          <TextInput
            value={form.libelle}
            onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
            placeholder="Ex: Achat fournitures, Versement..."
          />
        </Field>
        <Field label="Montant (FCFA)" required>
          <TextInput
            type="number"
            value={form.montant}
            onChange={(e) => setForm((f) => ({ ...f, montant: e.target.value }))}
          />
        </Field>
        {modalError && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {modalError}
          </div>
        )}
      </Modal>
    </Layout>
  )
}

const STATUT_CAISSE = {
  ouverte: { label: 'Ouverte', classe: 'bg-teal-light text-teal' },
  fermee: { label: 'Fermée', classe: 'bg-rose-light text-rose' },
  pause: { label: 'En pause', classe: 'bg-orange-clair/20 text-orange' },
  non_ouverte: { label: 'Pas encore ouverte', classe: 'bg-[#f1f5f2] text-[#6b7d74]' }
}

function CarteCaisse({ caisse, role, onOperation, onChangerStatut, changement }) {
  const peutSortie = role === 'fondateur'
  const statutInfo = STATUT_CAISSE[caisse.statut] || STATUT_CAISSE.non_ouverte
  const estOuverte = caisse.statut === 'ouverte'
  const estFermee = caisse.statut === 'fermee'
  const estEnPause = caisse.statut === 'pause'
  const estActionnable = estOuverte || estEnPause // caisse déjà créée, pas juste "pas encore ouverte"

  return (
    <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 flex flex-col h-full">
      {/* Zone montant : dégagée, sans bouton autour, pour rester lisible en un coup d'œil. */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-xs font-semibold text-[#9aa8a1] uppercase">
          {LABEL_CAISSE[caisse.type_caisse]}
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${statutInfo.classe}`}>
          {statutInfo.label}
        </span>
      </div>
      <div className="text-3xl font-display font-bold text-vert-fonce mb-1">
        {formatFCFA(caisse.solde)}
      </div>
      {/* Hauteur réservée même sans info, pour que les deux cartes restent alignées. */}
      <div className="text-[11px] text-[#9aa8a1] min-h-[16px] mb-4">
        {estOuverte && caisse.ouverte_par
          ? `Ouverte par ${caisse.ouverte_par}${caisse.ouverte_le ? ` — ${formatDateHeure(caisse.ouverte_le)}` : ''}`
          : ''}
      </div>

      {/* Pousse les rangées de boutons en bas de carte. */}
      <div className="mt-auto">
        {/* Rangée 1 : état de la caisse (ouvrir / pause / fermer), 3 colonnes
            fixes pour que les boutons tombent exactement aux mêmes positions
            sur les deux cartes. */}
        <div className="grid grid-cols-3 gap-2 mb-3 pb-3 border-b border-[#f1f5f2]">
          {!estActionnable ? (
            <button
              onClick={() => onChangerStatut('ouverte')}
              disabled={changement}
              className="col-span-3 px-3 py-1.5 rounded-full bg-teal text-white text-xs font-semibold disabled:opacity-60"
            >
              🔓 Ouvrir la caisse
            </button>
          ) : (
            <>
              {estOuverte ? (
                <button
                  onClick={() => onChangerStatut('pause')}
                  disabled={changement}
                  className="px-2 py-1.5 rounded-full bg-bleu text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
                >
                  ⏸️ Pause
                </button>
              ) : (
                <button
                  onClick={() => onChangerStatut('ouverte')}
                  disabled={changement}
                  className="px-2 py-1.5 rounded-full bg-teal text-white text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
                >
                  ▶️ Reprendre
                </button>
              )}
              <button
                onClick={() => onChangerStatut('fermee')}
                disabled={changement}
                className="col-start-3 px-2 py-1.5 rounded-full border border-rose text-rose text-xs font-semibold disabled:opacity-60 whitespace-nowrap"
              >
                🔒 Fermer
              </button>
            </>
          )}
        </div>

        {/* Rangée 2 : opérations (Entrée / Sortie), même largeur sur les
            deux cartes grâce au grid 2 colonnes. */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onOperation('Encaissement')}
            disabled={!estOuverte}
            title={!estOuverte ? "Ouvrez la caisse pour enregistrer un mouvement" : undefined}
            className="px-4 py-1.5 rounded-full bg-vert-fonce text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + Entrée
          </button>
          {peutSortie ? (
            <button
              onClick={() => onOperation('Sortie')}
              disabled={!estOuverte}
              title={!estOuverte ? "Ouvrez la caisse pour enregistrer un mouvement" : undefined}
              className="px-4 py-1.5 rounded-full bg-orange text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              − Sortie
            </button>
          ) : (
            <div />
          )}
        </div>

        {!peutSortie && (
          <p className="text-xs text-[#9aa8a1] mt-2">
            Sorties/retraits/dépenses réservés au Fondateur.
          </p>
        )}
        {!estOuverte && estActionnable && (
          <p className="text-xs text-[#9aa8a1] mt-2">
            {estEnPause
              ? 'Caisse en pause : reprenez-la pour enregistrer un mouvement.'
              : 'Caisse fermée : ouvrez-la pour enregistrer un mouvement.'}
          </p>
        )}
      </div>
    </div>
  )
}
