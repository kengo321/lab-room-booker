// app/login/page.js  ← 'use client' は付けない（サーバー側）
// これで毎回サーバーでクッキーを読んでセッション確認→あれば即 /book
export const dynamic = 'force-dynamic'  // キャッシュ無効化（念のため）
export const revalidate = 0

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import LoginClient from './LoginClient'

export default async function Page() {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    redirect('/book')
  }

  return <LoginClient />
}