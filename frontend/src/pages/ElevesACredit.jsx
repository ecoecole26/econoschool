import { useEffect, useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

export default function ElevesACredit() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [importOuvert, setImportOuvert] = useState(false)
  const fileInput = useRef(null)
  const [fichier, setFichier] = useState(null)
  const [importEnCours, setImportEnCours] = useState(false)
  const [resultImport, setResultImport] = useState(null) // { importes, erreurs }
  const [erreurImport, setErreurImport] = useState('')

  async function charger() {
    setLoading(true)
    setError('')
    try {
      const res = await api.getCreditsReports()
      setData(res)
    } catch (err) {
      setError(err.message || 'Erreur lors du chargement')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    charger()
  }, [])

  function handleFileChange(e) {
    setFichier(e.target.files?.[0] || null)
    setResultImport(null)
    setErreurImport('')
  }

  async function confirmerImport() {
    if (!fichier) return
    setImportEnCours(true)
    setErreurImport('')
    setResultImport(null)
    try {
      const res = await api.importerCreditsReportsExcel(fichier)
      setResultImport(res)
      setFichier(null)
      if (fileInput.current) fileInput.current.value = ''
      await charger()
    } catch (err) {
      setErreurImport(err.message || "Erreur lors de l'import")
    } finally {
      setImportEnCours(false)
    }
  }

  async function supprimerLigne(id, nom) {
    if (!window.confirm(`Retirer ${nom} de la liste des élèves à crédit ?`)) return
    try {
      await api.supprimerCreditReport(id)
      await charger()
    } catch (err) {
      alert(err.message || 'Erreur lors de la suppression')
    }
  }

  // Regroupement par niveau (l'ancien niveau, celui où la dette est née).
  const parNiveau = new Map()
  for (const l of data?.lignes || []) {
    const niveau = l.niveau || 'Niveau non renseigné'
    if (!parNiveau.has(niveau)) parNiveau.set(niveau, [])
    parNiveau.get(niveau).push(l)
  }
  const niveaux = Array.from(parNiveau.keys()).sort((a, b) => a.localeCompare(b))

  return (
    <Layout title="Élèves à crédit">
      <div className="mb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
            💳 Élèves à crédit
          </h2>
          <p className="text-sm text-[#6b7d74] mt-1">
            Élèves ayant un reliquat d'une année précédente. Tant que ce crédit n'est pas soldé, tout
            paiement de cet élève le rembourse en priorité avant de compter pour la scolarité en cours.
          </p>
        </div>
        <button
          onClick={() => setImportOuvert((o) => !o)}
          className="px-4 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold whitespace-nowrap"
        >
          {importOuvert ? 'Fermer' : '⬆️ Importer (Excel)'}
        </button>
      </div>

      {importOuvert && (
        <Card title="Importer les élèves à crédit (Excel)" icon="⬆️" className="mb-5">
          <p className="text-xs text-[#6b7d74] -mt-2 mb-3">
            Fichier Excel avec les colonnes <strong>Matricule</strong>, <strong>Nom</strong>,{' '}
            <strong>Niveau</strong>, <strong>Montant</strong> (l'ordre des colonnes n'a pas d'importance).
            Un import remplace le solde connu pour chaque matricule déjà présent.
          </p>

          <div className="border-2 border-dashed border-[#d7e8de] rounded-xl p-6 text-center mb-4">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="text-sm"
            />
            {fichier && (
              <p className="text-sm text-[#3d4f45] mt-3">
                Fichier sélectionné : <b>{fichier.name}</b> ({Math.round(fichier.size / 1024)} Ko)
              </p>
            )}
          </div>

          <button
            onClick={confirmerImport}
            disabled={!fichier || importEnCours}
            className="w-full px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-50"
          >
            {importEnCours ? 'Import en cours…' : 'Importer'}
          </button>

          {erreurImport && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erreurImport}
            </div>
          )}

          {resultImport && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-teal">
                ✓ {resultImport.importes} élève{resultImport.importes > 1 ? 's' : ''} importé
                {resultImport.importes > 1 ? 's' : ''} avec succès.
              </p>
              {resultImport.erreurs?.length > 0 && (
                <div className="text-xs text-orange bg-[#fff7ed] border border-[#fde3c4] rounded-lg px-3 py-2 max-h-40 overflow-y-auto">
                  {resultImport.erreurs.map((e, i) => (
                    <div key={i}>⚠️ {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {error && (
        <div className="mb-5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-5">
          <div className="bg-white rounded-2xl border border-[#e3ebe6] p-4">
            <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">Élèves à crédit</div>
            <div className="text-xl font-display font-bold text-vert-fonce">{data.total_eleves}</div>
          </div>
          <div className="rounded-2xl border border-[#e3ebe6] p-4 bg-[#fff7ed]">
            <div className="text-[11px] font-semibold text-[#9aa8a1] uppercase mb-1">Total dû (reliquats)</div>
            <div className="text-xl font-display font-bold text-orange">{formatFCFA(data.total_montant)}</div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[#9aa8a1] py-16 text-center">Chargement…</p>
      ) : !data || data.lignes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-8 text-center text-sm text-[#9aa8a1]">
          Aucun élève à crédit pour l'instant.
        </div>
      ) : (
        <div className="space-y-5">
          {niveaux.map((niveau) => {
            const eleves = parNiveau.get(niveau)
            const sousTotal = eleves.reduce((s, l) => s + (Number(l.solde_reporte) || 0), 0)
            return (
              <Card key={niveau} title={niveau} icon="🎓">
                <p className="text-xs text-[#9aa8a1] -mt-2 mb-3">
                  {eleves.length} élève{eleves.length > 1 ? 's' : ''} — {formatFCFA(sousTotal)} au total
                </p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-[#6b7d74] border-b border-[#e3ebe6]">
                      <th className="py-1.5 pr-2">Matricule</th>
                      <th className="py-1.5 pr-2">Nom</th>
                      <th className="py-1.5 pr-2">Année d'origine</th>
                      <th className="py-1.5 pr-2 text-right">Reste dû</th>
                      <th className="py-1.5 pr-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eleves.map((l) => (
                      <tr key={l.id} className="border-b border-[#f1f5f2]">
                        <td className="py-1.5 pr-2 whitespace-nowrap">{l.matricule}</td>
                        <td className="py-1.5 pr-2 font-medium text-vert-fonce">{l.nom}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{l.annee || '—'}</td>
                        <td className="py-1.5 pr-2 text-right font-semibold text-orange whitespace-nowrap">
                          {formatFCFA(l.solde_reporte)}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          <button
                            onClick={() => supprimerLigne(l.id, l.nom)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )
          })}
        </div>
      )}
    </Layout>
  )
}
