import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

function arrondirPasAxe(valeur) {
  if (valeur <= 0) return 10
  const magnitude = Math.pow(10, Math.floor(Math.log10(valeur)))
  const residu = valeur / magnitude
  let nice
  if (residu <= 1) nice = 1
  else if (residu <= 1.5) nice = 1.5
  else if (residu <= 2) nice = 2
  else if (residu <= 2.5) nice = 2.5
  else if (residu <= 5) nice = 5
  else nice = 10
  return nice * magnitude
}

function calculerAxeY(maxValeur) {
  const step = arrondirPasAxe(maxValeur / 3)
  return { max: step * 3, step }
}

function formatDateHeure(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
}

function premierJourDuMois() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

function aujourdhuiISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDateCourte(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// Proportion sûre : évite les NaN quand le total vaut 0 (pas encore de mouvement).
function pourcentageSur(valeur, total) {
  if (!total) return 0
  return Math.max(0, Math.min(100, (valeur / total) * 100))
}

export default function TableauDeBord() {
  const navigate = useNavigate()
  const [lignes, setLignes] = useState([])
  const [resume, setResume] = useState(null)
  const [caisses, setCaisses] = useState([])
  const [notifications, setNotifications] = useState([])
  const [bilanPeriode, setBilanPeriode] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const periodeDebut = useMemo(() => premierJourDuMois(), [])
  const periodeFin = useMemo(() => aujourdhuiISO(), [])

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const [bilan, caissesRes, notifRes, bilanPeriodeRes] = await Promise.all([
        api.getBilanEleves({}),
        api.getCaisses(),
        api.getNotifications().catch(() => ({ notifications: [] })),
        api.getBilanPeriodique(periodeDebut, periodeFin).catch(() => null)
      ])
      setLignes(bilan.lignes || [])
      setResume(bilan.resume || null)
      setCaisses(caissesRes.caisses || [])
      setNotifications(notifRes.notifications || [])
      setBilanPeriode(bilanPeriodeRes || null)
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
  }, [])

  const caissePrincipale = caisses.find((c) => c.type_caisse === 'principale') || null
  const soldeCaisse = caissePrincipale?.solde || 0
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
  const maxEffectif = Math.max(1, ...parNiveau.map((g) => g.effectif))
  const { max: axisMax, step: axisStep } = useMemo(() => calculerAxeY(maxEffectif), [maxEffectif])
  const yTicks = useMemo(
    () => [axisMax, axisMax - axisStep, axisMax - axisStep * 2, 0],
    [axisMax, axisStep]
  )

  const activiteRecente = notifications.slice(0, 5)

  // Carte "Bilan périodique" : encaissements vs dépenses depuis le 1er du mois.
  const encaissementsPeriode = bilanPeriode?.resume?.encaissements || 0
  const depensesPeriode = bilanPeriode?.resume?.depenses || 0
  const mouvementPeriode = encaissementsPeriode + depensesPeriode
  const netPeriode = bilanPeriode?.resume?.net_periode ?? encaissementsPeriode - depensesPeriode
  const partEncaissementsPeriode = pourcentageSur(encaissementsPeriode, mouvementPeriode)

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
              label="Solde caisse"
              valeur={formatFCFA(soldeCaisse)}
              delta={`${resume?.solde ?? 0} élève(s) soldé(s)`}
              tendance="neutre"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {/* Répartition par niveau — barres verticales */}
            <Card title="Répartition des élèves par niveau" icon="📋" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">Effectif par niveau, tous filières confondues</p>
              {parNiveau.length === 0 ? (
                <p className="text-sm text-[#9aa8a1] py-6 text-center">Aucune donnée disponible.</p>
              ) : (
                <div className="pt-1">
                  <div className="flex gap-1.5">
                    {/* Axe des ordonnées */}
                    <div className="w-7 shrink-0 h-44 flex flex-col justify-between text-right">
                      {yTicks.map((t) => (
                        <span key={t} className="text-[9px] leading-none text-[#9aa8a1]">
                          {t.toLocaleString('fr-FR')}
                        </span>
                      ))}
                    </div>
                    {/* Zone du graphique */}
                    <div className="flex-1 relative h-44 min-w-0">
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        {yTicks.map((t, i) => (
                          <div
                            key={t}
                            className={`w-full h-0 border-t ${i === yTicks.length - 1 ? 'border-[#d7e6e1]' : 'border-[#eef2f0]'}`}
                          />
                        ))}
                      </div>
                      <div className="absolute inset-0 flex items-end justify-between gap-1 px-0.5">
                        {parNiveau.map((g) => (
                          <div key={g.niveau} className="h-full flex-1 flex flex-col items-center justify-end min-w-0">
                            <div
                              className="w-full max-w-[26px] rounded-t-[3px] bg-vert-fonce transition-all duration-300"
                              style={{ height: `${Math.max(2, (g.effectif / axisMax) * 100)}%` }}
                              title={`${g.effectif} élève${g.effectif > 1 ? 's' : ''} · ${g.solde} soldé${g.solde > 1 ? 's' : ''}`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {/* Axe des abscisses */}
                  <div className="flex gap-1.5 mt-2">
                    <div className="w-7 shrink-0" />
                    <div className="flex-1 flex justify-between gap-1 px-0.5 min-w-0">
                      {parNiveau.map((g) => (
                        <div key={g.niveau} className="flex-1 flex flex-col items-center min-w-0">
                          <span className="text-[10.5px] font-semibold text-vert-fonce truncate max-w-full">
                            {g.niveau}
                          </span>
                          <span className="text-[10px] text-[#9aa8a1] truncate max-w-full">
                            {g.solde} soldé{g.solde > 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* État de la caisse — solde et statut */}
            <Card title="État de la caisse" icon="🗃️" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">Solde actuel et statut</p>
              <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-full bg-[#f2f8f5] flex flex-col items-center justify-center">
                  <span className="text-2xl font-display font-bold text-vert-fonce text-center leading-tight px-2">
                    {formatFCFA(soldeCaisse)}
                  </span>
                  <span className="text-[10.5px] text-[#9aa8a1] mt-1">solde actuel</span>
                </div>
                <div className="w-full mt-5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#6b7d74]">Statut</span>
                    <span
                      className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${
                        caissePrincipale?.statut === 'ouverte'
                          ? 'bg-teal-light text-teal'
                          : caissePrincipale?.statut === 'pause'
                          ? 'bg-orange-clair/20 text-orange'
                          : 'bg-[#f1f5f2] text-[#6b7d74]'
                      }`}
                    >
                      {caissePrincipale?.statut === 'ouverte'
                        ? 'Ouverte'
                        : caissePrincipale?.statut === 'pause'
                        ? 'En pause'
                        : caissePrincipale?.statut === 'fermee'
                        ? 'Fermée'
                        : 'Pas encore ouverte'}
                    </span>
                  </div>
                  {caissePrincipale?.ouverte_par && (
                    <div className="flex items-center justify-between pt-2 border-t border-[#f1f5f2]">
                      <span className="text-[#6b7d74]">Ouverte par</span>
                      <span className="font-semibold text-vert-fonce truncate max-w-[140px]" title={caissePrincipale.ouverte_par}>
                        {caissePrincipale.ouverte_par}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Bilan périodique — anneau vert (encaissements) / rouge (dépenses), mois en cours */}
            <Card title="Bilan périodique" icon="🧭" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">
                Du {formatDateCourte(periodeDebut)} au {formatDateCourte(periodeFin)}
              </p>
              <div className="flex flex-col items-center">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(#0b3d24 0% ${partEncaissementsPeriode}%, #f43f5e ${partEncaissementsPeriode}% 100%)`
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                    <span className="text-base font-display font-bold text-vert-fonce">
                      {partEncaissementsPeriode.toFixed(0)}%
                    </span>
                    <span className="text-[10.5px] text-[#9aa8a1] text-center leading-tight">encaissé</span>
                  </div>
                </div>
                <div className="w-full mt-5 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#6b7d74]">
                      <i className="w-2.5 h-2.5 rounded-full bg-vert-fonce inline-block" /> Encaissements
                    </span>
                    <span className="font-semibold text-vert-fonce">{formatFCFA(encaissementsPeriode)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#6b7d74]">
                      <i className="w-2.5 h-2.5 rounded-full bg-rose inline-block" /> Dépenses
                    </span>
                    <span className="font-semibold text-rose">{formatFCFA(depensesPeriode)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-[#f1f5f2]">
                    <span className="text-[#6b7d74]">Net période</span>
                    <span className={`font-semibold ${netPeriode >= 0 ? 'text-vert-fonce' : 'text-rose'}`}>
                      {formatFCFA(netPeriode)}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Résumé financier — anneau vert / corail */}
            <Card title="Résumé financier" icon="💰" className="min-w-0">
              <p className="text-xs text-[#9aa8a1] -mt-2 mb-4">Payé vs. reste à payer</p>
              <div className="flex flex-col items-center">
                <div
                  className="w-32 h-32 rounded-full flex items-center justify-center"
                  style={{
                    background: `conic-gradient(#0b3d24 0% ${tauxRecouvrement}%, #ffe1da ${tauxRecouvrement}% 100%)`
                  }}
                >
                  <div className="w-20 h-20 rounded-full bg-white flex flex-col items-center justify-center">
                    <span className="text-base font-display font-bold text-vert-fonce">
                      {tauxRecouvrement.toFixed(0)}%
                    </span>
                    <span className="text-[10.5px] text-[#9aa8a1]">recouvré</span>
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
              <div className="flex flex-col gap-3">
                <AccesRapide icone={IconeUtilisateur} label="Ajouter un élève" onClick={() => navigate('/eleves')} />
                <AccesRapide icone={IconeImport} label="Importer une liste d'élèves" onClick={() => navigate('/import-eleves')} />
                <AccesRapide icone={IconeCarte} label="Enregistrer un paiement" variante="coral" onClick={() => navigate('/paiements')} />
                <AccesRapide icone={IconeGraphique} label="Voir les rapports" onClick={() => navigate('/rapports')} />
                <AccesRapide icone={IconeAlerte} label="Consulter les retards" onClick={() => navigate('/retards')} />
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

function AccesRapide({ icone: Icone, label, variante = 'teal', onClick }) {
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
        className={`w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ${
          estCoral ? 'bg-rose' : 'bg-teal'
        }`}
      >
        <Icone className="w-3.5 h-3.5" />
      </span>
      {label}
    </button>
  )
}

function IconeUtilisateur({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-1.5a5 5 0 0 0-5-5H9a5 5 0 0 0-5 5V21" />
      <circle cx="12" cy="7.5" r="4" />
    </svg>
  )
}

function IconeImport({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 21h16" />
    </svg>
  )
}

function IconeCarte({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
      <path d="M2.5 10h19" />
      <path d="M6 14.5h4" />
    </svg>
  )
}

function IconeGraphique({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-6" />
      <path d="M3 20h18" />
    </svg>
  )
}

function IconeAlerte({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.3 4.3 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4.3a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </svg>
  )
}
