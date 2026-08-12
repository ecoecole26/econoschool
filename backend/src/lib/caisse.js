import { supabase } from '../config/supabase.js'

// Deux caisses fixes dans l'app :
// - principale : réservée au Fondateur (accès total, lui seul)
// - secondaire : utilisée au quotidien par l'Économe et le Proviseur.
//
// NB : les valeurs 'principale'/'secondaire' (colonne type_caisse) et
// 'Encaissement'/'Sortie' (colonne type_operation de journal_caisse) sont
// imposées par des contraintes SQL héritées de l'ancien projet EconoSchool
// Pro — impossible d'utiliser d'autres libellés sans modifier la contrainte
// en base. Les réductions sont gérées à part (page Réductions, table
// `reductions`), plus comme un mouvement de caisse.
export const TYPES_CAISSE = ['principale', 'secondaire']

export const TYPE_ENCAISSEMENT = 'Encaissement'
export const TYPE_SORTIE = 'Sortie'

// Rôles pouvant voir/opérer chaque caisse.
const ACCES_CAISSE = {
  principale: ['fondateur'],
  secondaire: ['fondateur', 'proviseur', 'econome']
}

export function caissesVisiblesPourRole(role) {
  return TYPES_CAISSE.filter((type) => ACCES_CAISSE[type].includes(role))
}

export function roleAAccesCaisse(role, type_caisse) {
  return (ACCES_CAISSE[type_caisse] || []).includes(role)
}

export const LABEL_CAISSE = { principale: 'Caisse 1', secondaire: 'Caisse 2' }

// Les sorties/retraits/dépenses sont réservés au Fondateur — l'Économe et le
// Proviseur ne peuvent pas les exécuter.
export function roleAAccesOperation(role, type_operation) {
  if (type_operation === TYPE_SORTIE) return role === 'fondateur'
  return true
}

// Renvoie la caisse (ligne de la table `caisses`), en la créant avec un
// solde de 0 si elle n'existe pas encore pour cet établissement.
export async function getOrCreateCaisse(type_caisse, etablissement) {
  const { data: existante, error: errLecture } = await supabase
    .from('caisses')
    .select('*')
    .eq('type_caisse', type_caisse)
    .maybeSingle()

  if (errLecture) throw new Error(errLecture.message)
  if (existante) return existante

  const { data: creee, error: errCreation } = await supabase
    .from('caisses')
    .insert({
      type_caisse,
      etablissement: etablissement || null,
      statut: 'ouverte',
      solde: 0
    })
    .select()
    .single()

  if (errCreation) throw new Error(errCreation.message)
  return creee
}

function impactSolde(type_operation, montant) {
  return type_operation === TYPE_SORTIE ? -montant : montant
}

// Insère un mouvement dans le journal et met à jour le solde de la caisse
// (toujours immédiat : plus de workflow d'attente au niveau de la caisse,
// les réductions étant désormais gérées à part). Retourne { mouvement, caisse }.
export async function enregistrerMouvementCaisse({
  type_caisse,
  type_operation,
  montant,
  libelle,
  date,
  etablissement,
  annee_scolaire,
  nom,
  ignorerStatut = false
}) {
  const caisse = await getOrCreateCaisse(type_caisse, etablissement)
  const montantNum = Number(montant)

  // Vérification centralisée : quel que soit le point d'entrée (bouton
  // manuel +Entrée/-Sortie, ou crédit automatique déclenché par un
  // paiement), une caisse fermée ou en pause ne doit jamais bouger.
  if (!ignorerStatut && caisse.statut !== 'ouverte') {
    const libelleStatut = caisse.statut === 'pause' ? 'en pause' : 'fermée'
    throw new Error(`${LABEL_CAISSE[type_caisse]} ${libelleStatut} : impossible d'enregistrer un mouvement`)
  }

  if (type_operation === TYPE_SORTIE && montantNum > caisse.solde) {
    throw new Error('Solde insuffisant dans cette caisse pour cette sortie')
  }

  const { data: mouvement, error: errJournal } = await supabase
    .from('journal_caisse')
    .insert({
      etablissement: etablissement || null,
      caisse: type_caisse,
      type_operation,
      montant: montantNum,
      libelle: libelle || null,
      // Horodatage complet (date + heure), pas seulement la date : la
      // Côte d'Ivoire étant en GMT/UTC+0 toute l'année (pas d'heure d'été),
      // l'heure UTC correspond directement à l'heure locale, sans décalage
      // à appliquer.
      date: date || new Date().toISOString(),
      annee_scolaire: annee_scolaire || null,
      statut: 'validee',
      demande_par: nom || null,
      valide_par: nom || null
    })
    .select()
    .single()

  if (errJournal) throw new Error(errJournal.message)

  const nouveauSolde = caisse.solde + impactSolde(type_operation, montantNum)

  const { data: caisseMaj, error: errMaj } = await supabase
    .from('caisses')
    .update({ solde: nouveauSolde, updated_at: new Date().toISOString() })
    .eq('id', caisse.id)
    .select()
    .single()

  if (errMaj) throw new Error(errMaj.message)

  return { mouvement, caisse: caisseMaj }
}

// Change le statut d'une caisse (ouverte / fermee / pause) et trace qui a
// fait l'action et quand. Retourne la caisse mise à jour.
export async function changerStatutCaisse({ type_caisse, statut, etablissement, nom }) {
  const caisse = await getOrCreateCaisse(type_caisse, etablissement)
  const maintenant = new Date().toISOString()

  const payload = { statut, updated_at: maintenant }
  if (statut === 'ouverte') {
    payload.ouverte_par = nom || null
    payload.ouverte_le = maintenant
  }
  if (statut === 'fermee') {
    payload.fermee_par = nom || null
    payload.fermee_le = maintenant
  }

  const { data, error } = await supabase
    .from('caisses')
    .update(payload)
    .eq('id', caisse.id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// Envoie une notification en base aux rôles indiqués (sauf à l'auteur de
// l'action lui-même). Utilisé pour prévenir le Proviseur et le Fondateur
// quand l'Économe ouvre une caisse.
export async function notifierRoles({ roles, etablissement, titre, message, sauf_role }) {
  const destinataires = roles.filter((r) => r !== sauf_role)
  if (destinataires.length === 0) return

  const lignes = destinataires.map((destinataire_role) => ({
    etablissement: etablissement || null,
    destinataire_role,
    titre,
    message
  }))

  const { error } = await supabase.from('notifications').insert(lignes)
  if (error) console.error('[notifications] erreur envoi:', error.message)
}

// Crédite automatiquement LES DEUX caisses (principale ET secondaire) lors
// d'un paiement élève, chacune du même montant. C'est le comportement
// attendu : Caisse 1 (réservée au Fondateur) et Caisse 2 (opérations
// courantes) reflètent toutes les deux l'intégralité des encaissements —
// seule la Sortie reste différenciée par rôle (cf. roleAAccesOperation).
//
// Les deux crédits sont indépendants : si l'un échoue, on tente quand même
// l'autre, pour éviter qu'une des deux caisses ne prenne du retard sur
// l'autre à cause d'une erreur isolée. Retourne { principale, secondaire },
// chaque entrée étant soit le résultat de enregistrerMouvementCaisse, soit
// une erreur si le crédit correspondant a échoué.
export async function crediterCaissesParPaiement({ montant, libelle, etablissement, annee_scolaire }) {
  const resultat = { principale: null, secondaire: null }

  try {
    resultat.principale = await enregistrerMouvementCaisse({
      type_caisse: 'principale',
      type_operation: TYPE_ENCAISSEMENT,
      montant,
      libelle,
      etablissement,
      annee_scolaire,
      nom: 'Système (paiement)'
    })
  } catch (errPrincipale) {
    resultat.principale = { error: errPrincipale.message }
  }

  try {
    resultat.secondaire = await enregistrerMouvementCaisse({
      type_caisse: 'secondaire',
      type_operation: TYPE_ENCAISSEMENT,
      montant,
      libelle,
      etablissement,
      annee_scolaire,
      nom: 'Système (paiement)'
    })
  } catch (errSecondaire) {
    resultat.secondaire = { error: errSecondaire.message }
  }

  return resultat
}
