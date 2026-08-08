import { useEffect } from 'react'

/**
 * Popup générique. Utilisation :
 * <Modal open={open} onClose={() => setOpen(false)} title="Fiche élève">
 *   ...contenu...
 * </Modal>
 */
export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    function onEsc(e) {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* carte popup */}
      <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e3ebe6]">
          <h3 className="text-lg font-display font-bold text-vert-fonce">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 flex items-center justify-center rounded-full text-[#6b7d74] hover:bg-[#f3f6f4]"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-[#e3ebe6] flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
