import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Field, TextInput, Select } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

const BADGE_STATUT = {
  solde: { label: 'Soldé', className: 'bg-teal-light text-teal' },
  partiel: { label: 'Partiel', className: 'bg-[#fff1e0] text-orange' },
  non_paye: { label: 'Non payé', className: 'bg-red-50 text-red-600' }
}

export default function Retards() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [classe, setClasse] = useState('')
  const [statutPaiement, setStatutPaiement] = useState('')
  const [lignes, setLignes] = useState([])
  const [resume, setResume] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (search.trim()) params.search = search.trim()
      if (classe.trim()) params.classe = classe.trim()
      if (statutPaiement) params.statut_paiement = statutPaiement
      const res = await api.getBilanEleves(params)
      setLignes(res.lignes || [])
      setResume(res.resume || null)
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleFiltrer(e) {
    e.preventDefault()
    charger()
  }

  return (
    <Layout title="Retards">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          ⚠️ Retards
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">
          Suivi des soldes : élèves à jour et élèves en retard de paiement de scolarité.
        </p>
      </div>

      {resume && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <ResumeCarte label="Élèves" valeur={resume.total_eleves} />
          <ResumeCarte label="Soldés" valeur={resume.solde} couleur="text-teal" fond="bg-teal-light" />
          <ResumeCarte label="En retard" valeur={resume.en_retard} couleur="text-orange" fond="bg-[#fff1e0]" />
          <ResumeCarte label="Total payé" valeur={formatFCFA(resume.total_paye)} />
          <ResumeCarte
            label="Reste à percevoir"
            valeur={formatFCFA(resume.total_reste)}
            couleur="text-orange"
            fond="bg-[#fff1e0]"
          />
        </div>
      )}

      <form onSubmit={handleFiltrer} className="flex flex-wrap items-end gap-3 mb-5">
        <Field label="Nom ou matricule">
          <TextInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
          />
        </Field>
        <Field label="Classe">
          <TextInput
            value={classe}
            onChange={(e) => setClasse(e.target.value)}
            placeholder="ex. 6eme6"
          />
        </Field>
        <Field label="Statut de paiement">
          <Select value={statutPaiement} onChange={(e) => setStatutPaiement(e.target.value)}>
            <option value="">Tous</option>
            <option value="solde">Soldés</option>
            <option value="retard">En retard (partiel + non payé)</option>
          </Select>
        </Field>
        <button
          type="submit"
          className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold h-fit"
        >
          Filtrer
        </button>
      </form>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Chargement…</p>
        ) : lignes.length === 0 ? (
          <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucun élève ne correspond à ces filtres.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-2 pr-2">Élève</th>
                <th className="py-2 pr-2">Classe</th>
                <th className="py-2 pr-2 text-right">Total dû</th>
                <th className="py-2 pr-2 text-right">Total payé</th>
                <th className="py-2 pr-2 text-right">Reste à payer</th>
                <th className="py-2 pr-2">Statut</th>
                <th className="py-2 pr-2"></th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => {
                const badge = BADGE_STATUT[l.statut_paiement] || BADGE_STATUT.non_paye
                return (
                  <tr key={l.id} className="border-b border-[#f1f5f2]">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-vert-fonce">{l.nom}</div>
                      <div className="text-xs text-[#9aa8a1]">{l.matricule}</div>
                    </td>
                    <td className="py-2 pr-2">{l.classe || '—'}</td>
                    <td className="py-2 pr-2 text-right">{formatFCFA(l.total_du)}</td>
                    <td className="py-2 pr-2 text-right">{formatFCFA(l.total_paye)}</td>
                    <td className="py-2 pr-2 text-right font-semibold">
                      {formatFCFA(l.reste_a_payer)}
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2 pr-2 text-right">
                      <button
                        onClick={() => navigate(`/eleves/${l.matricule}/profil`)}
                        className="px-3 py-1.5 rounded-lg border border-vert-fonce text-vert-fonce text-xs font-semibold hover:bg-teal-light"
                      >
                        Voir profil
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}

function ResumeCarte({ label, valeur, couleur = 'text-vert-fonce', fond = 'bg-white' }) {
  return (
    <div className={`rounded-2xl border border-[#e3ebe6] p-4 ${fond}`}>
      <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">{label}</div>
      <div className={`text-xl font-display font-bold ${couleur}`}>{valeur}</div>
    </div>
  )
}
