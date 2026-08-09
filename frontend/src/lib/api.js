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
  importEleves: (file) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestMultipart('/eleves/import', formData)
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
    request('/types-frais/tranches', { method: 'PUT', body: JSON.stringify({ tranches }) })
}
