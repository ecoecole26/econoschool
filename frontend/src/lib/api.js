const API_URL = import.meta.env.VITE_API_URL || '/api'

function authHeaders() {
  const token = localStorage.getItem('econoschool_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`)
  }

  return data
}

// Requête multipart (upload de fichier) : pas de Content-Type manuel, le
// navigateur doit fixer lui-même le boundary du form-data.
async function requestMultipart(path, formData) {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData
  })

  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw new Error(data.error || `Erreur ${res.status}`)
  }

  return data
}

export const api = {
  login: (role, password) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, password })
    }),

  getEleves: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/eleves${qs ? `?${qs}` : ''}`)
  },
  updateEleve: (id, payload) =>
    request(`/eleves/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteEleve: (id) => request(`/eleves/${id}`, { method: 'DELETE' }),
  importEleves: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestMultipart('/eleves/import', formData)
  },
  importPhotosEleves: (fichiers) => {
    const formData = new FormData()
    fichiers.forEach((f) => formData.append('photos', f))
    return requestMultipart('/eleves/import-photos', formData)
  },
  telechargerModeleEleves: async () => {
    const res = await fetch(`${API_URL}/eleves/modele`, { headers: { ...authHeaders() } })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Erreur ${res.status}`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modele_import_eleves.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  getEtablissement: () => request('/etablissement'),
  saveEtablissement: (payload) =>
    request('/etablissement', { method: 'PUT', body: JSON.stringify(payload) }),

  getComptes: () => request('/utilisateurs'),
  getBootstrapStatus: () => request('/utilisateurs/bootstrap-status'),
  saveCompte: (role, payload) =>
    request(`/utilisateurs/${role}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getTarifs: () => request('/tarifs'),
  saveTarifs: (tarifs) => request('/tarifs', { method: 'PUT', body: JSON.stringify({ tarifs }) }),

  getTypesFrais: () => request('/types-frais'),
  addTranche: (typeId) => request(`/types-frais/${typeId}/tranches`, { method: 'POST' }),
  deleteTranche: (id) => request(`/types-frais/tranches/${id}`, { method: 'DELETE' }),
  saveTranches: (tranches) =>
    request('/types-frais/tranches', { method: 'PUT', body: JSON.stringify({ tranches }) }),

  rechercherEleveMatricule: (matricule) =>
    request(`/paiements/recherche?matricule=${encodeURIComponent(matricule)}`),
  getTranchesPaiement: () => request('/paiements/tranches'),
  enregistrerPaiement: (payload) =>
    request('/paiements', { method: 'POST', body: JSON.stringify(payload) }),

  getBanqueCompte: () => request('/banque-compte'),
  configurerBanqueCompte: (payload) =>
    request('/banque-compte', { method: 'PUT', body: JSON.stringify(payload) }),
  ajouterMouvementBanque: (payload) =>
    request('/banque-compte/mouvements', { method: 'POST', body: JSON.stringify(payload) }),

  getCaisses: () => request('/caisses'),
  ajouterMouvementCaisse: (payload) =>
    request('/caisses/mouvements', { method: 'POST', body: JSON.stringify(payload) }),

  rechercherEleveReduction: (matricule) =>
    request(`/reductions/recherche?matricule=${encodeURIComponent(matricule)}`),
  accorderReduction: (payload) =>
    request('/reductions', { method: 'POST', body: JSON.stringify(payload) }),
  annulerReduction: (id) => request(`/reductions/${id}/annuler`, { method: 'POST' })
}
