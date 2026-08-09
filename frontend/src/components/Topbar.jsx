import { useNavigate } from 'react-router-dom'

export default function Topbar({ title }) {
  const navigate = useNavigate()
  const role = localStorage.getItem('econoschool_role')

  function logout() {
    localStorage.removeItem('econoschool_token')
    localStorage.removeItem('econoschool_role')
    navigate('/')
  }

  return (
    <header className="flex items-center justify-between px-8 py-3.5 bg-white border-b border-[#e3ebe6]">
      <h1 className="text-2xl font-display font-bold text-vert-fonce">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="text-right leading-tight">
          <div className="text-sm font-semibold text-vert-fonce capitalize">{role || '—'}</div>
          <div className="text-xs text-[#6b7d74]">Espace EconoSchool</div>
        </div>
        <button
          onClick={logout}
          className="px-4 py-1.5 rounded-lg border border-vert text-vert text-sm font-semibold hover:bg-teal-light transition"
        >
          Déconnexion
        </button>
      </div>
    </header>
  )
}
