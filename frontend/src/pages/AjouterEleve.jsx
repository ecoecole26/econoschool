import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput, Select } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAnnee } from '../context/AnneeContext.jsx'

const VIDE = {
  matricule: '',
  nom: '',
  classe: '',
  niveau: '',
  affecte: true,
  redoublant: false,
  parent: '',
  tel_parent: ''
}

// Ajout manuel d'UN élève, sur l'année en cours — en complément de l'import
// Excel DSPS en masse (page "Importer élèves") : inscription tardive, oubli
// dans le fichier de la rentrée, etc. Si le matricule existe déjà (élève
// connu d'une année précédente), le backend rattache automatiquement la
// nouvelle inscription à son identité au lieu d'en recréer une.
export default function AjouterEleve() {
  const navigate = useNavigate()
  const { anneeSelectionnee, estLectureSeule } = useAnnee()
  const [form, setForm] = useState(VIDE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [succes, setSucces] = useState(null) // { nom, matricule } après ajout réussi

  function setField(field) {
    return (e) => {
      const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
      setForm((f) => ({ ...f, [field]: value }))
    }
  }

  function reinitialiser() {
    setForm(VIDE)
    setSucces(null)
    setError('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.matricule.trim() || !form.nom.trim() || !form.classe.trim()) {
      setError('Matricule, nom et classe sont requis')
      return
    }
    setSaving(true)
    setError('')
    setSucces(null)
    try {
      const { eleve } = await api.createEleve({
        matricule: form.matricule.trim(),
        nom: form.nom.trim(),
        classe: form.classe.trim(),
        niveau: form.niveau.trim(),
        affecte: form.affecte,
        redoublant: form.redoublant,
        parent: form.parent.trim() || undefined,
        tel_parent: form.tel_parent.trim() || undefined
      })
      setSucces({ nom: eleve.nom, matricule: eleve.matricule })
      setForm(VIDE)
    } catch (err) {
      setError(err.message || "Erreur lors de l'ajout de l'élève")
    } finally {
      setSaving(false)
    }
  }

  if (estLectureSeule) {
    return (
      <Layout title="Ajouter élève">
        <div className="bg-white rounded-2xl border border-[#e3ebe6] p-14 text-center max-w-lg mx-auto">
          <div className="text-4xl mb-3">🔒</div>
          <div className="text-base font-semibold text-vert-fonce mb-2">
            Année {anneeSelectionnee} — non disponible ici
          </div>
          <p className="text-sm text-[#6b7d74]">
            On ne peut inscrire un élève que sur l'année en cours. Reviens sur l'année active
            (sélecteur en haut) pour ajouter un élève.
          </p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title="Ajouter élève">
      <PageHeader
        icon="➕"
        title="Ajouter élève"
        subtitle="Inscription manuelle d'un élève sur l'année en cours — en complément de l'import Excel en masse."
      />

      {succes && (
        <div className="max-w-xl mx-auto mb-6 flex items-center justify-between gap-3 text-sm bg-teal-light text-teal border border-teal/30 rounded-xl px-4 py-3">
          <span>
            ✅ <strong>{succes.nom}</strong> ({succes.matricule}) ajouté(e) pour l'année{' '}
            {anneeSelectionnee}.
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/eleves')}
              className="px-3 py-1.5 rounded-lg bg-vert-fonce text-white text-xs font-semibold"
            >
              Voir la liste
            </button>
            <button onClick={reinitialiser} className="px-3 py-1.5 rounded-lg border border-teal/40 text-xs font-semibold">
              Ajouter un autre
            </button>
          </div>
        </div>
      )}

      <Card title="Fiche d'inscription" icon="🧑‍🎓" className="max-w-xl mx-auto">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Matricule *">
            <TextInput
              value={form.matricule}
              onChange={setField('matricule')}
              placeholder="Matricule DSPS de l'élève"
              required
            />
          </Field>

          <Field label="Nom et prénoms *">
            <TextInput value={form.nom} onChange={setField('nom')} required />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Classe *">
              <TextInput
                value={form.classe}
                onChange={setField('classe')}
                placeholder="ex : 6eme1"
                required
              />
            </Field>
            <Field label="Niveau">
              <TextInput
                value={form.niveau}
                onChange={setField('niveau')}
                placeholder="ex : 6eme (déduit de la classe si vide)"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Affectation">
              <Select value={form.affecte ? 'oui' : 'non'} onChange={(e) => setForm((f) => ({ ...f, affecte: e.target.value === 'oui' }))}>
                <option value="oui">Affecté</option>
                <option value="non">Non affecté</option>
              </Select>
            </Field>
            <Field label="Qualité">
              <Select
                value={form.redoublant ? 'oui' : 'non'}
                onChange={(e) => setForm((f) => ({ ...f, redoublant: e.target.value === 'oui' }))}
              >
                <option value="non">Non redoublant</option>
                <option value="oui">Redoublant</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom du parent (optionnel)">
              <TextInput value={form.parent} onChange={setField('parent')} />
            </Field>
            <Field label="Téléphone parent (optionnel)">
              <TextInput value={form.tel_parent} onChange={setField('tel_parent')} placeholder="ex : 0102030405" />
            </Field>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full px-4 py-2.5 rounded-xl bg-vert-fonce text-white text-sm font-semibold disabled:opacity-60"
          >
            {saving ? 'Ajout en cours…' : "Ajouter l'élève"}
          </button>
        </form>
      </Card>
    </Layout>
  )
}
