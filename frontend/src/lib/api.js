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
  login: (role, password, code_etablissement) =>
    request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, password, code_etablissement })
    }),

  getEleves: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/eleves${qs ? `?${qs}` : ''}`)
  },
  getKitsEleves: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/eleves/kits${qs ? `?${qs}` : ''}`)
  },
  majKitsEleve: (id, payload) =>
    request(`/eleves/${id}/kits`, { method: 'PATCH', body: JSON.stringify(payload) }),
  getBilanEleves: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/eleves/bilan${qs ? `?${qs}` : ''}`)
  },
  exporterBilanEleves: async (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    const res = await fetch(`${API_URL}/eleves/bilan/export${qs ? `?${qs}` : ''}`, {
      headers: { ...authHeaders() }
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Erreur ${res.status}`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'retards_paiements.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },
  exporterRapport: async (annee) => {
    const qs = annee ? `?annee=${encodeURIComponent(annee)}` : ''
    const res = await fetch(`${API_URL}/rapports/export${qs}`, {
      headers: { ...authHeaders() }
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Erreur ${res.status}`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'rapport_general.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
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
  getAnnees: () => request('/etablissement/annees'),
  creerAnneeScolaire: (annee) => request('/etablissement/annees', { method: 'POST', body: JSON.stringify({ annee }) }),
  creerNouvelleAnnee: (annee) =>
    request('/etablissement/annees', { method: 'POST', body: JSON.stringify({ annee }) }),

  getComptes: () => request('/utilisateurs'),
  getBootstrapStatus: (code_etablissement) =>
    request(`/utilisateurs/bootstrap-status?code_etablissement=${encodeURIComponent(code_etablissement || '')}`),
  saveCompte: (role, payload) =>
    request(`/utilisateurs/${role}`, { method: 'PUT', body: JSON.stringify(payload) }),

  getTarifs: (annee) => request(`/tarifs${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`),
  saveTarifs: (tarifs) => request('/tarifs', { method: 'PUT', body: JSON.stringify({ tarifs }) }),

  getTypesFrais: (annee) => request(`/types-frais${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`),
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
  getSoldesAnterieurs: () => request('/caisses/soldes-anterieurs'),
  ajouterMouvementCaisse: (payload) =>
    request('/caisses/mouvements', { method: 'POST', body: JSON.stringify(payload) }),
  changerStatutCaisse: (type_caisse, statut) =>
    request(`/caisses/${encodeURIComponent(type_caisse)}/statut`, {
      method: 'POST',
      body: JSON.stringify({ statut })
    }),

  getMouvements: (type_operation, params = {}) => {
    const qs = new URLSearchParams({ type_operation, ...params }).toString()
    return request(`/mouvements?${qs}`)
  },

  getNotifications: () => request('/notifications'),
  marquerNotificationLue: (id) => request(`/notifications/${id}/lu`, { method: 'POST' }),
  marquerToutesNotificationsLues: () => request('/notifications/tout-lire', { method: 'POST' }),

  getDatesButoir: (annee) => request(`/dates-butoir${annee ? `?annee=${encodeURIComponent(annee)}` : ''}`),
  saveDateButoirGlobale: (date_butoir) =>
    request('/dates-butoir/globale', { method: 'PUT', body: JSON.stringify({ date_butoir }) }),
  saveDateButoirNiveau: (niveau, date_butoir) =>
    request(`/dates-butoir/niveau/${encodeURIComponent(niveau)}`, {
      method: 'PUT',
      body: JSON.stringify({ date_butoir })
    }),

  getBilanPeriodique: (debut, fin) =>
    request(`/bilan-periodique?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`),

  exporterBilanPeriodique: async (debut, fin) => {
    const res = await fetch(
      `${API_URL}/bilan-periodique/export?debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`,
      { headers: { ...authHeaders() } }
    )
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Erreur ${res.status}`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bilan_periodique_${debut}_au_${fin}.xlsx`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  },

  getConsultationInscrits: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/consultation-inscrits${qs ? `?${qs}` : ''}`)
  },
  getConsultationInscritsStatistiques: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/consultation-inscrits/statistiques${qs ? `?${qs}` : ''}`)
  },
  getConsultationInscritsTracabilite: (params = {}) => {
    const qs = new URLSearchParams(params).toString()
    return request(`/consultation-inscrits/tracabilite${qs ? `?${qs}` : ''}`)
  },

  rechercherEleveReduction: (matricule) =>
    request(`/reductions/recherche?matricule=${encodeURIComponent(matricule)}`),
  accorderReduction: (payload) =>
    request('/reductions', { method: 'POST', body: JSON.stringify(payload) }),
  annulerReduction: (id) => request(`/reductions/${id}/annuler`, { method: 'POST' })
}
