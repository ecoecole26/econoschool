import { supabase } from '../config/supabase.js'

// Deux caisses fixes dans l'app :
// - caisse_1 : réservée au Fondateur (accès total, lui seul)
// - caisse_2 : utilisée au quotidien par l'Économe et le Proviseur.
//   Toutes les opérations y sont libres, SAUF le type "reduction" qui reste
//   en attente de validation du Fondateur quand elle est saisie par
//   l'Économe ou le Proviseur.
export const TYPES_CAISSE = ['caisse_1', 'caisse_2']

// Rôles pouvant voir/opérer chaque caisse.
const ACCES_CAISSE = {
  caisse_1: ['fondateur'],
  caisse_2: ['fondateur', 'proviseur', 'econome']
}

export function caissesVisiblesPourRole(role) {
  return TYPES_CAISSE.filter((type) => ACCES_CAISSE[type].includes(role))
}

export function roleAAccesCaisse(role, type_caisse) {
  return (ACCES_CAISSE[type_caisse] || []).includes(role)
}

// Une "reduction" saisie par quelqu'un d'autre que le Fondateur doit être
// validée avant d'impacter le solde.
export function operationRequiertValidation(type_operation, role) {
  return type_operation === 'reduction' && role !== 'fondateur'
}

// Les sorties/retraits/dépenses sont réservés au Fondateur — l'Économe et le
// Proviseur ne peuvent ni les exécuter, ni les proposer.
export function roleAAccesOperation(role, type_operation) {
  if (type_operation === 'sortie') return role === 'fondateur'
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
      statut: 'active',
      solde: 0
    })
    .select()
    .single()

  if (errCreation) throw new Error(errCreation.message)
  return creee
}

// Applique un mouvement déjà validé au solde de la caisse : entree/paiement_auto
// créditent, sortie/reduction débitent.
function impactSolde(type_operation, montant) {
  return ['sortie', 'reduction'].includes(type_operation) ? -montant : montant
}

// Insère un mouvement dans le journal et, s'il est validé immédiatement,
// met à jour le solde de la caisse. Retourne { mouvement, caisse }.
export async function enregistrerMouvementCaisse({
  type_caisse,
  type_operation,
  montant,
  libelle,
  date,
  etablissement,
  annee_scolaire,
  role,
  nom
}) {
  const caisse = await getOrCreateCaisse(type_caisse, etablissement)
  const montantNum = Number(montant)
  const enAttente = operationRequiertValidation(type_operation, role)

  if (!enAttente && type_operation === 'sortie' && montantNum > caisse.solde) {
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
      date: date || new Date().toISOString().slice(0, 10),
      annee_scolaire: annee_scolaire || null,
      statut: enAttente ? 'en_attente' : 'validee',
      demande_par: nom || role,
      valide_par: enAttente ? null : nom || role
    })
    .select()
    .single()

  if (errJournal) throw new Error(errJournal.message)

  if (enAttente) {
    return { mouvement, caisse }
  }

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

// Crédite automatiquement la Caisse 2 lors d'un paiement élève.
// Ne lève pas d'exception qui bloquerait le paiement déjà enregistré ;
// l'appelant décide quoi faire en cas d'échec (log, avertissement...).
export async function crediterCaisse2ParPaiement({ montant, libelle, etablissement, annee_scolaire }) {
  return enregistrerMouvementCaisse({
    type_caisse: 'caisse_2',
    type_operation: 'paiement_auto',
    montant,
    libelle,
    etablissement,
    annee_scolaire,
    role: 'fondateur', // opération système, jamais en attente
    nom: 'Système (paiement)'
  })
}
