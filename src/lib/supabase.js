import { createClient } from '@supabase/supabase-js'

const URL = 'https://gqjndbfyigitojpztrbz.supabase.co'
const KEY = 'sb_publishable_iGegk1_B2iPF3dDBW-Scig_c-Q18LyE'

export const supabase = createClient(URL, KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false
  }
})
