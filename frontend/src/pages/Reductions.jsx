import { useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

const POURCENTAGES_RAPIDES = [10, 25, 50, 75, 100]

export default function Reductions() {
  const role = localStorage.getItem('econoschool_role')

  const [matricule, setMatricule] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [donnees, setDonnees] = useState(null) // { eleve, tarif, reduction, frais }

  const [pourcentage, setPourcentage] = useState('')
  const [motif, setMotif] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (role !== 'fondateur') {
    return (
      <Layout title="Réductions">
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-14 text-center max-w-lg mx-auto">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-base font-semibold text-vert-fonce mb-2">Accès réservé</div>
          <p className="text-sm text-[#6b7d74]">
            Les réductions sont accordées uniquement par le Fondateur. Adresse-toi à lui pour
            qu'il traite le dossier de l'élève.
          </p>
        </div>
      </Layout>
    )
  }

  async function handleRecherche(e) {
    e.preventDefault()
    if (!matricule.trim()) return
    setLoading(true)
    setError('')
    setDonnees(null)
    setMessage('')
    try {
      const res = await api.rechercherEleveReduction(matricule.trim())
      setDonnees(res)
      setPourcentage(res.reduction ? String(res.reduction.pourcentage) : '')
      setMotif('')
    } catch (err) {
      setError(err.message || 'Élève introuvable')
    } finally {
      setLoading(false)
    }
  }

  async function recharger() {
    const res = await api.rechercherEleveReduction(donnees.eleve.matricule)
    setDonnees(res)
  }

  async function handleAppliquer() {
    if (!donnees || pourcentage === '') return
    setSaving(true)
    setMessage('')
    try {
      await api.accorderReduction({
        eleve_id: donnees.eleve.id,
        pourcentage,
        motif
      })
      await recharger()
      setMessage('Réduction appliquée ✅')
    } catch (err) {
      setMessage(err.message || "Erreur lors de l'enregistrement")
    } finally {
      setSaving(false)
    }
  }

  async function handleAnnuler() {
    if (!donnees?.reduction) return
    setSaving(true)
    setMessage('')
    try {
      await api.annulerReduction(donnees.reduction.id)
      await recharger()
      setPourcentage('')
      setMotif('')
      setMessage('Réduction annulée — scolarité pleine rétablie ✅')
    } catch (err) {
      setMessage(err.message || "Erreur lors de l'annulation")
    } finally {
      setSaving(false)
    }
  }

  // Aperçu en direct de la nouvelle scolarité, avant même de sauvegarder.
  const scolariteBase = donnees && !donnees.eleve.affecte ? Number(donnees.frais.scolarite) || 0 : 0
  const pourcentageApercu = Number(pourcentage) || 0
  const montantReductionApercu = donnees?.eleve.affecte
    ? 0
    : Math.round((scolariteBase * pourcentageApercu) / 100)
  const nouvelleScolariteApercu = scolariteBase - montantReductionApercu

  return (
    <Layout title="Réductions">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          🎁 Réductions
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          Recherche l'élève par matricule pour accorder une réduction en pourcentage, appliquée
          uniquement sur la scolarité.
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
              <div className="w-36 h-44 rounded-2xl bg-[#f1f5f2] overflow-hidden mb-3 flex items-center justify-center text-4xl">
                {donnees.eleve.photo_url ? (
                  <img
                    src={donnees.eleve.photo_url}
                    alt={donnees.eleve.nom}
                    className="w-full h-full object-cover object-top"
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

            {donnees.eleve.affecte && (
              <div className="mt-3 text-xs px-3 py-2 rounded-lg bg-teal-light text-teal">
                Élève affecté : la scolarité est déjà prise en charge, aucune réduction n'est
                applicable.
              </div>
            )}
          </Card>

          {/* Frais + réduction */}
          <Card title="Frais dus" icon="💰" className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-x-6 mb-4">
              <Field label="Scolarité annuelle (FCFA)">
                <TextInput value={donnees.frais.scolarite} readOnly />
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

            {donnees.reduction && (
              <div className="mb-4 flex items-center justify-between gap-3 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <div className="text-sm text-amber-800">
                  🎁 Réduction active : <strong>{donnees.reduction.pourcentage}%</strong> sur la
                  scolarité
                  {donnees.reduction.motif ? ` — ${donnees.reduction.motif}` : ''}
                  <div className="text-xs text-amber-700 mt-0.5">
                    Accordée par {donnees.reduction.accordee_par}
                  </div>
                </div>
                <button
                  onClick={handleAnnuler}
                  disabled={saving}
                  className="px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-semibold disabled:opacity-60 shrink-0"
                >
                  Annuler
                </button>
              </div>
            )}

            {!donnees.eleve.affecte && (
              <div className="border-t border-[#f1f5f2] pt-4">
                <div className="text-sm font-display font-bold text-vert-fonce mb-3">
                  Accorder une réduction sur la scolarité
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {POURCENTAGES_RAPIDES.map((p) => (
                    <button
                      key={p}
                      onClick={() => setPourcentage(String(p))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        String(p) === pourcentage
                          ? 'bg-vert-fonce text-white border-vert-fonce'
                          : 'border-[#d7e8de] text-vert-fonce hover:bg-teal-light'
                      }`}
                    >
                      {p}%
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-x-6">
                  <Field label="Pourcentage (%)">
                    <TextInput
                      type="number"
                      min="0"
                      max="100"
                      value={pourcentage}
                      onChange={(e) => setPourcentage(e.target.value)}
                      placeholder="Ex: 25"
                    />
                  </Field>
                  <Field label="Motif (optionnel)">
                    <TextInput
                      value={motif}
                      onChange={(e) => setMotif(e.target.value)}
                      placeholder="Ex: Fratrie, mérite, cas social…"
                    />
                  </Field>
                </div>

                {pourcentage !== '' && (
                  <div className="grid grid-cols-3 gap-4 my-4">
                    <div className="bg-[#f6f8f7] rounded-xl p-4">
                      <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">
                        Scolarité pleine
                      </div>
                      <div className="text-lg font-display font-bold text-vert-fonce">
                        {formatFCFA(scolariteBase)}
                      </div>
                    </div>
                    <div className="bg-rose-light rounded-xl p-4">
                      <div className="text-[11px] font-semibold text-rose uppercase mb-1">
                        Réduction ({pourcentageApercu || 0}%)
                      </div>
                      <div className="text-lg font-display font-bold text-rose">
                        − {formatFCFA(montantReductionApercu)}
                      </div>
                    </div>
                    <div className="bg-teal-light rounded-xl p-4">
                      <div className="text-[11px] font-semibold text-teal uppercase mb-1">
                        Nouvelle scolarité
                      </div>
                      <div className="text-lg font-display font-bold text-teal">
                        {formatFCFA(nouvelleScolariteApercu)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleAppliquer}
                    disabled={saving || pourcentage === ''}
                    className="px-6 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Enregistrement…' : 'Appliquer la réduction'}
                  </button>
                  {message && <div className="text-sm text-teal">{message}</div>}
                </div>

                <p className="text-xs text-[#9aa8a1] mt-3">
                  Une fois appliquée, l'Économe (ou le Proviseur) pourra encaisser le paiement
                  directement avec la scolarité réduite depuis la page Paiements.
                </p>
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
