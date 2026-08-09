import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

const EMPTY_COMPTE = { nom_complet: '', login: '', mot_de_passe: '' }
const ROLES = ['fondateur', 'proviseur', 'econome']

export default function CreationCompte() {
  const isLoggedIn = !!localStorage.getItem('econoschool_token')
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const [comptes, setComptes] = useState({
    fondateur: EMPTY_COMPTE,
    proviseur: EMPTY_COMPTE,
    econome: EMPTY_COMPTE
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [message, setMessage] = useState({ fondateur: '', proviseur: '', econome: '' })

  useEffect(() => {
    api
      .getBootstrapStatus()
      .then(({ needsBootstrap }) => {
        setNeedsBootstrap(needsBootstrap)
        if (!needsBootstrap && isLoggedIn) {
          return api.getComptes().then(({ comptes: c }) => {
            setComptes({
              fondateur: c.fondateur ? { ...c.fondateur, mot_de_passe: '' } : EMPTY_COMPTE,
              proviseur: c.proviseur ? { ...c.proviseur, mot_de_passe: '' } : EMPTY_COMPTE,
              econome: c.econome ? { ...c.econome, mot_de_passe: '' } : EMPTY_COMPTE
            })
          })
        }
      })
      .catch((err) => setMessage((m) => ({ ...m, fondateur: err.message })))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setField(role, field) {
    return (e) =>
      setComptes((c) => ({ ...c, [role]: { ...c[role], [field]: e.target.value } }))
  }

  async function handleSave(role) {
    setSaving(role)
    setMessage((m) => ({ ...m, [role]: '' }))
    try {
      const { mot_de_passe, ...rest } = comptes[role]
      const payload = mot_de_passe ? { ...rest, mot_de_passe } : rest
      const { compte } = await api.saveCompte(role, payload)
      setComptes((c) => ({ ...c, [role]: { ...compte, mot_de_passe: '' } }))
      setMessage((m) => ({ ...m, [role]: 'Enregistré ✅' }))
      if (role === 'fondateur' && needsBootstrap) setNeedsBootstrap(false)
    } catch (err) {
      setMessage((m) => ({ ...m, [role]: err.message || 'Erreur' }))
    } finally {
      setSaving(null)
    }
  }

  // Cas 1 : personne n'est connecté ET il existe déjà un compte Fondateur
  // → il faut se connecter pour gérer les comptes.
  if (!loading && !needsBootstrap && !isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-8 max-w-sm text-center">
          <div className="text-3xl mb-3">🔒</div>
          <h2 className="font-display font-bold text-vert-fonce mb-2">Connexion requise</h2>
          <p className="text-sm text-[#6b7d74] mb-5">
            Un compte Fondateur existe déjà. Connecte-toi avec ce compte pour gérer les comptes.
          </p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold"
          >
            Aller à la connexion
          </Link>
        </div>
      </div>
    )
  }

  // Cas 2 : premier lancement, aucun Fondateur — écran de création minimal, sans sidebar
  // (on ne peut pas encore afficher le shell complet puisqu'il n'y a personne de connecté).
  if (!loading && needsBootstrap) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <img src="/logo-icon.png" alt="EconoSchool" className="w-16 h-16 rounded-full bg-white p-2 mx-auto mb-3 shadow" />
            <h1 className="font-display font-bold text-xl text-vert-fonce">Bienvenue sur EconoSchool</h1>
            <p className="text-sm text-[#6b7d74] mt-1">
              Aucun compte Fondateur n'existe encore — créons-le maintenant.
            </p>
          </div>
          <CompteCard
            role="fondateur"
            icon="👑"
            title="Compte Fondateur"
            data={comptes.fondateur}
            setField={setField}
            onSave={() => handleSave('fondateur')}
            saving={saving === 'fondateur'}
            message={message.fondateur}
          />
        </div>
      </div>
    )
  }

  // Cas 3 : connecté en tant que Fondateur → gestion normale des 2 comptes
  return (
    <Layout title="Création de compte">
      <PageHeader
        icon="👤"
        title="Création de compte"
        subtitle="Fondateur (accès complet), Proviseur et Économe (accès restreints)."
      />

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CompteCard
            role="fondateur"
            icon="👑"
            title="Compte Fondateur"
            data={comptes.fondateur}
            setField={setField}
            onSave={() => handleSave('fondateur')}
            saving={saving === 'fondateur'}
            message={message.fondateur}
          />
          <CompteCard
            role="proviseur"
            icon="🎓"
            title="Compte Proviseur"
            data={comptes.proviseur}
            setField={setField}
            onSave={() => handleSave('proviseur')}
            saving={saving === 'proviseur'}
            message={message.proviseur}
          />
          <CompteCard
            role="econome"
            icon="💼"
            title="Compte Économe"
            data={comptes.econome}
            setField={setField}
            onSave={() => handleSave('econome')}
            saving={saving === 'econome'}
            message={message.econome}
          />
        </div>
      )}
    </Layout>
  )
}

function CompteCard({ role, icon, title, data, setField, onSave, saving, message }) {
  return (
    <Card title={title} icon={icon}>
      <Field label="Nom complet" required>
        <TextInput value={data.nom_complet} onChange={setField(role, 'nom_complet')} placeholder={title} />
      </Field>
      <Field label="Login" required>
        <TextInput value={data.login} onChange={setField(role, 'login')} placeholder={role} />
      </Field>
      <Field label="Mot de passe" required={!data.login}>
        <TextInput
          type="password"
          value={data.mot_de_passe}
          onChange={setField(role, 'mot_de_passe')}
          placeholder={data.login ? 'Laisser vide pour ne pas changer' : 'Requis à la création'}
        />
      </Field>

      {message && <div className="text-xs mb-3 text-teal">{message}</div>}

      <button
        onClick={onSave}
        disabled={saving}
        className="w-full py-2.5 rounded-lg bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
      >
        {saving ? 'Sauvegarde…' : 'Sauvegarder'}
      </button>
    </Card>
  )
}
