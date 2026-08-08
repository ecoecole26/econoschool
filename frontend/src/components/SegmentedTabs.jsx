/**
 * Tab arrondi façon EcoleWeb : conteneur clair avec bordure, segment actif
 * en pilule vert foncé + texte blanc, segments inactifs en texte teal.
 *
 * <SegmentedTabs
 *   options={[{ value: 'liste', label: 'Liste' }, { value: 'trombi', label: 'Trombinoscope' }]}
 *   value={tab}
 *   onChange={setTab}
 * />
 */
export default function SegmentedTabs({ options, value, onChange }) {
  return (
    <div className="inline-flex items-center gap-1 bg-white border border-[#d7e8de] rounded-xl p-1">
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition whitespace-nowrap ${
              active
                ? 'bg-vert-fonce text-white'
                : 'text-teal hover:bg-teal-light'
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
