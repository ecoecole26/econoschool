import { ListeMouvements } from './Entrees.jsx'

export default function Depenses() {
  return (
    <ListeMouvements
      typeOperation="Sortie"
      icone="📤"
      titre="Dépenses"
      sousTitre="Toutes les sorties enregistrées dans les caisses (dépenses, retraits)."
      couleurTotal="text-rose"
      nomFichier="depenses.csv"
    />
  )
}
