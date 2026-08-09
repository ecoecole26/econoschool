import { useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

export default function ImportEleves() {
  const fileInputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  function handleFileChange(e) {
    setFile(e.target.files?.[0] || null)
    setResult(null)
    setError('')
  }

  async function handleImport() {
    if (!file) return
    setImporting(true)
    setError('')
    setResult(null)
    try {
      const res = await api.importEleves(file)
      setResult(res)
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (err) {
      setError(err.message || "Erreur lors de l'import")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Layout title="Importer élèves">
      <PageHeader
        icon="📥"
        title="Importer élèves"
        subtitle="Ajoute ou met à jour des élèves en masse à partir d'un fichier CSV + photos, regroupés dans un .zip."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Format attendu du zip" icon="📄">
          <p className="text-sm text-[#3d4f45] mb-3">
            Le fichier .zip doit contenir, à la racine, votre fichier Excel du ministère{' '}
            <b>tel quel, sans aucune modification</b>, plus les photos (optionnel).
          </p>
          <div className="bg-[#f6f8f7] border border-[#e3ebe6] rounded-lg p-3 text-xs font-mono overflow-x-auto mb-4">
            Matricule | Nom | Prénom | Classe | Qualité | Statut | ...
          </div>
          <ul className="text-sm text-[#6b7d74] list-disc pl-5 space-y-1.5">
            <li>Colonne <b>Statut</b> : "Affecte" / "NAffecte" (reconnu automatiquement)</li>
            <li>Colonne <b>Qualité</b> : "Redoublant" / "NRedoublant" (reconnu automatiquement)</li>
            <li>Le <b>niveau</b> (6eme, 5eme…) est déduit automatiquement de la classe</li>
            <li>Toutes les autres colonnes du fichier (moyennes, téléphones, etc.) sont ignorées sans problème</li>
            <li>Pour ajouter une <b>photo</b> : ajoutez une colonne "photo" avec le nom exact du fichier image (ex : 21421986V.jpg), présent à côté de l'Excel dans le zip. Laissez vide sinon.</li>
            <li>Un élève déjà existant (même matricule) est mis à jour, sinon il est créé</li>
          </ul>
        </Card>

        <Card title="Envoyer le fichier" icon="⬆️">
          <div className="border-2 border-dashed border-[#d7e8de] rounded-xl p-6 text-center mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="text-sm"
            />
            {file && (
              <p className="text-sm text-[#3d4f45] mt-3">
                Fichier sélectionné : <b>{file.name}</b> ({Math.round(file.size / 1024)} Ko)
              </p>
            )}
          </div>

          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="w-full px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-50"
          >
            {importing ? 'Import en cours…' : 'Importer'}
          </button>

          {error && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-vert-fonce text-white">
                  {result.importes} créé{result.importes > 1 ? 's' : ''}
                </span>
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-teal-light text-teal">
                  {result.mis_a_jour} mis à jour
                </span>
                {result.erreurs?.length > 0 && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-light text-rose">
                    {result.erreurs.length} erreur{result.erreurs.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {result.erreurs?.length > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 max-h-56 overflow-y-auto">
                  <ul className="text-xs text-red-700 space-y-1">
                    {result.erreurs.map((e, i) => (
                      <li key={i}>• {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  )
}
