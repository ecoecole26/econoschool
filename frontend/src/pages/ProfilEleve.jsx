import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function formatDate(d) {
  if (!d) return '—'
  try {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  } catch {
    return d
  }
}

// Fiche élève en lecture seule, avec le bilan complet de tous ses versements.
// Contrairement à la page Paiements (qui sert à ENCAISSER un paiement), cette
// page sert uniquement à CONSULTER le profil — accessible depuis Retards,
// Élèves, ou directement via /eleves/:matricule/profil.
export default function ProfilEleve() {
  const { matricule } = useParams()
  const navigate = useNavigate()

  const [donnees, setDonnees] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let annule = false
    setLoading(true)
    setError('')
    api
      .rechercherEleveMatricule(matricule)
      .then((res) => {
        if (!annule) setDonnees(res)
      })
      .catch((err) => {
        if (!annule) setError(err.message || 'Élève introuvable')
      })
      .finally(() => {
        if (!annule) setLoading(false)
      })
    return () => {
      annule = true
    }
  }, [matricule])

  return (
    <Layout title="Profil élève">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
            🧑‍🎓 Profil élève
          </h2>
          <p className="text-sm text-[#6b7d74] mt-1">
            Fiche complète et bilan de tous les versements.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 rounded-xl border border-[#d7e8de] text-[#6b7d74] text-sm font-semibold"
          >
            ← Retour
          </button>
          {donnees && (
            <Link
              to="/paiements"
              className="px-4 py-2 rounded-xl bg-vert-fonce text-white text-sm font-semibold"
            >
              💳 Encaisser un paiement
            </Link>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-[#9aa8a1] text-center py-10">Chargement…</p>}

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
              label="Affectation"
              valeur={
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                    donnees.eleve.affecte ? 'bg-teal-light text-teal' : 'bg-[#fff1e0] text-orange'
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
            <Ligne label="Statut" valeur={donnees.eleve.statut || '—'} />

            {donnees.reduction && (
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                <div className="text-xs text-amber-800">
                  🎁 Réduction active : <strong>{donnees.reduction.pourcentage}%</strong> sur la
                  scolarité
                  {donnees.reduction.motif ? ` — ${donnees.reduction.motif}` : ''}
                </div>
              </div>
            )}
          </Card>

          {/* Bilan financier + historique complet */}
          <Card title="Bilan des versements" icon="💰" className="lg:col-span-2">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="bg-[#f6f8f7] rounded-xl p-4">
                <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">
                  Total à payer
                </div>
                <div className="text-xl font-display font-bold text-vert-fonce">
                  {formatFCFA(donnees.frais.total_du)}
                </div>
              </div>
              <div className="bg-teal-light rounded-xl p-4">
                <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">
                  Total payé
                </div>
                <div className="text-xl font-display font-bold text-teal">
                  {formatFCFA(donnees.totalPaye)}
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

            <div className="grid grid-cols-2 gap-x-6 mb-5 text-sm">
              <Ligne label="Scolarité" valeur={formatFCFA(donnees.frais.scolariteApplicable)} />
              <Ligne label="Frais d'inscription" valeur={formatFCFA(donnees.frais.inscription)} />
              <Ligne label="Frais annexes" valeur={formatFCFA(donnees.frais.annexes)} />
              <Ligne label="Frais d'examen" valeur={formatFCFA(donnees.frais.examen)} />
            </div>

            <div className="border-t border-[#f1f5f2] pt-4">
              <h4 className="text-sm font-display font-bold text-vert-fonce mb-3">
                Historique complet des versements ({donnees.paiements.length})
              </h4>
              {donnees.paiements.length === 0 ? (
                <p className="text-sm text-[#9aa8a1]">Aucun versement enregistré pour le moment.</p>
              ) : (
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
                        <td className="py-1.5 pr-2">{formatDate(p.date_paiement)}</td>
                        <td className="py-1.5 pr-2">{p.tranche_libelle || '—'}</td>
                        <td className="py-1.5 pr-2 text-right font-medium">
                          {formatFCFA(p.montant)}
                        </td>
                        <td className="py-1.5 pr-2">{p.valide_par || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
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
