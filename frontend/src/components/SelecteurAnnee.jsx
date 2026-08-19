import { useState } from 'react'
import { useAnnee } from '../context/AnneeContext.jsx'
import { api } from '../lib/api.js'

// Propose l'année scolaire suivant la plus récente déjà connue (ex: la
// plus récente est "2026-2027" -> propose "2027-2028"), pour préremplir le
// formulaire de création sans que le Fondateur ait à faire le calcul.
function anneeSuivante(annees) {
  if (!annees || annees.length === 0) return ''
  const derniere = annees[annees.length - 1]
  const match = /^(\d{4})-(\d{4})$/.exec(derniere)
  if (!match) return ''
  const debut = Number(match[1]) + 1
  return `${debut}-${debut + 1}`
}

export default function SelecteurAnnee() {
  const { annees, anneeCourante, anneeSelectionnee, setAnneeSelectionnee, loading, rafraichir } = useAnnee()
  const [ouvert, setOuvert] = useState(false)
  const [creationOuverte, setCreationOuverte] = useState(false)
  const [nouvelleAnnee, setNouvelleAnnee] = useState('')
  const [creation, setCreation] = useState(false)
  const [erreur, setErreur] = useState('')

  const role = localStorage.getItem('econoschool_role')
  const estFondateur = role === 'fondateur'

  // Le sélecteur reste utile même sans année existante : c'est justement
  // le cas d'un établissement neuf qui doit pouvoir créer sa 1ère année
  // depuis l'interface, sans intervention technique.
  if (loading) return null
  if (annees.length === 0 && !estFondateur) return null

  function choisir(annee) {
    setAnneeSelectionnee(annee)
    setOuvert(false)
  }

  async function creerAnnee(e) {
    e.preventDefault()
    const valeur = nouvelleAnnee.trim()
    if (!/^\d{4}-\d{4}$/.test(valeur)) {
      setErreur('Format attendu : "2027-2028"')
      return
    }
    setCreation(true)
    setErreur('')
    try {
      await api.creerAnneeScolaire(valeur)
      await rafraichir()
      setAnneeSelectionnee(valeur)
      setCreationOuverte(false)
      setNouvelleAnnee('')
      setOuvert(false)
    } catch (err) {
      setErreur(err.message || "Erreur lors de la création de l'année")
    } finally {
      setCreation(false)
    }
  }

  const estAnneeCourante = anneeSelectionnee === anneeCourante

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert((o) => !o)}
        className={`px-3 md:px-4 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap transition ${
          annees.length === 0
            ? 'border-orange text-orange bg-[#fff7ed] hover:bg-[#ffedd5]'
            : estAnneeCourante
              ? 'border-vert text-vert hover:bg-teal-light'
              : 'border-orange text-orange bg-[#fff7ed] hover:bg-[#ffedd5]'
        }`}
        title={estAnneeCourante ? 'Année en cours (modifiable)' : 'Année passée (lecture seule)'}
      >
        📅 <span className="hidden sm:inline">{anneeSelectionnee || 'Aucune année — à créer'}</span>
        <span className={`transition-transform ${ouvert ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 mt-2 z-20 bg-white rounded-2xl border border-[#e3ebe6] shadow-xl p-3 w-72">
            <div className="text-xs font-bold text-white bg-vert-fonce rounded-lg px-3 py-2 mb-2 uppercase tracking-wide text-center">
              📅 Années scolaires
            </div>

            {annees.length > 0 && (
              <>
                <div className="text-center text-xs text-[#6b7d74] mb-2">
                  Année sélectionnée : <span className="font-bold text-vert-fonce">{anneeSelectionnee}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {annees.map((annee) => (
                    <button
                      key={annee}
                      onClick={() => choisir(annee)}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border transition ${
                        annee === anneeSelectionnee
                          ? 'bg-vert-fonce text-white border-vert-fonce'
                          : annee === anneeCourante
                            ? 'border-vert text-vert hover:bg-teal-light'
                            : 'border-[#e3ebe6] text-[#3d4f45] hover:bg-[#f6f8f7]'
                      }`}
                    >
                      {annee}
                      {annee === anneeCourante && annee !== anneeSelectionnee && (
                        <span className="block text-[9px] font-normal opacity-70 normal-case">en cours</span>
                      )}
                    </button>
                  ))}
                </div>
                {!estAnneeCourante && (
                  <p className="text-[11px] text-orange text-center mb-2 leading-snug">
                    🔒 Année passée : consultation uniquement, aucune modification possible.
                  </p>
                )}
              </>
            )}

            {annees.length === 0 && (
              <p className="text-[11px] text-orange text-center mb-2 leading-snug">
                ⚠️ Aucune année scolaire configurée pour cet établissement.
              </p>
            )}

            {/* Démarrer une nouvelle année : réservé au Fondateur (le
                backend l'impose déjà, on l'affiche donc uniquement à lui). */}
            {estFondateur && (
              <div className="pt-2 border-t border-[#f0f5f3]">
                {!creationOuverte ? (
                  <button
                    onClick={() => {
                      setCreationOuverte(true)
                      setNouvelleAnnee(anneeSuivante(annees))
                      setErreur('')
                    }}
                    className="w-full text-center text-xs font-semibold text-vert-fonce border border-dashed border-vert rounded-lg py-2 hover:bg-teal-light"
                  >
                    + Démarrer une nouvelle année
                  </button>
                ) : (
                  <form onSubmit={creerAnnee} className="space-y-2">
                    <input
                      type="text"
                      value={nouvelleAnnee}
                      onChange={(e) => setNouvelleAnnee(e.target.value)}
                      placeholder="2027-2028"
                      className="w-full text-sm border border-[#e3ebe6] rounded-lg px-3 py-2 text-center"
                      autoFocus
                    />
                    {erreur && <p className="text-[11px] text-red-600 text-center">{erreur}</p>}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setCreationOuverte(false)
                          setErreur('')
                        }}
                        className="flex-1 text-xs font-semibold text-[#6b7d74] border border-[#e3ebe6] rounded-lg py-2"
                      >
                        Annuler
                      </button>
                      <button
                        type="submit"
                        disabled={creation}
                        className="flex-1 text-xs font-semibold text-white bg-vert-fonce rounded-lg py-2 disabled:opacity-60"
                      >
                        {creation ? 'Création…' : 'Créer'}
                      </button>
                    </div>
                    <p className="text-[10px] text-[#9aa8a1] text-center leading-snug">
                      Les tarifs actuels sont recopiés comme point de départ. L'année en cours reste
                      intacte et consultable.
                    </p>
                  </form>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
