import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '[supabase] SUPABASE_URL ou SUPABASE_SERVICE_KEY manquant dans les variables d\'environnement.'
  )
}

// Le backend utilise la clé "service role" (jamais exposée au frontend) pour
// pouvoir lire/écrire dans Supabase avec les vraies règles métier appliquées ici.
export const supabase = createClient(supabaseUrl, supabaseServiceKey)
