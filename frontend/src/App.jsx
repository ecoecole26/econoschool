import { Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login.jsx'
import Eleves from './pages/Eleves.jsx'
import ParametresEtablissement from './pages/ParametresEtablissement.jsx'
import CreationCompte from './pages/CreationCompte.jsx'
import ComingSoon from './components/ComingSoon.jsx'

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

      {/* Paramétrages — 5 pages */}
      <Route path="/parametres" element={protect(<ParametresEtablissement />)} />
      <Route path="/creation-compte" element={<CreationCompte />} />
      <Route
        path="/tarifs"
        element={protect(<ComingSoon title="Tarifs par niveau" icon="💰" />)}
      />
      <Route
        path="/types-frais"
        element={protect(<ComingSoon title="Types de frais" icon="🏷️" />)}
      />
      <Route path="/banque" element={protect(<ComingSoon title="Banque" icon="🏛️" />)} />

      {/* Reste du menu */}
      <Route
        path="/tableau-de-bord"
        element={protect(<ComingSoon title="Tableau de bord" icon="📊" />)}
      />
      <Route path="/eleves" element={protect(<Eleves />)} />
      <Route
        path="/paiements"
        element={protect(<ComingSoon title="Paiements" icon="💳" />)}
      />
      <Route path="/caisse" element={protect(<ComingSoon title="Caisse" icon="🗃️" />)} />
      <Route
        path="/depenses"
        element={protect(<ComingSoon title="Dépenses" icon="📤" />)}
      />
      <Route
        path="/reductions"
        element={protect(<ComingSoon title="Réductions" icon="🎁" />)}
      />
      <Route
        path="/rapports"
        element={protect(<ComingSoon title="Rapports" icon="📈" />)}
      />
      <Route path="/retards" element={protect(<ComingSoon title="Retards" icon="⚠️" />)} />
      <Route
        path="/bilan"
        element={protect(<ComingSoon title="Bilan périodique" icon="📋" />)}
      />
      <Route
        path="/butoir"
        element={protect(<ComingSoon title="Date butoir" icon="📅" />)}
      />
    </Routes>
  )
}
