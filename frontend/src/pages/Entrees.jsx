import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, Select, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

const LABEL_CAISSE = { principale: 'Caisse 1', secondaire: 'Caisse 2' }

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} F`
}

function formatDateHeure(valeur) {
  if (!valeur) return '—'
  const d = new Date(valeur)
  if (Number.isNaN(d.getTime())) return valeur
  const datePart = d.toLocaleDateString('fr-FR', { timeZone: 'UTC' })
  const heurePart = d.toLocaleTimeString('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })
  return heurePart === '00:00' ? datePart : `${datePart} à ${heurePart}`
}

function exporterCSV(lignes, nomFichier) {
  const entetes = ['Date', 'Caisse', 'Libellé', 'Montant', 'Par']
  const rangees = lignes.map((m) => [
    formatDateHeure(m.date),
    LABEL_CAISSE[m.caisse] || m.caisse,
    m.libelle || '',
    m.montant,
    m.valide_par || m.demande_par || ''
  ])
  const csv = [entetes, ...rangees]
    .map((ligne) => ligne.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Composant générique réutilisé par Entrées et Dépenses : seul le type
// d'opération (et le texte/icône) change entre les deux pages.
export function ListeMouvements({ typeOperation, icone, titre, sousTitre, couleurTotal, nomFichier }) {
  const role = localStorage.getItem('econoschool_role')
  const caissesDisponibles = role === 'fondateur' ? ['principale', 'secondaire'] : ['secondaire']

  const [caisse, setCaisse] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [lignes, setLignes] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  function charger() {
    setLoading(true)
    setError('')
    const params = {}
    if (caisse) params.caisse = caisse
    if (dateDebut) params.date_debut = dateDebut
    if (dateFin) params.date_fin = dateFin

    api
      .getMouvements(typeOperation, params)
      .then(({ lignes, total }) => {
        setLignes(lignes || [])
        setTotal(total || 0)
      })
      .catch((err) => setError(err.message || 'Erreur lors du chargement'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    charger()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caisse, dateDebut, dateFin])

  return (
    <Layout title={titre}>
      <PageHeader icon={icone} title={titre} subtitle={sousTitre} />

      <Card className="mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
          <Field label="Caisse">
            <Select value={caisse} onChange={(e) => setCaisse(e.target.value)}>
              <option value="">Toutes les caisses</option>
              {caissesDisponibles.map((c) => (
                <option key={c} value={c}>
                  {LABEL_CAISSE[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Du">
            <TextInput type="date" value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
          </Field>
          <Field label="Au">
            <TextInput type="date" value={dateFin} onChange={(e) => setDateFin(e.target.value)} />
          </Field>
          <button
            onClick={() => exporterCSV(lignes, nomFichier)}
            disabled={lignes.length === 0}
            className="px-4 py-2.5 rounded-xl border border-vert-fonce text-vert-fonce text-sm font-semibold disabled:opacity-40 mb-3 whitespace-nowrap"
          >
            ⬇️ Exporter CSV
          </button>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
          <div className="text-xs font-semibold text-[#9aa8a1] uppercase mb-1">Total sur la période</div>
          <div className={`text-2xl font-display font-bold ${couleurTotal}`}>{formatFCFA(total)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5">
          <div className="text-xs font-semibold text-[#9aa8a1] uppercase mb-1">Nombre de mouvements</div>
          <div className="text-2xl font-display font-bold text-vert-fonce">{lignes.length}</div>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e3ebe6] p-5 overflow-x-auto">
        {loading ? (
          <div className="text-sm text-[#6b7d74]">Chargement…</div>
        ) : (
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Caisse</th>
                <th className="py-2 pr-2">Libellé</th>
                <th className="py-2 pr-2 text-right">Montant</th>
                <th className="py-2 pr-2">Par</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((m) => (
                <tr key={m.id} className="border-b border-[#f1f5f2]">
                  <td className="py-2 pr-2 whitespace-nowrap">{formatDateHeure(m.date)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{LABEL_CAISSE[m.caisse] || m.caisse}</td>
                  <td className="py-2 pr-2">{m.libelle || '—'}</td>
                  <td className="py-2 pr-2 text-right font-medium whitespace-nowrap">{formatFCFA(m.montant)}</td>
                  <td className="py-2 pr-2 whitespace-nowrap">{m.valide_par || m.demande_par || '—'}</td>
                </tr>
              ))}
              {lignes.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-[#6b7d74]">
                    Aucun mouvement pour cette période.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  )
}

export default function Entrees() {
  return (
    <ListeMouvements
      typeOperation="Encaissement"
      icone="📥"
      titre="Entrées"
      sousTitre="Toutes les entrées enregistrées dans les caisses (encaissements, versements)."
      couleurTotal="text-teal"
      nomFichier="entrees.csv"
    />
  )
}
