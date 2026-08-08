/**
 * En-tête de page façon Paramétrages : icône + titre + sous-titre à gauche,
 * bouton "Sauvegarder" vert à droite (optionnel).
 */
export default function PageHeader({ icon, title, subtitle, onSave, saving, saveLabel = 'Sauvegarder' }) {
  return (
    <div className="flex items-start justify-between mb-7">
      <div>
        <h2 className="text-2xl font-display font-bold text-vert-fonce flex items-center gap-2.5">
          <span>{icon}</span> {title}
        </h2>
        {subtitle && <p className="text-sm text-[#6b7d74] mt-1">{subtitle}</p>}
      </div>
      {onSave && (
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
        >
          💾 {saving ? 'Sauvegarde…' : saveLabel}
        </button>
      )}
    </div>
  )
}
