import { useRef, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

// Petit badge coloré pour les résultats d'import (créés / mis à jour / erreurs...).
function Badge({ children, className }) {
  return (
    <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${className}`}>
      {children}
    </span>
  )
}

// Bloc d'erreurs déroulant, réutilisé pour les deux imports.
function ListeErreurs({ erreurs }) {
  if (!erreurs?.length) return null
  return (
    <div className="bg-red-50 border border-red-100 rounded-lg p-3 max-h-56 overflow-y-auto">
      <ul className="text-xs text-red-700 space-y-1">
        {erreurs.map((e, i) => (
          <li key={i}>• {e}</li>
        ))}
      </ul>
    </div>
  )
}

export default function ImportEleves() {
  // --- Import des élèves (fichier Excel du ministère) ---
  const fileInputEleves = useRef(null)
  const [fichierEleves, setFichierEleves] = useState(null)
  const [importingEleves, setImportingEleves] = useState(false)
  const [resultEleves, setResultEleves] = useState(null)
  const [erreurEleves, setErreurEleves] = useState('')

  // --- Import des photos (fichier .zip) ---
  const fileInputPhotos = useRef(null)
  const [fichierPhotos, setFichierPhotos] = useState(null)
  const [importingPhotos, setImportingPhotos] = useState(false)
  const [resultPhotos, setResultPhotos] = useState(null)
  const [erreurPhotos, setErreurPhotos] = useState('')

  // --- Téléchargement du modèle Excel ---
  const [telechargement, setTelechargement] = useState(false)
  const [erreurModele, setErreurModele] = useState('')

  function handleFileChangeEleves(e) {
    setFichierEleves(e.target.files?.[0] || null)
    setResultEleves(null)
    setErreurEleves('')
  }

  async function handleImportEleves() {
    if (!fichierEleves) return
    setImportingEleves(true)
    setErreurEleves('')
    setResultEleves(null)
    try {
      const res = await api.importEleves(fichierEleves)
      setResultEleves(res)
      setFichierEleves(null)
      if (fileInputEleves.current) fileInputEleves.current.value = ''
    } catch (err) {
      setErreurEleves(err.message || "Erreur lors de l'import")
    } finally {
      setImportingEleves(false)
    }
  }

  function handleFileChangePhotos(e) {
    setFichierPhotos(e.target.files?.[0] || null)
    setResultPhotos(null)
    setErreurPhotos('')
  }

  async function handleImportPhotos() {
    if (!fichierPhotos) return
    setImportingPhotos(true)
    setErreurPhotos('')
    setResultPhotos(null)
    try {
      const res = await api.importPhotosEleves(fichierPhotos)
      setResultPhotos(res)
      setFichierPhotos(null)
      if (fileInputPhotos.current) fileInputPhotos.current.value = ''
    } catch (err) {
      setErreurPhotos(err.message || "Erreur lors de l'import des photos")
    } finally {
      setImportingPhotos(false)
    }
  }

  async function handleTelechargerModele() {
    setTelechargement(true)
    setErreurModele('')
    try {
      await api.telechargerModeleEleves()
    } catch (err) {
      setErreurModele(err.message || 'Erreur lors du téléchargement du modèle')
    } finally {
      setTelechargement(false)
    }
  }

  return (
    <Layout title="Importer élèves">
      <PageHeader
        icon="📥"
        title="Importer élèves"
        subtitle="Ajoute ou met à jour des élèves à partir du fichier Excel du ministère, puis ajoute leurs photos séparément à partir d'un .zip."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Format attendu du fichier Excel" icon="📄">
          <p className="text-sm text-[#3d4f45] mb-3">
            Envoyez votre fichier Excel du ministère <b>tel quel, sans aucune modification</b>.
          </p>
          <div className="bg-[#f6f8f7] border border-[#e3ebe6] rounded-lg p-3 text-xs font-mono overflow-x-auto mb-4">
            Matricule | Nom | Prénom | Classe | Qualité | Statut | ...
          </div>
          <ul className="text-sm text-[#6b7d74] list-disc pl-5 space-y-1.5">
            <li>Colonne <b>Statut</b> : "Affecte" / "NAffecte" (reconnu automatiquement)</li>
            <li>Colonne <b>Qualité</b> : "Redoublant" / "NRedoublant" (reconnu automatiquement)</li>
            <li>Le <b>niveau</b> (6eme, 5eme…) est déduit automatiquement de la classe</li>
            <li>Toutes les autres colonnes du fichier (moyennes, téléphones, etc.) sont ignorées sans problème</li>
            <li>Un élève déjà existant (même matricule) est mis à jour, sinon il est créé</li>
          </ul>

          <button
            onClick={handleTelechargerModele}
            disabled={telechargement}
            className="mt-4 w-full px-4 py-2 rounded-lg border border-vert text-vert text-sm font-semibold hover:bg-teal-light transition disabled:opacity-50"
          >
            📄 {telechargement ? 'Téléchargement…' : 'Télécharger le modèle Excel'}
          </button>
          {erreurModele && (
            <div className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erreurModele}
            </div>
          )}
        </Card>

        <Card title="1. Importer les élèves (Excel)" icon="⬆️">
          <div className="border-2 border-dashed border-[#d7e8de] rounded-xl p-6 text-center mb-4">
            <input
              ref={fileInputEleves}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChangeEleves}
              className="text-sm"
            />
            {fichierEleves && (
              <p className="text-sm text-[#3d4f45] mt-3">
                Fichier sélectionné : <b>{fichierEleves.name}</b> ({Math.round(fichierEleves.size / 1024)} Ko)
              </p>
            )}
          </div>

          <button
            onClick={handleImportEleves}
            disabled={!fichierEleves || importingEleves}
            className="w-full px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-50"
          >
            {importingEleves ? 'Import en cours…' : 'Importer les élèves'}
          </button>

          {erreurEleves && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erreurEleves}
            </div>
          )}

          {resultEleves && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-vert-fonce text-white">
                  {resultEleves.importes} créé{resultEleves.importes > 1 ? 's' : ''}
                </Badge>
                <Badge className="bg-teal-light text-teal">
                  {resultEleves.mis_a_jour} mis à jour
                </Badge>
                {resultEleves.erreurs?.length > 0 && (
                  <Badge className="bg-rose-light text-rose">
                    {resultEleves.erreurs.length} erreur{resultEleves.erreurs.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <ListeErreurs erreurs={resultEleves.erreurs} />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <Card title="2. Importer les photos (.zip)" icon="🖼️">
          <p className="text-sm text-[#3d4f45] mb-3">
            Regroupez toutes les photos dans un seul fichier <b>.zip</b>. Chaque photo doit être
            nommée avec le <b>matricule exact</b> de l'élève (ex : <span className="font-mono">21421986V.jpg</span>).
            La photo est associée automatiquement à l'élève déjà importé.
          </p>

          <div className="border-2 border-dashed border-[#d7e8de] rounded-xl p-6 text-center mb-4">
            <input
              ref={fileInputPhotos}
              type="file"
              accept=".zip"
              onChange={handleFileChangePhotos}
              className="text-sm"
            />
            {fichierPhotos && (
              <p className="text-sm text-[#3d4f45] mt-3">
                Fichier sélectionné : <b>{fichierPhotos.name}</b> ({Math.round(fichierPhotos.size / 1024)} Ko)
              </p>
            )}
          </div>

          <button
            onClick={handleImportPhotos}
            disabled={!fichierPhotos || importingPhotos}
            className="w-full px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-50"
          >
            {importingPhotos ? 'Import en cours…' : 'Importer les photos'}
          </button>

          {erreurPhotos && (
            <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {erreurPhotos}
            </div>
          )}

          {resultPhotos && (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-vert-fonce text-white">
                  {resultPhotos.importees} photo{resultPhotos.importees > 1 ? 's' : ''} importée{resultPhotos.importees > 1 ? 's' : ''}
                </Badge>
                {resultPhotos.non_trouves?.length > 0 && (
                  <Badge className="bg-teal-light text-teal">
                    {resultPhotos.non_trouves.length} sans élève correspondant
                  </Badge>
                )}
                {resultPhotos.erreurs?.length > 0 && (
                  <Badge className="bg-rose-light text-rose">
                    {resultPhotos.erreurs.length} erreur{resultPhotos.erreurs.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
              <ListeErreurs erreurs={resultPhotos.non_trouves} />
              <ListeErreurs erreurs={resultPhotos.erreurs} />
            </div>
          )}
        </Card>
      </div>
    </Layout>
  )
}
