import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const AnneeContext = createContext(null)

// Fournit à toute l'appli : la liste des années disponibles, l'année
// scolaire ACTIVE de l'établissement (seule modifiable), et l'année
// actuellement CONSULTÉE par l'utilisateur (via le sélecteur du Topbar).
// Toute année différente de l'année active est en lecture seule.
export function AnneeProvider({ children }) {
  const [annees, setAnnees] = useState([])
  const [anneeCourante, setAnneeCourante] = useState(null)
  const [anneeSelectionnee, setAnneeSelectionnee] = useState(null)
  const [loading, setLoading] = useState(true)

  const rafraichir = useCallback(() => {
    const token = localStorage.getItem('econoschool_token')
    if (!token) {
      setLoading(false)
      return Promise.resolve()
    }
    return api
      .getAnnees()
      .then(({ annees, annee_courante }) => {
        setAnnees(annees || [])
        setAnneeCourante(annee_courante || null)
        // Ne réinitialise la sélection que si elle n'a encore jamais été
        // faite, ou si l'année sélectionnée n'existe plus (ex: juste après
        // la création d'une toute première année) — pour ne pas ramener
        // l'utilisateur sur l'année courante s'il consultait une année passée.
        setAnneeSelectionnee((actuelle) =>
          actuelle && (annees || []).includes(actuelle) ? actuelle : annee_courante || null
        )
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    rafraichir()
  }, [rafraichir])

  const estLectureSeule = !!anneeSelectionnee && !!anneeCourante && anneeSelectionnee !== anneeCourante

  return (
    <AnneeContext.Provider
      value={{
        annees,
        anneeCourante,
        anneeSelectionnee: anneeSelectionnee || anneeCourante,
        estLectureSeule,
        loading,
        setAnneeSelectionnee,
        rafraichir
      }}
    >
      {children}
    </AnneeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAnnee() {
  const ctx = useContext(AnneeContext)
  if (!ctx) {
    // Sécurité : si un composant est monté hors du Provider (ex. page
    // Login), on renvoie des valeurs neutres plutôt que de planter.
    return {
      annees: [],
      anneeCourante: null,
      anneeSelectionnee: null,
      estLectureSeule: false,
      loading: false,
      setAnneeSelectionnee: () => {},
      rafraichir: () => {}
    }
  }
  return ctx
}
