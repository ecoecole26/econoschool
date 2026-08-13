// Boutons transparents à contour fin, façon image de référence :
// fond blanc/transparent, bordure fine colorée, icône de la même couleur.
const VARIANTS = {
  teal: 'border-teal text-teal hover:bg-teal-light',
  orange: 'border-orange text-orange hover:bg-[#fff1e0]',
  danger: 'border-danger text-danger hover:bg-red-50'
}

/** <IconButton variant="teal" onClick={...}>👁️</IconButton> */
export default function IconButton({ variant = 'teal', onClick, children, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`w-9 h-9 flex items-center justify-center rounded-lg border bg-white text-base transition ${VARIANTS[variant]}`}
    >
      {children}
    </button>
  )
}
