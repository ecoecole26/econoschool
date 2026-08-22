import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import Modal from '../components/Modal.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} F`
}

// Colonnes bancaires de la table `etablissements` (affichage sur les reçus).
const COORD_EMPTY = {
  banque_nom: '',
  banque_titulaire: '',
  banque_rib: '',
  banque_iban: ''
}

export default function Banque() {
  return (
    <Layout title="Banque">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          🏛️ Banque
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          Coordonnées pour les reçus, et suivi réel du compte.
        </p>
      </div>

      <div className="space-y-6">
        <CoordonneesBancaires />
        <SuiviCompte />
      </div>
    </Layout>
  )
}

// ---------------------------------------------------------------------------
// Section 1 : Coordonnées bancaires (pour affichage sur les reçus)
// ---------------------------------------------------------------------------
function CoordonneesBancaires() {
  const [form, setForm] = useState(COORD_EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageEstErreur, setMessageEstErreur] = useState(false)

  useEffect(() => {
    api
      .getEtablissement()
      .then(({ etablissement }) => {
        if (etablissement) setForm({ ...COORD_EMPTY, ...etablissement })
      })
      .catch((err) => {
        setMessage(err.message)
        setMessageEstErreur(true)
      })
      .finally(() => setLoading(false))
  }, [])

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    setMessageEstErreur(false)
    try {
      const { etablissement } = await api.saveEtablissement(form)
      setForm({ ...COORD_EMPTY, ...etablissement })
      setMessage('Enregistré ✅')
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la sauvegarde')
      setMessageEstErreur(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card
      title={
        <span className="flex items-center justify-between w-full">
          <span>💳 Coordonnées bancaires</span>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 rounded-lg bg-vert-fonce text-white text-xs font-semibold disabled:opacity-60"
          >
            💾 {saving ? 'Sauvegarde…' : 'Sauvegarder'}
          </button>
        </span>
      }
    >
      <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">
        Affichées sur les reçus pour les virements de frais de scolarité.
      </p>

      {message && (
        <div
          className={`mb-4 text-sm px-3 py-2 rounded-lg inline-block ${
            messageEstErreur ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-teal-light text-teal'
          }`}
        >
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Field label="Banque">
            <TextInput
              value={form.banque_nom || ''}
              onChange={set('banque_nom')}
              placeholder="Ex: SGBCI, NSIA Banque"
            />
          </Field>
          <Field label="Titulaire du compte">
            <TextInput
              value={form.banque_titulaire || ''}
              onChange={set('banque_titulaire')}
              placeholder="Ex: Collège Moderne Bouaké Dar Es Salam"
            />
          </Field>
          <Field label="RIB">
            <TextInput value={form.banque_rib || ''} onChange={set('banque_rib')} placeholder="24 chiffres" />
          </Field>
          <Field label="IBAN">
            <TextInput
              value={form.banque_iban || ''}
              onChange={set('banque_iban')}
              placeholder="Optionnel — virements internationaux"
            />
          </Field>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Section 2 : Suivi réel du compte (solde, versements/retraits, journal)
// ---------------------------------------------------------------------------
function SuiviCompte() {
  const [compte, setCompte] = useState(null)
  const [journal, setJournal] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtreType, setFiltreType] = useState('tous')
  const [filtrePeriode, setFiltrePeriode] = useState('tout')

  const [modalOuverture, setModalOuverture] = useState(false)
  const [soldeInitial, setSoldeInitial] = useState('0')

  const [modalMouvement, setModalMouvement] = useState(null)
  const [formMouvement, setFormMouvement] = useState({ libelle: '', reference: '', montant: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function load() {
    return api.getBanqueCompte().then(({ compte, journal }) => {
      setCompte(compte)
      setJournal(journal || [])
    })
  }

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [])

  async function handleOuvrirCompte() {
    setSaving(true)
    setError('')
    try {
      await api.configurerBanqueCompte({ solde_initial: soldeInitial })
      await load()
      setModalOuverture(false)
    } catch (err) {
      setError(err.message || "Erreur lors de l'ouverture du compte")
    } finally {
      setSaving(false)
    }
  }

  function openMouvement(type) {
    setModalMouvement(type)
    setFormMouvement({ libelle: '', reference: '', montant: '' })
    setError('')
  }

  async function handleSaveMouvement() {
    setSaving(true)
    setError('')
    try {
      await api.ajouterMouvementBanque({
        type: modalMouvement,
        libelle: formMouvement.libelle,
        reference: formMouvement.reference,
        montant: formMouvement.montant
      })
      await load()
      setModalMouvement(null)
    } catch (err) {
      setError(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  const totalVersements = journal
    .filter((m) => m.type === 'versement')
    .reduce((s, m) => s + Number(m.montant), 0)
  const totalRetraits = journal
    .filter((m) => m.type === 'retrait')
    .reduce((s, m) => s + Number(m.montant), 0)

  function dansLaPeriode(m) {
    if (filtrePeriode === 'tout') return true
    const d = new Date(m.date)
    const maintenant = new Date()
    if (filtrePeriode === '30j') {
      const il30j = new Date()
      il30j.setDate(il30j.getDate() - 30)
      return d >= il30j
    }
    if (filtrePeriode === 'mois') {
      return d.getMonth() === maintenant.getMonth() && d.getFullYear() === maintenant.getFullYear()
    }
    return true
  }

  const journalFiltre = journal.filter(
    (m) => (filtreType === 'tous' || m.type === filtreType) && dansLaPeriode(m)
  )

  function exporterCSV() {
    const entetes = ['Date', 'Type', 'Libellé', 'Référence', 'Montant', 'Solde après', 'Validé par']
    const lignes = journalFiltre.map((m) => [
      m.date,
      m.type === 'versement' ? 'Versement' : 'Retrait',
      m.libelle || '',
      m.reference || '',
      m.montant,
      m.solde_apres,
      m.valide_par || ''
    ])
    const csv = [entetes, ...lignes]
      .map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `journal-bancaire-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-display font-bold text-vert-fonce flex items-center gap-2">
          📊 Suivi du compte
        </h3>
        {compte && (
          <div className="flex gap-3">
            <button
              onClick={() => openMouvement('versement')}
              className="px-4 py-2 rounded-xl bg-[#2563eb] text-white text-sm font-semibold"
            >
              ↑ Versement
            </button>
            <button
              onClick={() => openMouvement('retrait')}
              className="px-4 py-2 rounded-xl bg-danger text-white text-sm font-semibold"
            >
              ↓ Retrait
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : !compte ? (
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-14 text-center">
          <div className="text-4xl mb-3">🏦</div>
          <div className="text-base font-semibold text-vert-fonce mb-4">Aucun compte configuré</div>
          <button
            onClick={() => {
              setSoldeInitial('0')
              setError('')
              setModalOuverture(true)
            }}
            className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold"
          >
            ⚙️ Configurer
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="bg-white rounded-2xl border-l-4 border-l-[#2563eb] border border-[#e3ebe6] p-5">
              <div className="text-xs font-semibold text-[#9aa8a1] uppercase mb-1">Solde actuel</div>
              <div className="text-2xl font-display font-bold text-vert-fonce">
                {formatFCFA(compte.solde_actuel)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border-l-4 border-l-vert border border-[#e3ebe6] p-5">
              <div className="text-xs font-semibold text-[#9aa8a1] uppercase mb-1">Total versements</div>
              <div className="text-2xl font-display font-bold text-vert-fonce">
                {formatFCFA(totalVersements)}
              </div>
            </div>
            <div className="bg-white rounded-2xl border-l-4 border-l-danger border border-[#e3ebe6] p-5">
              <div className="text-xs font-semibold text-[#9aa8a1] uppercase mb-1">Total retraits</div>
              <div className="text-2xl font-display font-bold text-vert-fonce">
                {formatFCFA(totalRetraits)}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h4 className="text-base font-display font-bold text-vert-fonce flex items-center gap-2">
                📒 Journal bancaire
              </h4>
              <div className="flex items-center gap-2">
                <select
                  value={filtrePeriode}
                  onChange={(e) => setFiltrePeriode(e.target.value)}
                  className="px-3 py-1.5 border border-[#d7e8de] rounded-lg text-sm"
                >
                  <option value="tout">Toute la période</option>
                  <option value="30j">30 derniers jours</option>
                  <option value="mois">Ce mois-ci</option>
                </select>
                <select
                  value={filtreType}
                  onChange={(e) => setFiltreType(e.target.value)}
                  className="px-3 py-1.5 border border-[#d7e8de] rounded-lg text-sm"
                >
                  <option value="tous">Tous</option>
                  <option value="versement">Versements</option>
                  <option value="retrait">Retraits</option>
                </select>
                <button
                  onClick={exporterCSV}
                  disabled={journalFiltre.length === 0}
                  className="px-3 py-1.5 rounded-lg border border-[#d7e8de] text-sm font-semibold text-vert-fonce hover:bg-teal-light disabled:opacity-50"
                >
                  ⬇️ Exporter
                </button>
              </div>
            </div>

            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[22%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Type</th>
                  <th className="py-2 pr-2">Libellé</th>
                  <th className="py-2 pr-2">Référence</th>
                  <th className="py-2 pr-2 text-right">Montant</th>
                  <th className="py-2 pr-2 text-right">Solde après</th>
                  <th className="py-2 pr-2">Validé par</th>
                </tr>
              </thead>
              <tbody>
                {journalFiltre.map((m) => (
                  <tr key={m.id} className="border-b border-[#f1f5f2]">
                    <td className="py-2 pr-2 truncate">{m.date}</td>
                    <td className="py-2 pr-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          m.type === 'versement' ? 'bg-[#dbeafe] text-[#2563eb]' : 'bg-rose-light text-rose'
                        }`}
                      >
                        {m.type === 'versement' ? 'Versement' : 'Retrait'}
                      </span>
                    </td>
                    <td className="py-2 pr-2 truncate">{m.libelle || '—'}</td>
                    <td className="py-2 pr-2 truncate">{m.reference || '—'}</td>
                    <td className="py-2 pr-2 text-right font-medium">{formatFCFA(m.montant)}</td>
                    <td className="py-2 pr-2 text-right">{formatFCFA(m.solde_apres)}</td>
                    <td className="py-2 pr-2 truncate">{m.valide_par || '—'}</td>
                  </tr>
                ))}
                {journalFiltre.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-10 text-[#6b7d74]">
                      Aucun mouvement sur cette période.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Popup ouverture du compte */}
      <Modal
        open={modalOuverture}
        onClose={() => setModalOuverture(false)}
        title="Configurer le compte bancaire"
        footer={
          <>
            <button
              onClick={() => setModalOuverture(false)}
              className="px-4 py-2 rounded-lg border border-[#d7e8de] text-sm font-semibold text-[#6b7d74]"
            >
              Annuler
            </button>
            <button
              onClick={handleOuvrirCompte}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
            >
              {saving ? 'Ouverture…' : 'Ouvrir le compte'}
            </button>
          </>
        }
      >
        <Field label="Solde initial (FCFA)">
          <TextInput type="number" value={soldeInitial} onChange={(e) => setSoldeInitial(e.target.value)} />
        </Field>
        <p className="text-xs text-[#9aa8a1]">
          C'est le solde de départ du suivi — les versements/retraits viendront s'y ajouter ou s'y soustraire.
        </p>
        {error && (
          <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </Modal>

      {/* Popup versement / retrait */}
      <Modal
        open={!!modalMouvement}
        onClose={() => setModalMouvement(null)}
        title={modalMouvement === 'versement' ? 'Nouveau versement' : 'Nouveau retrait'}
        footer={
          <>
            <button
              onClick={() => setModalMouvement(null)}
              className="px-4 py-2 rounded-lg border border-[#d7e8de] text-sm font-semibold text-[#6b7d74]"
            >
              Annuler
            </button>
            <button
              onClick={handleSaveMouvement}
              disabled={saving || !formMouvement.montant}
              className={`px-4 py-2 rounded-lg text-white text-sm font-semibold disabled:opacity-60 ${
                modalMouvement === 'versement' ? 'bg-[#2563eb]' : 'bg-danger'
              }`}
            >
              {saving ? 'Enregistrement…' : 'Valider'}
            </button>
          </>
        }
      >
        <Field label="Libellé">
          <TextInput
            value={formMouvement.libelle}
            onChange={(e) => setFormMouvement((f) => ({ ...f, libelle: e.target.value }))}
            placeholder="Ex: Dépôt scolarité, Retrait fournitures..."
          />
        </Field>
        <Field label="Référence">
          <TextInput
            value={formMouvement.reference}
            onChange={(e) => setFormMouvement((f) => ({ ...f, reference: e.target.value }))}
            placeholder="N° pièce, chèque..."
          />
        </Field>
        <Field label="Montant (FCFA)" required>
          <TextInput
            type="number"
            value={formMouvement.montant}
            onChange={(e) => setFormMouvement((f) => ({ ...f, montant: e.target.value }))}
          />
        </Field>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </Modal>
    </div>
  )
}
