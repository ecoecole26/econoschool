import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import PageHeader from '../components/PageHeader.jsx'
import { Card, Field, TextInput } from '../components/ui.jsx'
import { api } from '../lib/api.js'
import { useAnnee } from '../context/AnneeContext.jsx'

export default function TarifsParNiveau() {
  const { anneeSelectionnee, estLectureSeule } = useAnnee()
  const [tarifs, setTarifs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    setLoading(true)
    api
      .getTarifs(anneeSelectionnee)
      .then(({ tarifs }) => setTarifs(tarifs || []))
      .catch((err) => setMessage(err.message))
      .finally(() => setLoading(false))
  }, [anneeSelectionnee])

  function setField(id, field) {
    return (e) => {
      const value = e.target.value
      setTarifs((list) => list.map((t) => (t.id === id ? { ...t, [field]: value } : t)))
    }
  }

  async function handleSave() {
    setSaving(true)
    setMessage('')
    try {
      const { tarifs: saved } = await api.saveTarifs(tarifs)
      setTarifs(saved)
      setMessage('Enregistré ✅')
    } catch (err) {
      setMessage(err.message || 'Erreur lors de la sauvegarde — as-tu exécuté la migration SQL ?')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Layout title="Tarifs par niveau">
      <PageHeader
        icon="💰"
        title="Tarifs par niveau"
        subtitle="Définir les frais par niveau (en FCFA). Le total est calculé automatiquement."
        onSave={estLectureSeule ? undefined : handleSave}
        saving={saving}
      />

      {estLectureSeule && (
        <div className="mb-5 text-xs font-medium text-orange bg-[#fff7ed] border border-orange/30 rounded-lg px-3 py-2">
          🔒 Année {anneeSelectionnee} : consultation uniquement, aucune modification possible.
        </div>
      )}

      {message && (
        <div className="mb-5 text-sm px-3 py-2 rounded-lg bg-teal-light text-teal inline-block">
          {message}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-[#6b7d74]">Chargement…</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {tarifs.map((t) => {
            const total =
              (Number(t.scolarite_annuelle) || 0) +
              (Number(t.frais_inscription) || 0) +
              (Number(t.frais_annexes) || 0) +
              (t.examen ? Number(t.frais_examen) || 0 : 0)

            return (
              <Card
                key={t.id}
                title={
                  <span className="flex items-center gap-2">
                    📘 {t.niveau}
                    {t.examen && (
                      <span className="text-[10px] font-semibold bg-[#fff1e0] text-orange px-2 py-0.5 rounded-full">
                        Examen
                      </span>
                    )}
                  </span>
                }
              >
                <Field label="Scolarité annuelle (FCFA)">
                  <TextInput
                    type="number"
                    value={t.scolarite_annuelle ?? 0}
                    disabled={estLectureSeule}
                    onChange={setField(t.id, 'scolarite_annuelle')}
                  />
                </Field>
                <Field label="Frais d'inscription (FCFA)">
                  <TextInput
                    type="number"
                    value={t.frais_inscription ?? 0}
                    disabled={estLectureSeule}
                    onChange={setField(t.id, 'frais_inscription')}
                  />
                </Field>
                <Field label="Frais annexes (FCFA)">
                  <TextInput
                    type="number"
                    value={t.frais_annexes ?? 0}
                    disabled={estLectureSeule}
                    onChange={setField(t.id, 'frais_annexes')}
                  />
                </Field>
                {t.examen && (
                  <Field label="Frais examen (FCFA)">
                    <TextInput
                      type="number"
                      value={t.frais_examen ?? 0}
                      disabled={estLectureSeule}
                      onChange={setField(t.id, 'frais_examen')}
                    />
                  </Field>
                )}

                <div className="mt-4 -mx-5 -mb-5 px-5 py-3.5 bg-teal-light/60 rounded-b-2xl flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#3d4f45] uppercase tracking-wide">
                    Total
                  </span>
                  <span className="text-lg font-display font-bold text-vert-fonce">
                    {total.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
              </Card>
            )
          })}

          {tarifs.length === 0 && (
            <div className="col-span-full text-sm text-[#6b7d74] bg-white rounded-2xl border border-[#e3ebe6] p-8 text-center">
              Aucun niveau disponible pour le moment. Recharge la page — les 7 niveaux standards se
              créent automatiquement dès qu'une année scolaire est active.
            </div>
          )}
        </div>
      )}
    </Layout>
  )
}
