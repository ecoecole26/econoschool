import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

function formatDateHeure(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const datePart = d.toLocaleDateString('fr-FR')
  const heurePart = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${datePart} à ${heurePart}`
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [ouvert, setOuvert] = useState(false)
  const ref = useRef(null)

  function charger() {
    api
      .getNotifications()
      .then(({ notifications }) => setNotifications(notifications || []))
      .catch(() => {})
  }

  useEffect(() => {
    charger()
    // Rafraîchit périodiquement pour voir les nouvelles ouvertures de caisse
    // sans avoir à recharger la page.
    const id = setInterval(charger, 60000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOuvert(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const nonLues = notifications.filter((n) => !n.lu).length

  async function toutMarquerLu() {
    try {
      await api.marquerToutesNotificationsLues()
      setNotifications((liste) => liste.map((n) => ({ ...n, lu: true })))
    } catch {
      // silencieux : pas critique si ça échoue
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOuvert((o) => !o)}
        aria-label="Notifications"
        className="relative w-9 h-9 rounded-lg border border-[#e3ebe6] flex items-center justify-center text-vert-fonce hover:bg-teal-light transition"
      >
        🔔
        {nonLues > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose text-white text-[10px] font-bold flex items-center justify-center">
            {nonLues > 9 ? '9+' : nonLues}
          </span>
        )}
      </button>

      {ouvert && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl border border-[#e3ebe6] shadow-lg z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#f1f5f2]">
            <span className="text-sm font-semibold text-vert-fonce">Notifications</span>
            {nonLues > 0 && (
              <button onClick={toutMarquerLu} className="text-xs text-teal underline">
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-[#9aa8a1] text-center py-6">Aucune notification.</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-[#f7faf8] text-sm ${!n.lu ? 'bg-teal-light/40' : ''}`}
                >
                  <div className="font-semibold text-vert-fonce">{n.titre}</div>
                  <div className="text-[#6b7d74] mt-0.5">{n.message}</div>
                  <div className="text-[11px] text-[#9aa8a1] mt-1">{formatDateHeure(n.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
