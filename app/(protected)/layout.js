// app/(protected)/layout.js  ← サーバーコンポーネント
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// 認証は毎リクエスト評価したいのでキャッシュ無効化（重要）
export const dynamic = 'force-dynamic'

export default async function ProtectedLayout({ children }) {
  const supabase = await createSupabaseServerClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) redirect('/login')  // HTML生成前に弾く（ノーフラッシュ）

  return <>{children}</>
}