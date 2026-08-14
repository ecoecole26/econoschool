import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function formatDateHeure(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

export default function TableauDeBord() {
  const navigate = useNavigate()
  const [lignes, setLignes] = useState([])
  const [resume, setResume] = useState(null)
  const [caisses, setCaisses] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [bilan, caissesRes, notifRes] = await Promise.all([
        api.getBilanEleves({}),
        api.getCaisses(),
        api.getNotifications().catch(() => ({ notifications: [] }))
      ])
      setLignes(bilan.lignes || [])
      setResume(bilan.resume || null)
      setCaisses(caissesRes.caisses || [])
      setNotifications(notifRes.notifications || [])
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

  const parNiveau = useMemo(() => {
    const map = new Map()
    for (const l of lignes) {
      const niveau = l.niveau || 'Non renseigné'
      if (!map.has(niveau)) {
        map.set(niveau, { niveau, effectif: 0, affectes: 0, total_du: 0, total_paye: 0, total_reste: 0, solde: 0 })
      }
      const g = map.get(niveau)
      g.effectif += 1
      if (l.affecte) g.affectes += 1
      g.total_du += l.total_du
      g.total_paye += l.total_paye
      g.total_reste += l.reste_a_payer
      if (l.statut_paiement === 'solde') g.solde += 1
    }
    return Array.from(map.values()).sort((a, b) => a.niveau.localeCompare(b.niveau))
  }, [lignes])

  const totalDu = (resume?.total_paye || 0) + (resume?.total_reste || 0)
  const tauxRecouvrement = totalDu > 0 ? ((resume?.total_paye || 0) / totalDu) * 100 : 0
  const soldeCaisses = soldeCaisse1 + soldeCaisse2
  const maxEffectif = Math.max(1, ...parNiveau.map((g) => g.effectif))

  const activiteRecente = notifications.slice(0, 5)

  return (
    <Layout title="Tableau de bord">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
            📊 Tableau de bord
          </h2>
          <p className="text-sm text-[#6b7d74] mt-1">Vue d'ensemble de l'établissement, en temps réel.</p>
        </div>
      </div>

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#9aa8a1] py-16 text-center">Chargement…</p>
      ) : (
        <>
          {/* Rangée de KPI */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 mb-6">
            <Kpi
              icone="🧑‍🎓"
              couleur="teal"
              label="Effectif total"
              valeur={resume?.total_eleves ?? 0}
              delta={`${resume?.affectes ?? 0} affectés`}
              tendance="neutre"
            />
            <Kpi
              icone="⏳"
              couleur="amber"
              label="Non affectés"
              valeur={resume ? nonAffectes : 0}
              delta={resume?.total_eleves ? `${Math.round((nonAffectes / resume.total_eleves) * 100)}% de l'effectif` : '—'}
              tendance="neutre"
            />
            <Kpi
              icone="✓"
              couleur="violet"
              label="Taux de recouvrement"
              valeur={`${tauxRecouvrement.toFixed(1)}%`}
              delta={`${formatFCFA(resume?.total_paye)} encaissés`}
              tendance="haut"
            />
            <Kpi
              icone="⚠️"
              couleur="rose"
              label="Reste à payer"
              valeur={formatFCFA(resume?.total_reste)}
              delta={`${resume?.en_retard ?? 0} élève(s) en retard`}
              tendance="bas"
            />
            <Kpi
              icone="🗃️"
              couleur="teal"
              label="Solde caisses"
              valeur={formatFCFA(soldeCaisses)}
              delta={`${resume?.solde ?? 0} élève(s) soldé(s)`}
              tendance="neutre"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {/* Répartition par niveau — barres verticales */}
            <Card title="Répartition des élèves par niveau" icon="📋" className="lg:col-span-2 min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">Effectif par niveau, tous filières confondues</p>
              {parNiveau.length === 0 ? (
                <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune donnée disponible.</p>
              ) : (
                <div className="flex items-end justify-between gap-3 h-52 pt-2">
                  {parNiveau.map((g) => (
                    <div key={g.niveau} className="flex-1 h-full flex flex-col items-center justify-end min-w-0">
                      <span className="text-[11px] font-semibold text-vert-fonce mb-1.5 whitespace-nowrap">
                        {g.effectif}
                      </span>
                      <div
                        className="w-full max-w-[52px] rounded-t-lg bg-vert-fonce transition-all duration-300"
                        style={{ height: `${Math.max(4, (g.effectif / maxEffectif) * 100)}%` }}
                        title={`${g.effectif} élève${g.effectif > 1 ? 's' : ''} · ${g.solde} soldé${g.solde > 1 ? 's' : ''}`}
                      />
                      <span className="text-xs font-semibold text-vert-fonce mt-2 truncate max-w-full">
                        {g.niveau}
                      </span>
                      <span className="text-[10px] text-[#9aa8a1] truncate max-w-full">
                        {g.solde} soldé{g.solde > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Résumé financier — anneau CSS */}
            <Card title="Résumé financier" icon="💰" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">Payé vs. reste à payer</p>
              <div className="flex flex-col items-center">
                <div
                  className="w-52 h-52 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(#0b3d24 0% ${tauxRecouvrement}%, #ffe1da ${tauxRecouvrement}% 100%)`
                  }}
                >
                  <div className="w-36 h-36 rounded-full bg-white flex flex-col items-center justify-center">
                    <span className="text-2xl font-display font-bold text-vert-fonce">
                      {tauxRecouvrement.toFixed(0)}%
                    </span>
                    <span className="text-[11px] text-[#9aa8a1]">recouvré</span>
                  </div>
                </div>
                <div className="w-full mt-5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#6b7d74]">
                      <i className="w-2.5 h-2.5 rounded-full bg-vert-fonce inline-block" /> Total payé
                    </span>
                    <span className="font-semibold text-vert-fonce">{formatFCFA(resume?.total_paye)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#6b7d74]">
                      <i className="w-2.5 h-2.5 rounded-full bg-[#ffc7ba] inline-block" /> Reste à payer
                    </span>
                    <span className="font-semibold text-orange">{formatFCFA(resume?.total_reste)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#f1f5f2]">
                    <span className="text-[#6b7d74]">Total dû</span>
                    <span className="font-semibold text-vert-fonce">{formatFCFA(totalDu)}</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Activité récente — notifications réelles */}
            <Card title="Activité récente" icon="🕓" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-2">Dernières notifications de la plateforme</p>
              {activiteRecente.length === 0 ? (
                <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune activité récente.</p>
              ) : (
                <div>
                  {activiteRecente.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start justify-between gap-3 py-2.5 border-b border-[#f0f5f3] last:border-b-0 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-vert-fonce truncate">{n.titre}</div>
                        <div className="text-xs text-[#6b7d74] truncate">{n.message}</div>
                      </div>
                      <span className="text-[10.5px] text-[#9aa8a1] whitespace-nowrap shrink-0 mt-0.5">
                        {formatDateHeure(n.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Accès rapides */}
            <Card title="Accès rapides" icon="⚡" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-3">Raccourcis vers les tâches fréquentes</p>
              <div className="flex flex-col gap-2">
                <AccesRapide icone="👤" label="Ajouter un élève" onClick={() => navigate('/eleves')} />
                <AccesRapide icone="📥" label="Importer une liste d'élèves" onClick={() => navigate('/import-eleves')} />
                <AccesRapide icone="💳" label="Enregistrer un paiement" variante="coral" onClick={() => navigate('/paiements')} />
                <AccesRapide icone="📈" label="Voir les rapports" onClick={() => navigate('/rapports')} />
                <AccesRapide icone="⚠️" label="Consulter les retards" onClick={() => navigate('/retards')} />
              </div>
            </Card>
          </div>

          <div className="mt-5 text-xs text-[#7c948e] bg-[#fbfdfc] border border-dashed border-[#d7e6e1] rounded-xl px-4 py-2.5">
            Données en temps réel — élèves, paiements et caisses de l'établissement.
          </div>
        </>
      )}
    </Layout>
  )
}

const KPI_COULEURS = {
  teal: { fond: 'bg-teal-light', icone: 'text-teal' },
  amber: { fond: 'bg-[#fff1e0]', icone: 'text-orange' },
  violet: { fond: 'bg-purple-light', icone: 'text-purple-badge' },
  rose: { fond: 'bg-rose-light', icone: 'text-rose' }
}

const TENDANCE_STYLE = {
  haut: 'text-vert-fonce',
  bas: 'text-rose',
  neutre: 'text-[#8a9a95]'
}

function Kpi({ icone, couleur = 'teal', label, valeur, delta, tendance = 'neutre' }) {
  const style = KPI_COULEURS[couleur] || KPI_COULEURS.teal
  return (
    <div className="bg-white rounded-2xl border border-[#e3ebe6] p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm mb-2.5 ${style.fond} ${style.icone}`}>
        {icone}
      </div>
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[#6b7d74]">{label}</div>
      <div className="text-lg font-display font-bold text-vert-fonce mt-0.5 truncate">{valeur}</div>
      {delta && <div className={`text-[11px] mt-1 font-semibold ${TENDANCE_STYLE[tendance]}`}>{delta}</div>}
    </div>
  )
}

function AccesRapide({ icone, label, variante = 'teal', onClick }) {
  const estCoral = variante === 'coral'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-left border transition ${
        estCoral
          ? 'bg-[#fff5f3] border-[#ffdbd2] text-rose hover:bg-[#ffe9e4]'
          : 'bg-[#f2fbf9] border-[#c9ede6] text-teal hover:bg-[#e3f6f1]'
      }`}
    >
      <span
        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs text-white shrink-0 ${
          estCoral ? 'bg-rose' : 'bg-teal'
        }`}
      >
        {icone}
      </span>
      {label}
    </button>
  )
}
