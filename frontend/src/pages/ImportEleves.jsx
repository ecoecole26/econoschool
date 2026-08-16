import { useRef, useState } from 'react'
import JSZip from 'jszip'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card } from '../components/ui.jsx'
import { api } from '../lib/api.js'

const TAILLE_LOT = 25 // photos envoyées par requête — reste léger pour le serveur

// Largeur/hauteur cible pour les photos élève, format "carte d'identité"
// (portrait 3:4). Recadrer et compresser CÔTÉ NAVIGATEUR avant l'envoi sert
// deux objectifs à la fois :
//  1) uniformiser le rendu (trombinoscope, fiches, reçus) avec de vraies
//     photos type carte d'identité, cadrées sur le visage ;
//  2) faire chuter le poids de chaque photo de plusieurs Mo (scan/appareil
//     photo) à quelques dizaines de Ko — ce qui évite de dépasser la limite
//     de taille de requête imposée par Vercel (~4,5 Mo) quand plusieurs
//     photos sont envoyées ensemble dans un même lot (l'erreur "Failed to
//     fetch" pendant l'import des photos vient de là : la requête est coupée
//     en plein transfert avant même d'atteindre le serveur).
const LARGEUR_PHOTO = 300
const HAUTEUR_PHOTO = 400

function redimensionnerPhoto(file) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = LARGEUR_PHOTO
      canvas.height = HAUTEUR_PHOTO
      const ctx = canvas.getContext('2d')

      // Recadrage "cover" ancré en haut (le visage est presque toujours dans
      // la moitié haute de la photo) : on redimensionne l'image pour qu'elle
      // couvre entièrement le cadre 3:4, puis on ne garde que le haut si elle
      // déborde en hauteur, les côtés si elle déborde en largeur.
      const ratioCible = LARGEUR_PHOTO / HAUTEUR_PHOTO
      const ratioSource = image.width / image.height
      let sx, sy, sw, sh
      if (ratioSource > ratioCible) {
        // Image plus large que le cadre : on rogne les côtés, centré.
        sh = image.height
        sw = sh * ratioCible
        sx = (image.width - sw) / 2
        sy = 0
      } else {
        // Image plus haute que le cadre : on rogne le bas, ancré en haut.
        sw = image.width
        sh = sw / ratioCible
        sx = 0
        sy = 0
      }

      ctx.drawImage(image, sx, sy, sw, sh, 0, 0, LARGEUR_PHOTO, HAUTEUR_PHOTO)
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Échec du traitement de la photo'))
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
        },
        'image/jpeg',
        0.85
      )
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Photo illisible'))
    }
    image.src = url
  })
}

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
  const [progressionPhotos, setProgressionPhotos] = useState(null) // { fait, total }
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
    setProgressionPhotos(null)

    try {
      // 1. Dézippage dans le navigateur — le zip complet (même 200+ Mo) ne
      // transite jamais tel quel vers le serveur, seulement les photos une
      // par une regroupées en petits lots juste après.
      const zip = await JSZip.loadAsync(fichierPhotos)
      const entrees = Object.values(zip.files).filter(
        (f) => !f.dir && /\.(jpe?g|png|webp)$/i.test(f.name)
      )

      if (entrees.length === 0) {
        throw new Error('Aucune photo (jpg/jpeg/png/webp) trouvée dans ce zip.')
      }

      const cumul = { importees: 0, total_photos: entrees.length, non_trouves: [], erreurs: [] }
      setProgressionPhotos({ fait: 0, total: entrees.length })

      for (let i = 0; i < entrees.length; i += TAILLE_LOT) {
        const lot = entrees.slice(i, i + TAILLE_LOT)
        const fichiers = await Promise.all(
          lot.map(async (entree) => {
            const blob = await entree.async('blob')
            const nom = entree.name.split('/').pop()
            const brut = new File([blob], nom, { type: blob.type || 'image/jpeg' })
            try {
              return await redimensionnerPhoto(brut)
            } catch {
              // Si le redimensionnement échoue pour une raison quelconque
              // (format exotique...), on envoie la photo telle quelle plutôt
              // que de bloquer tout le lot.
              return brut
            }
          })
        )

        const resLot = await api.importPhotosEleves(fichiers)
        cumul.importees += resLot.importees || 0
        cumul.non_trouves.push(...(resLot.non_trouves || []))
        cumul.erreurs.push(...(resLot.erreurs || []))

        setProgressionPhotos({ fait: Math.min(i + TAILLE_LOT, entrees.length), total: entrees.length })
      }

      setResultPhotos(cumul)
      setFichierPhotos(null)
      if (fileInputPhotos.current) fileInputPhotos.current.value = ''
    } catch (err) {
      setErreurPhotos(err.message || "Erreur lors de l'import des photos")
    } finally {
      setImportingPhotos(false)
      setProgressionPhotos(null)
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
            Envoyez votre fichier Excel du ministère <b>tel quel, sans aucune modification</b>, ou le
            modèle ci-dessous. Chaque établissement ayant sa propre liste d'élèves, le fichier doit
            indiquer le <b>code et le nom de ton établissement</b> — télécharge le modèle pour les
            avoir déjà pré-remplis.
          </p>
          <div className="bg-[#f6f8f7] border border-[#e3ebe6] rounded-lg p-3 text-xs font-mono overflow-x-auto mb-4">
            Code établissement | Nom établissement | Matricule | Nom | Prénom | Classe | Qualité | Statut | ...
          </div>
          <ul className="text-sm text-[#6b7d74] list-disc pl-5 space-y-1.5">
            <li>Colonnes <b>Code établissement</b> / <b>CodeEts</b> (fichier ministériel) : garde-fou anti-erreur — un fichier venant clairement d'une autre école est refusé en bloc, une ligne isolée mal renseignée est simplement ignorée</li>
            <li>Colonne <b>Statut</b> : "Affecte" / "NAffecte" (reconnu automatiquement)</li>
            <li>Colonne <b>Qualité</b> : "Redoublant" / "NRedoublant" (reconnu automatiquement)</li>
            <li>Le <b>niveau</b> (6eme, 5eme…) est déduit automatiquement de la classe</li>
            <li>Toutes les autres colonnes du fichier (moyennes, téléphones, etc.) sont ignorées sans problème</li>
            <li>Un élève déjà existant (même matricule, même établissement) est mis à jour, sinon il est créé</li>
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
          <p className="text-xs text-[#6b7d74] mb-3">
            📐 Chaque photo est automatiquement recadrée en format carte d'identité (portrait,
            centrée sur le visage) et compressée avant l'envoi — inutile de les retoucher toi-même
            au préalable, même des photos très lourdes ou en paysage passent sans problème.
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
            {importingPhotos
              ? progressionPhotos
                ? `Import… ${progressionPhotos.fait}/${progressionPhotos.total}`
                : 'Lecture du zip…'
              : 'Importer les photos'}
          </button>

          {progressionPhotos && (
            <div className="mt-3 h-2 bg-[#f1f5f2] rounded-full overflow-hidden">
              <div
                className="h-full bg-vert-clair transition-all"
                style={{
                  width: `${Math.round((progressionPhotos.fait / progressionPhotos.total) * 100)}%`
                }}
              />
            </div>
          )}

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
