import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

export default function TableauDeBord() {
  const [resume, setResume] = useState(null)
  const [caisses, setCaisses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [bilan, caissesRes] = await Promise.all([api.getBilanEleves({}), api.getCaisses()])
      setResume(bilan.resume || null)
      setCaisses(caissesRes.caisses || [])
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
  }, [])

  const soldeCaisse1 = caisses.find((c) => c.type_caisse === 'principale')?.solde || 0
  const soldeCaisse2 = caisses.find((c) => c.type_caisse === 'secondaire')?.solde || 0
  const nonAffectes = resume ? resume.total_eleves - (resume.affectes ?? 0) : 0

  return (
    <Layout title="Tableau de bord">
      <div className="mb-6">
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          📊 Tableau de bord
        </h2>
        <p className="text-sm text-[#6b7d74] mt-1">Vue d'ensemble de l'établissement, en temps réel.</p>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#9aa8a1] py-16 text-center">Chargement…</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <Carte label="Effectif total" valeur={resume?.total_eleves ?? 0} />
          <Carte label="Total actifs" valeur={resume?.total_actifs ?? 0} couleur="text-teal" fond="bg-teal-light" />
          <Carte label="Affectés" valeur={resume?.affectes ?? '—'} />
          <Carte label="Non affectés" valeur={resume ? nonAffectes : '—'} />

          <Carte label="Caisse 1 (principale)" valeur={formatFCFA(soldeCaisse1)} couleur="text-vert-fonce" fond="bg-teal-light" />
          <Carte label="Caisse 2 (secondaire)" valeur={formatFCFA(soldeCaisse2)} couleur="text-vert-fonce" fond="bg-teal-light" />
          <Carte label="Somme encaissée" valeur={formatFCFA(resume?.total_paye)} couleur="text-teal" fond="bg-teal-light" />
          <Carte label="Reste à payer" valeur={formatFCFA(resume?.total_reste)} couleur="text-orange" fond="bg-[#fff1e0]" />

          <Carte label="Élèves en retard" valeur={resume?.en_retard ?? 0} couleur="text-orange" fond="bg-[#fff1e0]" />
          <Carte label="Élèves ayant soldé" valeur={resume?.solde ?? 0} couleur="text-teal" fond="bg-teal-light" />
        </div>
      )}
    </Layout>
  )
}

function Carte({ label, valeur, couleur = 'text-vert-fonce', fond = 'bg-white' }) {
  return (
    <div className={`rounded-2xl border border-[#e3ebe6] p-4 ${fond}`}>
      <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">{label}</div>
      <div className={`text-xl font-display font-bold ${couleur}`}>{valeur}</div>
    </div>
  )
}
