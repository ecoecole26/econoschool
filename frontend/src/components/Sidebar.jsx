import { NavLink, useNavigate } from 'react-router-dom'

const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [{ to: '/tableau-de-bord', label: 'Tableau de bord', icon: '📊' }]
  },
  {
    title: 'Paramétrages',
    items: [
      { to: '/parametres', label: 'Paramètres', icon: '⚙️' },
      { to: '/creation-compte', label: 'Création de compte', icon: '👤' },
      { to: '/tarifs', label: 'Tarifs par niveau', icon: '💰' },
      { to: '/types-frais', label: 'Types de frais', icon: '🏷️' },
      { to: '/banque', label: 'Banque', icon: '🏛️' }
    ]
  },
  {
    title: 'Gestion',
    items: [
      { to: '/eleves', label: 'Élèves', icon: '🧑‍🎓' },
      { to: '/paiements', label: 'Paiements', icon: '💳' },
      { to: '/caisse', label: 'Caisse', icon: '🗃️' },
      { to: '/depenses', label: 'Dépenses', icon: '📤' },
      { to: '/reductions', label: 'Réductions', icon: '🎁' }
    ]
  },
  {
    title: 'Analyses',
    items: [
      { to: '/rapports', label: 'Rapports', icon: '📈' },
      { to: '/retards', label: 'Retards', icon: '⚠️' },
      { to: '/bilan', label: 'Bilan périodique', icon: '📋' },
      { to: '/butoir', label: 'Date butoir', icon: '📅' }
    ]
  }
]

export default function Sidebar() {
  const navigate = useNavigate()
  const role = localStorage.getItem('econoschool_role') || '—'

  function logout() {
    localStorage.removeItem('econoschool_token')
    localStorage.removeItem('econoschool_role')
    navigate('/')
  }

  return (
    <aside className="w-64 shrink-0 bg-sidebar text-white/80 min-h-screen flex flex-col">
      <div className="px-4 py-5 flex items-center gap-3">
        <img src="/logo-icon.png" alt="EconoSchool" className="w-9 h-9 rounded-full bg-white p-1" />
        <span className="font-display font-bold text-lg text-white">EconoSchool</span>
      </div>

      {/* Badge rôle connecté */}
      <div className="mx-4 mb-3 px-3 py-2.5 rounded-xl bg-white/5 flex items-center gap-2.5">
        <span className="text-xl leading-none">{role === 'fondateur' ? '👑' : '💼'}</span>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-white capitalize">{role}</div>
          <div className="text-[11px] text-white/45 capitalize">{role}</div>
        </div>
      </div>

      {/* Pastille de statut (placeholder — branchée plus tard sur l'état réel de la caisse) */}
      <div className="mx-4 mb-4 space-y-1.5">
        <div className="px-3 py-1.5 rounded-lg bg-white/5 text-[12px] text-white/70 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-vert-clair" /> Caisse — statut à venir
        </div>
      </div>

      <nav className="flex-1 px-3 pb-4 overflow-y-auto">
        {NAV_SECTIONS.map((section, i) => (
          <div key={i} className="mb-5">
            <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-white/35 font-semibold">
              {section.title}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm mb-0.5 transition ${
                    isActive
                      ? 'bg-vert text-white font-semibold'
                      : 'hover:bg-sidebar-hover text-white/70'
                  }`
                }
              >
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <button
        onClick={logout}
        className="mx-3 mb-4 px-3 py-2.5 rounded-lg text-sm font-semibold text-rose bg-rose/10 hover:bg-rose/20 transition flex items-center gap-2.5"
      >
        🚪 Déconnexion
      </button>
    </aside>
  )
}
