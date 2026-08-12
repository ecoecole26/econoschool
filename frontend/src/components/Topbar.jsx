import { useNavigate } from 'react-router-dom'
import NotificationBell from './NotificationBell.jsx'

export default function Topbar({ title, onToggleSidebar }) {
  const navigate = useNavigate()
  const role = localStorage.getItem('econoschool_role')

  function logout() {
    localStorage.removeItem('econoschool_token')
    localStorage.removeItem('econoschool_role')
    navigate('/')
  }

  return (
    <header className="flex items-center justify-between gap-3 px-4 md:px-8 py-3.5 bg-white border-b border-[#e3ebe6]">
      <div className="flex items-center gap-3 min-w-0">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            aria-label="Ouvrir le menu"
            className="lg:hidden shrink-0 w-9 h-9 rounded-lg border border-[#e3ebe6] flex items-center justify-center text-vert-fonce"
          >
            ☰
          </button>
        )}
        <h1 className="text-lg md:text-2xl font-display font-bold text-vert-fonce truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <NotificationBell />
        <div className="text-right leading-tight hidden sm:block">
          <div className="text-sm font-semibold text-vert-fonce capitalize">{role || '—'}</div>
          <div className="text-xs text-[#6b7d74]">Espace EconoSchool</div>
        </div>
        <button
          onClick={logout}
          className="px-3 md:px-4 py-1.5 rounded-lg border border-vert text-vert text-sm font-semibold hover:bg-teal-light transition whitespace-nowrap"
        >
          Déconnexion
        </button>
      </div>
    </header>
  )
}
