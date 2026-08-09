import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'

// Colonnes bancaires de la table Supabase `etablissements`
// (voir backend/migrations/005_etablissements_banque.sql).
// Vit sur la même table que l'identification établissement, mais sur sa
// propre page — on n'envoie au PUT que ces champs (mise à jour partielle,
// les autres colonnes de l'établissement ne sont pas touchées).
const EMPTY = {
  banque_nom: '',
  banque_titulaire: '',
  banque_rib: '',
  banque_iban: ''
}

export default function Banque() {
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
    <Layout title="Banque">
      <PageHeader
        icon="🏛️"
        title="Coordonnées bancaires"
        subtitle="Affichées sur les reçus pour les virements de frais de scolarité."
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
            <Field label="Banque">
              <TextInput
                value={form.banque_nom || ''}
                onChange={set('banque_nom')}
                placeholder="Ex: SGBCI, NSIA Banque"
              />
            </Field>
            <Field label="Titulaire du compte">
              <TextInput
                value={form.banque_titulaire || ''}
                onChange={set('banque_titulaire')}
                placeholder="Ex: Collège Moderne Bouaké Dar Es Salam"
              />
            </Field>
            <Field label="RIB">
              <TextInput
                value={form.banque_rib || ''}
                onChange={set('banque_rib')}
                placeholder="24 chiffres"
              />
            </Field>
            <Field label="IBAN">
              <TextInput
                value={form.banque_iban || ''}
                onChange={set('banque_iban')}
                placeholder="Optionnel — virements internationaux"
              />
            </Field>
          </div>
        </Card>
      )}
    </Layout>
  )
}
