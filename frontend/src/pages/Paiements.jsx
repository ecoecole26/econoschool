import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Card, Field, TextInput, Select } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

export default function Paiements() {
  const [matricule, setMatricule] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [donnees, setDonnees] = useState(null) // { eleve, tarif, frais, paiements, totalPaye, reste_a_payer }

  const [tranches, setTranches] = useState([])
  const [trancheChoisie, setTrancheChoisie] = useState('')
  const [montant, setMontant] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api
      .getTranchesPaiement()
      .then(({ tranches }) => setTranches(tranches || []))
      .catch(() => {})
  }, [])

  async function handleRecherche(e) {
    e.preventDefault()
    if (!matricule.trim()) return
    setLoading(true)
    setError('')
    setDonnees(null)
    setMessage('')
    try {
      const res = await api.rechercherEleveMatricule(matricule.trim())
      setDonnees(res)
      setMontant('')
      setTrancheChoisie('')
    } catch (err) {
      setError(err.message || 'Élève introuvable')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnregistrerPaiement() {
    if (!donnees || !montant) return
    setSaving(true)
    setMessage('')
    try {
      await api.enregistrerPaiement({
        eleve_id: donnees.eleve.id,
        tranche_libelle: trancheChoisie || null,
        montant
      })
      // Recharge les données de l'élève pour mettre à jour reste à payer + historique
      const res = await api.rechercherEleveMatricule(donnees.eleve.matricule)
      setDonnees(res)
      setMontant('')
      setMessage('Paiement enregistré ✅')
    } catch (err) {
      setMessage(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Paiements">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          💳 Paiements
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          Recherche un élève par matricule pour encaisser un paiement.
        </p>
      </div>

      <form onSubmit={handleRecherche} className="flex justify-center gap-3 mb-6">
        <input
          value={matricule}
          onChange={(e) => setMatricule(e.target.value)}
          placeholder="Matricule de l'élève…"
          className="w-full max-w-sm px-4 py-2.5 border border-[#d7e8de] rounded-xl text-sm bg-white focus:outline-none focus:border-teal"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
        >
          {loading ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && (
        <div className="max-w-lg mx-auto mb-6 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-center">
          {error}
        </div>
      )}

      {donnees && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Fiche élève */}
          <Card title="Fiche élève" icon="🧑‍🎓" className="lg:col-span-1">
            <div className="flex flex-col items-center text-center mb-4">
              <div className="w-24 h-24 rounded-full bg-[#f1f5f2] overflow-hidden mb-3 flex items-center justify-center text-3xl">
                {donnees.eleve.photo_url ? (
                  <img
                    src={donnees.eleve.photo_url}
                    alt={donnees.eleve.nom}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  '🧑‍🎓'
                )}
              </div>
              <div className="font-display font-bold text-vert-fonce">{donnees.eleve.nom}</div>
              <div className="text-xs text-[#9aa8a1]">{donnees.eleve.matricule}</div>
            </div>

            <Ligne label="Niveau" valeur={donnees.eleve.niveau || '—'} />
            <Ligne label="Classe" valeur={donnees.eleve.classe || '—'} />
            <Ligne
              label="Statut"
              valeur={
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    donnees.eleve.affecte
                      ? 'bg-teal-light text-teal'
                      : 'bg-[#fff1e0] text-orange'
                  }`}
                >
                  {donnees.eleve.affecte ? 'Affecté' : 'Non affecté'}
                </span>
              }
            />
            <Ligne
              label="Qualité"
              valeur={donnees.eleve.redoublant ? 'Redoublant' : 'Non redoublant'}
            />
          </Card>

          {/* Détail des frais + formulaire de paiement */}
          <Card title="Frais dus" icon="💰" className="lg:col-span-2">
            {donnees.eleve.affecte && (
              <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-teal-light text-teal">
                Élève affecté : la scolarité est prise en charge et déduite du total à payer.
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-6">
              <Field label="Scolarité (FCFA)">
                <TextInput value={donnees.frais.scolarite} disabled={donnees.eleve.affecte} readOnly />
              </Field>
              <Field label="Frais d'inscription (FCFA)">
                <TextInput value={donnees.frais.inscription} readOnly />
              </Field>
              <Field label="Frais annexes (FCFA)">
                <TextInput value={donnees.frais.annexes} readOnly />
              </Field>
              <Field label="Frais examen (FCFA)">
                <TextInput value={donnees.frais.examen} readOnly />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4 my-4">
              <div className="bg-[#f6f8f7] rounded-xl p-4">
                <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">
                  Total à payer
                </div>
                <div className="text-xl font-display font-bold text-vert-fonce">
                  {formatFCFA(donnees.frais.total_du)}
                </div>
              </div>
              <div
                className={`rounded-xl p-4 ${
                  donnees.reste_a_payer > 0 ? 'bg-[#fff1e0]' : 'bg-teal-light'
                }`}
              >
                <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">
                  Reste à payer
                </div>
                <div
                  className={`text-xl font-display font-bold ${
                    donnees.reste_a_payer > 0 ? 'text-orange' : 'text-teal'
                  }`}
                >
                  {formatFCFA(donnees.reste_a_payer)}
                </div>
              </div>
            </div>

            <div className="border-t border-[#f1f5f2] pt-4 mt-2">
              <h4 className="text-sm font-display font-bold text-vert-fonce mb-3">
                Enregistrer un paiement
              </h4>
              <div className="grid grid-cols-2 gap-x-6">
                <Field label="Tranche / échéance">
                  <Select
                    value={trancheChoisie}
                    onChange={(e) => setTrancheChoisie(e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {tranches.map((t) => (
                      <option key={t.id} value={t.label}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Montant versé (FCFA)" required>
                  <TextInput
                    type="number"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    placeholder={String(donnees.reste_a_payer)}
                  />
                </Field>
              </div>

              {message && (
                <div className="mb-3 text-sm px-3 py-2 rounded-lg bg-teal-light text-teal inline-block">
                  {message}
                </div>
              )}

              <button
                onClick={handleEnregistrerPaiement}
                disabled={saving || !montant}
                className="w-full py-3 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : 'Encaisser le paiement'}
              </button>
            </div>

            {donnees.paiements.length > 0 && (
              <div className="border-t border-[#f1f5f2] pt-4 mt-5">
                <h4 className="text-sm font-display font-bold text-vert-fonce mb-3">
                  Historique des paiements
                </h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                      <th className="py-1.5 pr-2">Date</th>
                      <th className="py-1.5 pr-2">Tranche</th>
                      <th className="py-1.5 pr-2 text-right">Montant</th>
                      <th className="py-1.5 pr-2">Validé par</th>
                    </tr>
                  </thead>
                  <tbody>
                    {donnees.paiements.map((p) => (
                      <tr key={p.id} className="border-b border-[#f1f5f2]">
                        <td className="py-1.5 pr-2">{p.date_paiement}</td>
                        <td className="py-1.5 pr-2">{p.tranche_libelle || '—'}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">
                          {formatFCFA(p.montant)}
                        </td>
                        <td className="py-1.5 pr-2">{p.valide_par || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </Layout>
  )
}

function Ligne({ label, valeur }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#f1f5f2] text-sm">
      <span className="text-[#6b7d74]">{label}</span>
      <span className="font-medium text-vert-fonce">{valeur}</span>
    </div>
  )
}
