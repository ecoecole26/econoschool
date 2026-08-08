const VARIANTS = {
  vert: 'bg-vert-fonce text-white',
  teal: 'bg-teal-light text-teal',
  rose: 'bg-rose-light text-rose',
  orange: 'bg-[#fff1e0] text-orange',
  violet: 'bg-purple-light text-purple-badge'
}

/** <StatPill label="Effectif total" value={1641} variant="vert" /> */
export default function StatPill({ label, value, variant = 'teal' }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold ${VARIANTS[variant]}`}
    >
      {label} : {value}
    </span>
  )
}
