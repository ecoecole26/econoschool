import { useState } from 'react'
import Sidebar from './Sidebar.jsx'
import Topbar from './Topbar.jsx'

export default function Layout({ title, children }) {
  const [sidebarOuvert, setSidebarOuvert] = useState(false)

  return (
    <div id="app-shell" className="flex min-h-screen bg-bg">
      <Sidebar mobileOpen={sidebarOuvert} onClose={() => setSidebarOuvert(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} onToggleSidebar={() => setSidebarOuvert((o) => !o)} />
        <main className="flex-1 px-4 md:px-8 py-5 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
