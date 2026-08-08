// Ronds pleins colorés, façon EcoleWeb : fond de couleur + icône blanche.
const VARIANTS = {
  teal: 'bg-teal hover:bg-teal/90',
  orange: 'bg-orange hover:bg-orange/90',
  danger: 'bg-danger hover:bg-danger/90'
}

/** <IconButton variant="teal" onClick={...}>👁️</IconButton> */
export default function IconButton({ variant = 'teal', onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-full text-white text-sm shadow-sm transition ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  )
}
