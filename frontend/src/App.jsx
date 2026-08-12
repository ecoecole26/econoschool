import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Eleves from './pages/Eleves.jsx'
import ParametresEtablissement from './pages/ParametresEtablissement.jsx'
import CreationCompte from './pages/CreationCompte.jsx'
import TarifsParNiveau from './pages/TarifsParNiveau.jsx'
import TypesDeFrais from './pages/TypesDeFrais.jsx'
import ImportEleves from './pages/ImportEleves.jsx'
import Banque from './pages/Banque.jsx'
import Paiements from './pages/Paiements.jsx'
import Caisse from './pages/Caisse.jsx'
import Entrees from './pages/Entrees.jsx'
import Depenses from './pages/Depenses.jsx'
import Reductions from './pages/Reductions.jsx'
import Retards from './pages/Retards.jsx'
import ProfilEleve from './pages/ProfilEleve.jsx'
import TableauDeBord from './pages/TableauDeBord.jsx'
import Rapports from './pages/Rapports.jsx'
import BilanPeriodique from './pages/BilanPeriodique.jsx'
import DateButoir from './pages/DateButoir.jsx'

function RequireAuth({ children }) {
  const token = localStorage.getItem('econoschool_token')
  return token ? children : <Navigate to="/" replace />
}

function protect(el) {
  return <RequireAuth>{el}</RequireAuth>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />

      {/* Paramétrages */}
      <Route path="/parametres" element={protect(<ParametresEtablissement />)} />
      <Route path="/creation-compte" element={<CreationCompte />} />
      <Route path="/tarifs" element={protect(<TarifsParNiveau />)} />
      <Route path="/types-frais" element={protect(<TypesDeFrais />)} />
      <Route path="/import-eleves" element={protect(<ImportEleves />)} />
      <Route path="/banque" element={protect(<Banque />)} />

      {/* Reste du menu */}
      <Route path="/tableau-de-bord" element={protect(<TableauDeBord />)} />
      <Route path="/eleves" element={protect(<Eleves />)} />
      <Route path="/paiements" element={protect(<Paiements />)} />
      <Route path="/caisse" element={protect(<Caisse />)} />
      <Route path="/entrees" element={protect(<Entrees />)} />
      <Route path="/depenses" element={protect(<Depenses />)} />
      <Route path="/reductions" element={protect(<Reductions />)} />
      <Route path="/rapports" element={protect(<Rapports />)} />
      <Route path="/retards" element={protect(<Retards />)} />
      <Route path="/eleves/:matricule/profil" element={protect(<ProfilEleve />)} />
      <Route path="/bilan" element={protect(<BilanPeriodique />)} />
      <Route path="/butoir" element={protect(<DateButoir />)} />
    </Routes>
  )
}
