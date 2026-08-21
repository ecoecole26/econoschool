import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

function formatFCFA(n) {
  return `${Math.round(n || 0).toLocaleString('fr-FR')} FCFA`
}

// Découpe un texte collé depuis Excel (tabulations entre colonnes, retour à
// la ligne entre lignes) en tableau de lignes {matricule, nom, niveau, montant}.
// Colonnes attendues, DANS CET ORDRE : Matricule, Nom, Niveau, Montant.
// Une ligne d'en-tête est détectée et ignorée automatiquement si la 1ère
// cellule ne ressemble pas à un matricule (contient "matricule" en toutes lettres).
function parserCollageExcel(texte) {
  const lignesBrutes = texte
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '')

  const lignes = []
  const erreurs = []

  lignesBrutes.forEach((ligne, i) => {
    const cellules = ligne.split('\t').map((c) => c.trim())
    if (i === 0 && cellules[0]?.toLowerCase().includes('matricule')) return // en-tête

    const [matricule, nom, niveau, montantBrut] = cellules
    const montant = Number(String(montantBrut || '').replace(/[^\d.-]/g, ''))

    if (!matricule || !nom || !montant || montant <= 0) {
      erreurs.push(`Ligne "${ligne}" ignorée (colonnes attendues : Matricule, Nom, Niveau, Montant)`)
      return
    }
    lignes.push({ matricule, nom, niveau: niveau || '', montant })
  })

  return { lignes, erreurs }
}

export default function ElevesACredit() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [collageOuvert, setCollageOuvert] = useState(false)
  const [texteColle, setTexteColle] = useState('')
  const [apercu, setApercu] = useState(null) // { lignes, erreurs }
  const [importEnCours, setImportEnCours] = useState(false)
  const [messageImport, setMessageImport] = useState('')

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

  function handleTexteColle(valeur) {
    setTexteColle(valeur)
    setMessageImport('')
    if (valeur.trim()) {
      setApercu(parserCollageExcel(valeur))
    } else {
      setApercu(null)
    }
  }

  async function confirmerImport() {
    if (!apercu || apercu.lignes.length === 0) return
    setImportEnCours(true)
    setMessageImport('')
    try {
      const res = await api.importerCreditsReports(apercu.lignes)
      setMessageImport(`✓ ${res.importes} élève(s) importé(s) avec succès.`)
      setTexteColle('')
      setApercu(null)
      setCollageOuvert(false)
      await charger()
    } catch (err) {
      setMessageImport(`Erreur : ${err.message || "échec de l'import"}`)
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
          onClick={() => setCollageOuvert((o) => !o)}
          className="px-4 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold whitespace-nowrap"
        >
          {collageOuvert ? 'Fermer' : '📋 Coller la liste (Excel)'}
        </button>
      </div>

      {collageOuvert && (
        <Card title="Importer par copier-coller" icon="📋" className="mb-5">
          <p className="text-xs text-[#6b7d74] -mt-2 mb-3">
            Copiez les colonnes <strong>Matricule</strong>, <strong>Nom</strong>, <strong>Niveau</strong>,{' '}
            <strong>Montant</strong> depuis Excel (dans cet ordre, une ligne d'en-tête est acceptée), puis
            collez-les ci-dessous. Un import remplace le solde connu pour chaque matricule déjà présent.
          </p>
          <textarea
            value={texteColle}
            onChange={(e) => handleTexteColle(e.target.value)}
            placeholder={'Matricule\tNom\tNiveau\tMontant\n21421986V\tABDON GRACE\t5eme\t15000'}
            rows={6}
            className="w-full border border-[#e3ebe6] rounded-xl px-3 py-2 text-sm font-mono"
          />

          {apercu && (
            <div className="mt-3">
              {apercu.erreurs.length > 0 && (
                <div className="text-xs text-orange bg-[#fff7ed] border border-[#fde3c4] rounded-lg px-3 py-2 mb-2">
                  {apercu.erreurs.map((e, i) => (
                    <div key={i}>⚠️ {e}</div>
                  ))}
                </div>
              )}
              {apercu.lignes.length > 0 ? (
                <>
                  <p className="text-xs text-[#6b7d74] mb-2">
                    Aperçu — {apercu.lignes.length} élève(s) prêt(s) à importer :
                  </p>
                  <div className="max-h-56 overflow-y-auto border border-[#e3ebe6] rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-[#f6f8f7] sticky top-0">
                        <tr className="text-left">
                          <th className="py-1.5 px-2">Matricule</th>
                          <th className="py-1.5 px-2">Nom</th>
                          <th className="py-1.5 px-2">Niveau</th>
                          <th className="py-1.5 px-2 text-right">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apercu.lignes.map((l, i) => (
                          <tr key={i} className="border-t border-[#f1f5f2]">
                            <td className="py-1 px-2">{l.matricule}</td>
                            <td className="py-1 px-2">{l.nom}</td>
                            <td className="py-1 px-2">{l.niveau || '—'}</td>
                            <td className="py-1 px-2 text-right">{formatFCFA(l.montant)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    onClick={confirmerImport}
                    disabled={importEnCours}
                    className="mt-3 px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
                  >
                    {importEnCours ? 'Import…' : `Importer ${apercu.lignes.length} élève(s)`}
                  </button>
                </>
              ) : (
                <p className="text-sm text-[#9aa8a1]">Aucune ligne valide détectée pour l'instant.</p>
              )}
            </div>
          )}

          {messageImport && (
            <p
              className={`mt-3 text-sm font-semibold ${
                messageImport.startsWith('✓') ? 'text-teal' : 'text-red-600'
              }`}
            >
              {messageImport}
            </p>
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
