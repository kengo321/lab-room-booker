import Image from "next/image";

//git更新時のコマンド
// git add .
// git commit -m "予約画面: PWA対応を追加"
// git push

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()
  redirect(session ? '/book' : '/login')
}
