export function Card({ title, icon, children, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#e3ebe6] p-5 ${className}`}>
      {title && (
        <h3 className="text-base font-display font-bold text-vert-fonce mb-3 flex items-center gap-2">
          {icon} {title}
        </h3>
      )}
      {children}
    </div>
  )
}

export function Field({ label, required, children }) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-semibold text-[#3d4f45] mb-1.5">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  )
}

export function TextInput(props) {
  return (
    <input
      {...props}
      className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm bg-white focus:outline-none focus:border-teal disabled:bg-[#f6f8f7] disabled:text-[#9aa8a1]"
    />
  )
}

export function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full px-3.5 py-2.5 border border-[#d7e8de] rounded-lg text-sm bg-white focus:outline-none focus:border-teal"
    >
      {children}
    </select>
  )
}
