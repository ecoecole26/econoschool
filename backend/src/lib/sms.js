import { supabase } from '../config/supabase.js'

// ============================================================
// SMS — deux fournisseurs possibles, avec bascule automatique.
//
// Adapté fidèlement du module équivalent du projet "Collège Moderne
// Bouaké Dar Es Salam" (backend/routes/sms.js), qui fonctionne déjà en
// production là-bas — donc mêmes appels HTTP, mêmes formats de payload,
// pas de logique "améliorée" ou supposée en plus.
//
// 1) TRACCAR (passerelle SMS via carte SIM personnelle, appli Android
//    "Traccar SMS Gateway" en mode Cloud Service) : utilisé en priorité
//    si TRACCAR_SMS_TOKEN est renseigné.
//
// 2) ORANGE_SMS_AUTH / ORANGE_SMS_EXPEDITEUR : utilisé en secours (ou
//    seul, si Traccar n'est pas configuré — c'est le cas actuel
//    d'EconoSchool, qui n'a que ORANGE_SMS_AUTH rempli). Point important
//    corrigé par rapport à ma première version : il n'y a PAS d'échange
//    OAuth séparé ici — ORANGE_SMS_AUTH est envoyé tel quel comme en-tête
//    Authorization directement sur la requête d'envoi du SMS. Tant que
//    l'expéditeur n'est pas validé par Orange et qu'aucune unité SMS
//    n'est achetée, l'envoi réel échouera même si le code est correct.
// ============================================================

const TRACCAR_SMS_TOKEN = process.env.TRACCAR_SMS_TOKEN
const TRACCAR_SMS_URL = 'https://www.traccar.org/sms/'

const ORANGE_SMS_AUTH = process.env.ORANGE_SMS_AUTH
const ORANGE_SMS_EXPEDITEUR = process.env.ORANGE_SMS_EXPEDITEUR

function formaterNumeroE164(numero) {
  const brut = String(numero).replace(/\s/g, '')
  return brut.startsWith('+') ? brut : `+225${brut}`
}

async function envoyerSMSTraccar(numero, message) {
  const tel = formaterNumeroE164(numero)
  try {
    const reponse = await fetch(TRACCAR_SMS_URL, {
      method: 'POST',
      headers: { Authorization: TRACCAR_SMS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: tel, message })
    })
    if (reponse.ok) return { ok: true, fournisseur: 'traccar' }
    const detail = await reponse.text().catch(() => '')
    return { ok: false, motif: `Passerelle SIM (Traccar) a refusé l'envoi (HTTP ${reponse.status}) ${detail.slice(0, 300)}` }
  } catch (err) {
    return { ok: false, motif: `Passerelle SIM (Traccar) injoignable : ${err.message}` }
  }
}

async function envoyerSMSOrange(numero, message) {
  if (!ORANGE_SMS_AUTH || !ORANGE_SMS_EXPEDITEUR) {
    return { ok: false, motif: 'Configuration Orange SMS absente côté serveur (ORANGE_SMS_AUTH / ORANGE_SMS_EXPEDITEUR).' }
  }
  const tel = `tel:${formaterNumeroE164(numero)}`
  const body = {
    outboundSMSMessageRequest: {
      address: [tel],
      senderAddress: ORANGE_SMS_EXPEDITEUR,
      outboundSMSTextMessage: { message }
    }
  }
  try {
    const reponse = await fetch(
      'https://api.orange.com/smsmessaging/v1/outbound/' + encodeURIComponent(ORANGE_SMS_EXPEDITEUR) + '/requests',
      {
        method: 'POST',
        headers: { Authorization: ORANGE_SMS_AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    )
    if (reponse.ok) return { ok: true, fournisseur: 'orange' }
    const detail = await reponse.text().catch(() => '')
    return { ok: false, motif: `Orange a refusé l'envoi (HTTP ${reponse.status}) ${detail.slice(0, 300)}` }
  } catch (err) {
    return { ok: false, motif: err.message }
  }
}

// Point d'entrée unique. Priorité à Traccar (SIM) si configuré ; bascule
// sur Orange en secours (Traccar non configuré, ou envoi Traccar en échec).
async function envoyerSMS(numero, message) {
  if (TRACCAR_SMS_TOKEN) {
    const resultat = await envoyerSMSTraccar(numero, message)
    if (resultat.ok) return resultat
    if (ORANGE_SMS_AUTH && ORANGE_SMS_EXPEDITEUR) return envoyerSMSOrange(numero, message)
    return resultat
  }
  return envoyerSMSOrange(numero, message)
}

// Simple formatage E.164 ivoirien (identique à l'autre projet) : pas de
// validation stricte de longueur, juste l'ajout de +225 si absent.
export function normaliserTelephoneCI(brut) {
  if (!brut) return null
  return formaterNumeroE164(brut)
}

// Envoie un SMS unique. Ne lève jamais d'exception : retourne toujours
// { ok, error? } pour que l'appelant (ex: route paiements) puisse logger
// sans jamais faire échouer la requête principale.
export async function envoyerSms(telephoneBrut, message) {
  if (!telephoneBrut) {
    return { ok: false, error: 'Numéro manquant' }
  }
  const resultat = await envoyerSMS(telephoneBrut, message)
  return resultat.ok
    ? { ok: true, telephone: formaterNumeroE164(telephoneBrut), fournisseur: resultat.fournisseur }
    : { ok: false, error: resultat.motif }
}

// Envoie le SMS ET journalise le résultat dans `sms_log` (best-effort : un
// souci de log n'empêche jamais de savoir si le SMS lui-même est parti).
export async function envoyerSmsEtJournaliser({ eleve_id, matricule, telephoneBrut, message, contexte }) {
  const resultat = await envoyerSms(telephoneBrut, message)

  try {
    await supabase.from('sms_log').insert({
      eleve_id: eleve_id || null,
      matricule: matricule || null,
      telephone: resultat.telephone || telephoneBrut || null,
      message,
      statut: resultat.ok ? 'envoye' : 'echec',
      erreur: resultat.ok ? null : resultat.error,
      contexte: contexte || null
    })
  } catch (errLog) {
    console.error('[sms] échec écriture sms_log:', errLog.message)
  }

  if (!resultat.ok) {
    console.error(`[sms] échec envoi (${contexte || 'sans contexte'}) :`, resultat.error)
  }

  return resultat
}
