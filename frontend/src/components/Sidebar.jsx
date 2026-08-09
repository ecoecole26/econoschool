import { NavLink } from 'react-router-dom'

const NAV_SECTIONS = [
  {
    title: 'Principal',
    items: [{ to: '/tableau-de-bord', label: 'Tableau de bord', icon: '📊' }]
  },
  {
    title: 'Paramétrages',
    items: [
      { to: '/parametres', label: 'Identification établissement', icon: '⚙️' },
      { to: '/creation-compte', label: 'Création de compte', icon: '👤' },
      { to: '/tarifs', label: 'Tarifs par niveau', icon: '💰' },
      { to: '/types-frais', label: 'Types de frais', icon: '🏷️' },
      { to: '/import-eleves', label: 'Importer élèves', icon: '📥' },
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

// Sidebar claire, façon EcoleWeb : fond blanc, logo + nom en haut,
// items de nav en texte teal, item actif en pilule vert foncé pleine.
// (Le rôle connecté et la déconnexion sont déjà affichés dans la Topbar.)
export default function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-white border-r border-[#e3ebe6] min-h-screen flex flex-col">
      <div className="px-5 py-4 flex items-center gap-3 border-b border-[#eef3f0]">
        <img src="/logo-icon.png" alt="EconoSchool" className="w-9 h-9 rounded-full" />
        <span className="font-display font-bold text-lg text-vert-fonce">EconoSchool</span>
      </div>

      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        {NAV_SECTIONS.map((section, i) => (
          <div key={i} className="mb-3">
            <div className="px-3 mb-1 text-[10px] uppercase tracking-wider text-[#9aa8a1] font-semibold">
              {section.title}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm mb-0.5 transition ${
                    isActive
                      ? 'bg-vert-fonce text-white font-semibold'
                      : 'text-teal hover:bg-teal-light'
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
    </aside>
  )
}
