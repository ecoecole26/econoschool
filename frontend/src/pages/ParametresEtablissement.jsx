import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput, Select } from '../components/ui.jsx'
import { api } from '../lib/api.js'

// Colonnes réelles de la table Supabase `etablissements` :
// id (text, = nom), nom, ville, telephone, email, annee, logo_url, statut_ecole, created_at
// + colonnes ajoutées (voir backend/migrations/001_etablissements_colonnes.sql) :
// code_etablissement, adresse, type, academie, devise
// (les colonnes bancaires banque_* vivent aussi sur cette table, mais sont
// gérées sur leur propre page — voir pages/Banque.jsx)
const EMPTY = {
  nom: '',
  ville: '',
  telephone: '',
  email: '',
  annee: '',
  statut_ecole: 'Privé',
  logo_url: '',
  code_etablissement: '',
  adresse: '',
  type: 'Collège',
  academie: '',
  devise: 'FCFA'
}

export default function ParametresEtablissement() {
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    api
      .getEtablissement()
      .then(({ etablissement }) => {
        if (etablissement) setForm({ ...EMPTY, ...etablissement })
      })
      .catch((err) => setMessage(err.message))
      .finally(() => setLoading(false))
  }, [])

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const { etablissement } = await api.saveEtablissement(form)
      setForm({ ...EMPTY, ...etablissement })
      setMessage('Enregistré ✅')
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la sauvegarde — as-tu exécuté la migration SQL ?')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Identification établissement">
      <PageHeader
        icon="⚙️"
        title="Identification de l'établissement"
        subtitle="Ces informations apparaissent sur les reçus et documents officiels."
        onSave={handleSave}
        saving={saving}
      />

      {message && (
        <div className="mb-5 text-sm px-3 py-2 rounded-lg bg-teal-light text-teal inline-block">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
            <Field label="Nom de l'établissement" required>
              <TextInput value={form.nom} onChange={set('nom')} placeholder="Collège Moderne Bouaké Dar Es Salam" />
            </Field>
            <Field label="Code établissement (DRENAET)">
              <TextInput value={form.code_etablissement} onChange={set('code_etablissement')} placeholder="017242" />
            </Field>

            <Field label="Type">
              <Select value={form.type} onChange={set('type')}>
                <option>Collège</option>
                <option>Lycée</option>
                <option>Collège-Lycée</option>
                <option>Primaire</option>
              </Select>
            </Field>
            <Field label="Statut">
              <Select value={form.statut_ecole} onChange={set('statut_ecole')}>
                <option>Public</option>
                <option>Privé</option>
              </Select>
            </Field>

            <Field label="Académie / DRENAET">
              <TextInput value={form.academie} onChange={set('academie')} placeholder="DRENAET Bouaké 1" />
            </Field>
            <Field label="Année scolaire" required>
              <TextInput value={form.annee} onChange={set('annee')} placeholder="2025-2026" />
            </Field>

            <Field label="Adresse">
              <TextInput value={form.adresse} onChange={set('adresse')} placeholder="Ex: Quartier..." />
            </Field>
            <Field label="Ville">
              <TextInput value={form.ville} onChange={set('ville')} placeholder="Bouaké" />
            </Field>

            <Field label="Téléphone">
              <TextInput value={form.telephone} onChange={set('telephone')} placeholder="+225 XX XX XX XX XX" />
            </Field>
            <Field label="Email">
              <TextInput value={form.email} onChange={set('email')} placeholder="contact@ecole.ci" />
            </Field>

            <Field label="Devise">
              <Select value={form.devise} onChange={set('devise')}>
                <option>FCFA</option>
                <option>EUR</option>
                <option>USD</option>
              </Select>
            </Field>
          </div>

          <Field label="Logo (URL)">
            <TextInput
              value={form.logo_url || ''}
              onChange={set('logo_url')}
              placeholder="Sera remplacé par un vrai bouton d'upload à l'étape suivante"
            />
          </Field>
        </Card>
      )}
    </Layout>
  )
}
