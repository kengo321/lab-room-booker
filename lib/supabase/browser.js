// lib/supabase/browser.js
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY // または NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
}