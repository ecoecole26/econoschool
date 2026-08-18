import { useState } from 'react'
import { useAnnee } from '../context/AnneeContext.jsx'

export default function SelecteurAnnee() {
  const { annees, anneeCourante, anneeSelectionnee, setAnneeSelectionnee, loading } = useAnnee()
  const [ouvert, setOuvert] = useState(false)

  if (loading || annees.length === 0) return null

  function choisir(annee) {
    setAnneeSelectionnee(annee)
    setOuvert(false)
  }

  const estAnneeCourante = anneeSelectionnee === anneeCourante

  return (
    <div className="relative">
      <button
        onClick={() => setOuvert((o) => !o)}
        className={`px-3 md:px-4 py-1.5 rounded-lg border text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap transition ${
          estAnneeCourante
            ? 'border-vert text-vert hover:bg-teal-light'
            : 'border-orange text-orange bg-[#fff7ed] hover:bg-[#ffedd5]'
        }`}
        title={estAnneeCourante ? 'Année en cours (modifiable)' : 'Année passée (lecture seule)'}
      >
        📅 <span className="hidden sm:inline">{anneeSelectionnee || 'Année scolaire'}</span>
        <span className={`transition-transform ${ouvert ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 mt-2 z-20 bg-white rounded-2xl border border-[#e3ebe6] shadow-xl p-3 w-72">
            <div className="text-xs font-bold text-white bg-vert-fonce rounded-lg px-3 py-2 mb-2 uppercase tracking-wide text-center">
              📅 Années scolaires
            </div>
            <div className="text-center text-xs text-[#6b7d74] mb-2">
              Année sélectionnée : <span className="font-bold text-vert-fonce">{anneeSelectionnee}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
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
              <p className="text-[11px] text-orange text-center mt-3 leading-snug">
                🔒 Année passée : consultation uniquement, aucune modification possible.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
