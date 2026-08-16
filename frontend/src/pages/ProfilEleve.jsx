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
  const [etablissement, setEtablissement] = useState(null)

  useEffect(() => {
    api
      .getEtablissement()
      .then((res) => setEtablissement(res.etablissement))
      .catch(() => {})
  }, [])

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
    <>
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
            <>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl border border-[#d7e8de] text-vert-fonce text-sm font-semibold flex items-center gap-1.5"
              >
                🖨️ Imprimer
              </button>
              <Link
                to="/paiements"
                className="px-4 py-2 rounded-xl bg-vert-fonce text-white text-sm font-semibold"
              >
                💳 Encaisser un paiement
              </Link>
            </>
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

      {/* Bloc dédié à l'impression : invisible à l'écran, affiché uniquement sur la feuille
          imprimée. Placé hors de <Layout> (donc hors de #app-shell) pour le même motif que
          le reçu de paiement dans Paiements.jsx : le display:none sur #app-shell à l'impression
          ne doit pas non plus cacher ce bloc, et on évite tout espace vide résiduel en haut. */}
      {donnees && (
        <div className="hidden print:block">
          <FicheImpression
            donnees={donnees}
            etablissement={etablissement}
            formatFCFA={formatFCFA}
            formatDate={formatDate}
          />
        </div>
      )}
    </>
  )
}

function FicheImpression({ donnees, etablissement, formatFCFA, formatDate }) {
  return (
    <div className="text-sm text-[#132a1e] p-1">
      {/* En-tête établissement */}
      <div className="flex items-center gap-3 pb-3 border-b-2 border-vert-fonce mb-4">
        {etablissement?.logo_url ? (
          <img
            src={etablissement.logo_url}
            alt="Logo"
            className="w-14 h-14 rounded-full object-cover border border-[#e3ebe6]"
          />
        ) : (
          <div className="w-14 h-14 rounded-full bg-teal-light flex items-center justify-center text-2xl">
            🏫
          </div>
        )}
        <div>
          <div className="font-display font-bold text-vert-fonce text-base">
            {etablissement?.nom || 'Établissement'}
          </div>
          <div className="text-xs text-[#6b7d74]">
            {[etablissement?.adresse, etablissement?.ville].filter(Boolean).join(', ')}
          </div>
          {etablissement?.telephone && (
            <div className="text-xs text-[#6b7d74]">Tél : {etablissement.telephone}</div>
          )}
        </div>
      </div>

      <div className="text-center mb-4">
        <span className="inline-block px-4 py-1 rounded-full bg-teal-light text-teal text-xs font-bold uppercase tracking-wide">
          Fiche élève — Historique des versements
        </span>
      </div>

      {/* Élève */}
      <div className="flex items-center gap-3 mb-4 bg-[#f6f8f7] rounded-xl p-3">
        <div className="w-14 h-14 rounded-full bg-white overflow-hidden flex items-center justify-center text-xl border border-[#e3ebe6]">
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
        <div>
          <div className="font-display font-bold text-vert-fonce">{donnees.eleve.nom}</div>
          <div className="text-xs text-[#6b7d74]">
            {donnees.eleve.matricule} · {donnees.eleve.classe || '—'} ·{' '}
            {donnees.eleve.affecte ? 'Affecté' : 'Non affecté'}
          </div>
        </div>
      </div>

      {/* Bilan financier */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#f6f8f7] rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-semibold text-[#9aa8a1] uppercase mb-0.5">
            Total à payer
          </div>
          <div className="text-base font-display font-bold text-vert-fonce">
            {formatFCFA(donnees.frais.total_du)}
          </div>
        </div>
        <div className="bg-teal-light rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-semibold text-[#9aa8a1] uppercase mb-0.5">
            Total payé
          </div>
          <div className="text-base font-display font-bold text-teal">
            {formatFCFA(donnees.totalPaye)}
          </div>
        </div>
        <div className="bg-[#fff1e0] rounded-lg p-2.5 text-center">
          <div className="text-[10px] font-semibold text-[#9aa8a1] uppercase mb-0.5">
            Reste à payer
          </div>
          <div className="text-base font-display font-bold text-orange">
            {formatFCFA(donnees.reste_a_payer)}
          </div>
        </div>
      </div>

      {/* Historique complet */}
      <div className="border-t border-[#e3ebe6] pt-3">
        <h4 className="text-sm font-display font-bold text-vert-fonce mb-2">
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
                  <td className="py-1.5 pr-2 text-right font-medium">{formatFCFA(p.montant)}</td>
                  <td className="py-1.5 pr-2">{p.valide_par || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-center text-[10px] text-[#9aa8a1] mt-6 pt-3 border-t border-[#f1f5f2]">
        Édité le {formatDate(new Date().toISOString())} — EconoSchool
      </div>
    </div>
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
