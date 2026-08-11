import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../lib/api.js'

export default function Login() {
  const navigate = useNavigate()
  const [role, setRole] = useState('fondateur')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [needsBootstrap, setNeedsBootstrap] = useState(false)

  useEffect(() => {
    api.getBootstrapStatus().then(({ needsBootstrap }) => setNeedsBootstrap(needsBootstrap)).catch(() => {})
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!password) {
      setError('Entrez le mot de passe')
      return
    }
    setError('')
    setLoading(true)
    try {
      const { token } = await api.login(role, password)
      localStorage.setItem('econoschool_token', token)
      localStorage.setItem('econoschool_role', role)
      navigate('/tableau-de-bord')
    } catch (err) {
      setError(err.message || 'Mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[1180px] bg-white rounded-[32px] shadow-[0_40px_90px_rgba(11,61,36,0.22)] overflow-hidden flex flex-col md:flex-row min-h-[720px]">

        {/* Panneau gauche - logo */}
        <div className="md:w-1/2 flex items-center justify-center p-10 bg-gradient-to-br from-[#052e16] via-[#146c43] to-[#1a8551]">
          <div className="flex flex-col items-center gap-7">
            <div className="w-[380px] h-[380px] bg-white rounded-full flex items-center justify-center shadow-[0_24px_55px_rgba(0,0,0,0.3)] border-[6px] border-white/20 p-3">
              <img src="/logo-icon.png" alt="Logo EconoSchool" className="w-full h-full object-contain" />
            </div>
            <div className="text-center">
              <span className="block font-display font-extrabold text-[38px] leading-tight whitespace-nowrap">
                <span className="text-white">ECONO </span>
                <span className="text-orange-clair tracking-[0.1em]">SCHOOL</span>
              </span>
              <div className="mt-3 text-base tracking-[0.1em] uppercase text-white/70">
                Gestion d'économat scolaire
              </div>
            </div>
          </div>
        </div>

        {/* Panneau droit - formulaire */}
        <div className="md:w-1/2 px-10 py-14 md:px-[80px] flex flex-col justify-center">
          <h3 className="text-[44px] font-display font-bold text-vert-fonce mb-3">Connexion</h3>
          <p className="text-lg text-[#6b7d74] mb-10 leading-relaxed">
            Entrez vos identifiants pour accéder à votre espace.
          </p>

          <div className="flex gap-3 bg-[#f3f6f4] border border-[#e3ebe6] rounded-2xl p-2 mb-9">
            <button
              type="button"
              onClick={() => setRole('fondateur')}
              className={`flex-1 text-center py-3 px-2 rounded-xl text-base font-semibold transition ${
                role === 'fondateur'
                  ? 'bg-white text-[#8a5b00] shadow-sm'
                  : 'text-[#7a4a34]'
              }`}
            >
              👑 Fondateur
            </button>
            <button
              type="button"
              onClick={() => setRole('proviseur')}
              className={`flex-1 text-center py-3 px-2 rounded-xl text-base font-semibold transition ${
                role === 'proviseur'
                  ? 'bg-white text-[#8a5b00] shadow-sm'
                  : 'text-[#7a4a34]'
              }`}
            >
              🎓 Proviseur
            </button>
            <button
              type="button"
              onClick={() => setRole('econome')}
              className={`flex-1 text-center py-3 px-2 rounded-xl text-base font-semibold transition ${
                role === 'econome'
                  ? 'bg-white text-[#8a5b00] shadow-sm'
                  : 'text-[#7a4a34]'
              }`}
            >
              💼 Économe
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-6">
              <label className="block text-center text-lg font-bold text-vert-fonce mb-3">
                Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                className="w-full px-5 py-5 border-2 border-[#e3ebe6] rounded-2xl text-lg bg-[#fbfdfc] focus:outline-none focus:border-vert-clair"
              />
            </div>

            {error && (
              <div className="mb-6 text-base text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 rounded-2xl text-white font-bold text-xl bg-gradient-to-r from-[#0d4a29] to-vert disabled:opacity-60"
            >
              {loading ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>

          {needsBootstrap && (
            <p className="text-center text-base text-[#6b7d74] mt-7">
              Aucun compte configuré —{' '}
              <Link to="/creation-compte" className="text-teal font-semibold">
                créer le premier compte Fondateur
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
