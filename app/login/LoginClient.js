'use client'

import { useState } from 'react'
import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()
  const [stage, setStage] = useState('enter-email') // 'enter-email' | 'enter-code'
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgColor, setMsgColor] = useState('') // 'red'|'green'|''

  // Resend用クールダウン（任意）
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setInterval(() => setCooldown((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [cooldown])

  function setFeedback(text, color = 'red') {
    setMsg(text)
    setMsgColor(color)
  }

  async function sendCode(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setFeedback('')
    const cleaned = (email ?? '').trim().toLowerCase()
    if (!cleaned) {
      setFeedback('メールアドレスを入力してください。'); setLoading(false); return
    }

    // 1) メールにOTPコードを送信（サインアップON + Hookでホワイトリスト外を弾く）
    const { error } = await supabase.auth.signInWithOtp({
      email: cleaned,
      // shouldCreateUser: true（既定）→ 未登録なら作成。HookがBefore User Createdでチェック
    })

    setLoading(false)
    if (error) {
      const m = (error.message || '').toLowerCase()
      if (m.includes('signup not allowed') || m.includes('invalid invite')) {
        setFeedback('このメールアドレスは招待されていません。')
      } else if (m.includes('rate') && m.includes('limit')) {
        setFeedback('送信が多すぎます。しばらくしてからお試しください。')
      } else if (m.includes('invalid') && m.includes('email')) {
        setFeedback('メールアドレスの形式が正しくありません。')
      } else {
        setFeedback('送信に失敗しました: ' + error.message)
      }
      return
    }

    // 成功：コード入力ステージへ
    setStage('enter-code')
    setCooldown(60) // 60秒の再送クールダウン
    setFeedback('メールに届いた6桁コードを入力してください。', 'green')
  }

  async function verifyCode(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setFeedback('')
    const cleanedEmail = (email ?? '').trim().toLowerCase()
    const cleanedCode = (code ?? '').trim()

    // 2) コード検証（PWAでも外部ブラウザに飛ばない）
    const { error } = await supabase.auth.verifyOtp({
      email: cleanedEmail,
      token: cleanedCode,
      type: 'email', // ← メールOTP
    })

    setLoading(false)
    if (error) {
      const m = (error.message || '').toLowerCase()
      if (m.includes('invalid') || m.includes('expired')) {
        setFeedback('コードが無効または期限切れです。もう一度お試しください。')
      } else {
        setFeedback('認証に失敗しました: ' + error.message)
      }
      return
    }

    setFeedback('ログインしました。ページに移動します…', 'green')
    // 認証完了 → /book へ
    window.location.assign('/book')
  }

  async function resendCode() {
    if (cooldown > 0 || loading) return
    setMsg(''); setMsgColor('')
    // 送信関数を再利用
    const fakeEvent = { preventDefault(){} }
    await sendCode(fakeEvent)
  }

  return (
    <div
      style={{
        maxWidth: 420,
        margin: '48px auto',
        paddingLeft: 16,   // ← 左余白
        paddingRight: 16,  // ← 右余白
        boxSizing: 'border-box',

        minHeight: '100vh',
        //display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>伊藤研究室メンバー用ログイン</h1>

      {stage === 'enter-email' && (
        <form onSubmit={sendCode}>
          <input
            type="email"
            placeholder="you@ms.saitama-u.ac.jp"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ width: '100%', padding: 10, marginBottom: 8, border: '1px solid #ccc' }}
          />

          {/* メッセージ（入力欄とボタンの間／小さめ＆色付き） */}
          {msg && (
            <div style={{ marginTop: 8, marginBottom: 12, color: msgColor || '#333', fontSize: 12 }}>
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 10, border: '1px solid #333' }}
          >
            {loading ? '送信中…' : 'コードを送る'}
          </button>
          <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
            ※ 招待されていないメールは送信できません。
          </p>
        </form>
      )}

      {stage === 'enter-code' && (
        <form onSubmit={verifyCode}>
          <div style={{ marginBottom: 8, fontSize: 13 }}>
            {email}
            <button
              type="button"
              onClick={() => {
                setStage('enter-email')
                setMsg('')
                setMsgColor('')
              }}
              style={{ marginLeft: 8, fontSize: 12, border: 'none', background: 'transparent', textDecoration: 'underline', cursor: 'pointer' }}
            >
              メールを変更
            </button>
          </div>

          <input
            type="text"
            inputMode="numeric"
            pattern="\d{6}"
            placeholder="6桁コード"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            style={{ width: '100%', padding: 10, marginBottom: 8, border: '1px solid #ccc', letterSpacing: 2 }}
          />

          {msg && (
            <div style={{ marginTop: 8, marginBottom: 12, color: msgColor || '#333', fontSize: 12 }}>
              {msg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 10, border: '1px solid #333' }}
          >
            {loading ? '確認中…' : 'ログイン'}
          </button>

          <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={resendCode}
              disabled={loading || cooldown > 0}
              style={{ padding: '6px 10px', border: '1px solid #333', opacity: (loading || cooldown>0) ? 0.6 : 1 }}
            >
              {cooldown > 0 ? `再送 (${cooldown}s)` : 'コードを再送'}
            </button>
            <span style={{ fontSize: 12, color: '#666' }}>
              メールが届かない場合は迷惑メールをご確認ください
            </span>
          </div>
        </form>
      )}
    </div>
  )
}


  // async function onSubmit(e) {
  //   e.preventDefault()
  //   setLoading(true)
  //   setErrorMsg('') // 前のエラーを消す

  //   // ログイン後に戻したいURL（/book へ）
  //   const redirectTo = `${window.location.origin}/book`

  //   // 招待済みユーザーならメールが届く（未招待は届かないがUIは同じ文言にする）
  //   const { error } = await supabase.auth.signInWithOtp({
  //     email,
  //     options: { emailRedirectTo: redirectTo },
  //   })

  //   setLoading(false)

  //   if (error) {
  //     // ホワイトリスト外などで Hook が弾いた場合
  //     if (error.message === 'signup not allowed') {
  //       setErrorMsg('このメールアドレスではログインできません。')
  //     } else {
  //       setErrorMsg('ログインに失敗しました: ' + error.message)
  //     }
  //     setSent(false) // フォームは表示したまま
  //   } else {
  //     setSent(true) // 成功時のみ「メールを送信しました」画面へ
  //   }


//   return (
//     <div style={{ maxWidth: 420, margin: '48px auto' }}>
//       <h1 style={{ fontSize: 22, marginBottom: 12 }}>伊藤研究室メンバー用ログイン</h1>

//       {sent ? (
//         <p>
//           入力いただいたメール宛にログイン用リンクを送信しました。数分経っても届かない場合は
//           迷惑メールをご確認のうえ、管理者に連絡してください。
//         </p>
//       ) : (
//         <form onSubmit={onSubmit}>
//           <input
//             type="email"
//             placeholder="you@ms.saitama-u.ac.jp"
//             value={email}
//             onChange={(e) => setEmail(e.target.value)}
//             required
//             autoComplete="email"
//             style={{ width: '100%', padding: 10, marginBottom: 1, border: '1px solid #ccc' }}
//           />

//           {/* エラーメッセージをここに表示 */}
//           {errorMsg && (
//             <div style={{ marginBottom: 0, color: 'red' ,fontSize: 12}}>
//               {errorMsg}
//             </div>
//           )}

//           <button
//             type="submit"
//             disabled={loading}
//             style={{ width: '100%', padding: 10, marginTop: 20 ,border: '1px solid #333' }}
//           >
//             {loading ? '送信中…' : '送信'}
//           </button>
//           <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
//             ※ 招待されていないメールはログインできません。
//           </p>
//         </form>
//       )}
//     </div>
//   )
// }