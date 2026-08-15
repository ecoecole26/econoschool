import { supabase } from '../config/supabase.js'

// Une seule caisse dans l'app, gérée à trois : l'Économe, le Fondateur et le
// Directeur des Études (Proviseur) peuvent tous consulter la caisse et y
// enregistrer une entrée. Seul le Fondateur peut ordonner une sortie
// (dépense/retrait) — c'est lui qui donne le "OK" pour toute sortie
// d'argent, conformément aux recommandations reçues par l'établissement.
//
// NB : la valeur 'principale' (colonne type_caisse) et 'Encaissement'/
// 'Sortie' (colonne type_operation de journal_caisse) sont imposées par des
// contraintes SQL héritées de l'ancien projet EconoSchool Pro — impossible
// d'utiliser d'autres libellés sans modifier la contrainte en base. On garde
// donc 'principale' comme identifiant technique unique, même si l'app
// n'affiche plus qu'"une seule caisse" à l'écran. Les réductions sont
// gérées à part (page Réductions, table `reductions`), plus comme un
// mouvement de caisse.
export const TYPES_CAISSE = ['principale']

export const TYPE_ENCAISSEMENT = 'Encaissement'
export const TYPE_SORTIE = 'Sortie'

// Les trois rôles gèrent tous la caisse (consultation + entrées).
const ACCES_CAISSE = {
  principale: ['fondateur', 'proviseur', 'econome']
}

export function caissesVisiblesPourRole(role) {
  return TYPES_CAISSE.filter((type) => ACCES_CAISSE[type].includes(role))
}

export function roleAAccesCaisse(role, type_caisse) {
  return (ACCES_CAISSE[type_caisse] || []).includes(role)
}

export const LABEL_CAISSE = { principale: 'Caisse' }

// Les sorties/retraits/dépenses sont réservés au Fondateur — l'Économe et le
// Directeur des Études (Proviseur) ne peuvent pas les exécuter : ils doivent
// avoir son OK, matérialisé ici par le fait que seul son rôle peut valider
// l'opération.
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

// Crédite la caisse lors d'un paiement élève. Retourne le résultat de
// enregistrerMouvementCaisse (mouvement + caisse à jour).
export async function crediterCaisseParPaiement({ montant, libelle, etablissement, annee_scolaire }) {
  return enregistrerMouvementCaisse({
    type_caisse: 'principale',
    type_operation: TYPE_ENCAISSEMENT,
    montant,
    libelle,
    etablissement,
    annee_scolaire,
    nom: 'Système (paiement)'
  })
}
