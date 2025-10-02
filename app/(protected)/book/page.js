// /app/book/page.js
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

/* ---------- 日付ユーティリティ ---------- */
function startOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x
}
function endOfMonth(d) {
  const x = new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x
}
function addMonths(d, n) {
  const x = new Date(d); x.setMonth(x.getMonth()+n); return x
}
function formatYMD(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  return `${y}-${m}-${dd}`
}
function getMonthMatrix(viewDate) {
  const first = startOfMonth(viewDate)
  const firstWeekday = first.getDay()
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - firstWeekday)
  const cells = []
  for (let i=0; i<42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate()+i); cells.push(d) }
  return cells
}

/* ---------- 時刻ユーティリティ ---------- */
function timeStrToMinutes(t /* "HH:MM" */) {
  const [hh, mm] = t.split(':').map(n => parseInt(n, 10))
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null
  return hh * 60 + mm
}
function minutesToTimeStr(min) {
  const hh = String(Math.floor(min / 60)).padStart(2, '0')
  const mm = String(min % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

/* ---------- コンポーネント ---------- */
export default function BookPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [userId, setUserId] = useState(null)            // 書き込み用
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()))
  const [bookings, setBookings] = useState({})          // { 'YYYY-MM-DD': [ {id,user_id,start_minute,end_minute} , ... ] }
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)

  const [selectedDay, setSelectedDay] = useState(null)  // 'YYYY-MM-DD' or null
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')

  // ログインユーザー取得（layout が未ログインを弾く想定）
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!mounted) return
      if (error) console.error('getUser error:', error)
      setUserId(data?.user?.id ?? null)
    })()
    return () => { mounted = false }
  }, [supabase])

  // 指定月の予約一覧（その月に含まれる day のもの）を取得
  async function fetchMonth() {
    setLoading(true)
    setMessage(null)
    const fromStr = formatYMD(startOfMonth(viewDate))
    const toStr   = formatYMD(endOfMonth(viewDate))

    const { data, error } = await supabase
      .from('bookings')
      .select('id, day, user_id, start_minute, end_minute')
      .gte('day', fromStr)
      .lte('day', toStr)
      .order('day', { ascending: true })
      .order('start_minute', { ascending: true })

    if (error) {
      setMessage('予約の取得に失敗しました: ' + error.message)
      setBookings({})
      setLoading(false)
      return
    }

    const map = {}
    for (const row of data) {
      if (!map[row.day]) map[row.day] = []
      map[row.day].push(row)
    }
    setBookings(map)
    setLoading(false)
  }

  useEffect(() => {
    fetchMonth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate?.getFullYear(), viewDate?.getMonth()])

  const cells = useMemo(() => getMonthMatrix(viewDate), [viewDate])
  const todayStr = formatYMD(new Date())
  const isSameMonth = (a,b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

  const dayReservations = selectedDay ? (bookings[selectedDay] || []) : []

  // 予約作成
  async function reserve(dayStr) {
    if (!userId) return
    const s = timeStrToMinutes(startTime)
    const e = timeStrToMinutes(endTime)
    if (s == null || e == null) { setMessage('時刻の形式が不正です。'); return }
    if (s < 0 || e > 1440 || s >= e) { setMessage('開始は終了より前、かつ 00:00〜24:00 の範囲で指定してください。'); return }

    // 当日より前の予約禁止（必要なければ外してOK）
    if (dayStr < todayStr) { setMessage('過去日は予約できません。'); return }

    setSubmitting(true)
    setMessage(null)

    // 楽観的UI：一時追加
    const tempId = 'temp-' + Math.random().toString(36).slice(2)
    setBookings(prev => {
      const copy = { ...prev }
      const arr = copy[dayStr] ? [...copy[dayStr]] : []
      arr.push({ id: tempId, day: dayStr, user_id: userId, start_minute: s, end_minute: e })
      arr.sort((a,b) => a.start_minute - b.start_minute)
      copy[dayStr] = arr
      return copy
    })

    const { error } = await supabase.from('bookings').insert({
      day: dayStr,
      user_id: userId,
      start_minute: s,
      end_minute: e,
      note: null
    })

    if (error) {
      // 失敗：一時追加を取り消し
      setBookings(prev => {
        const copy = { ...prev }
        copy[dayStr] = (copy[dayStr] || []).filter(r => r.id !== tempId)
        return copy
      })
      if (error.code === '23P01') {
        setMessage('時間帯が他の予約と重なっています。')
      } else {
        setMessage('予約に失敗しました: ' + error.message)
      }
    } else {
      await fetchMonth()
      setMessage('予約しました。')
    }
    setSubmitting(false)
  }

  // 予約キャンセル（自分の予約のみ）
  async function cancel(dayStr, row) {
    if (!userId) return
    if (row.user_id !== userId) { setMessage('自分の予約のみキャンセルできます。'); return }

    setSubmitting(true)
    setMessage(null)

    // 楽観的UI：先に消す
    const backup = row
    setBookings(prev => {
      const copy = { ...prev }
      copy[dayStr] = (copy[dayStr] || []).filter(r => r.id !== row.id)
      return copy
    })

    const { error } = await supabase.from('bookings').delete().eq('id', row.id)
    if (error) {
      // 失敗：戻す
      setBookings(prev => {
        const copy = { ...prev }
        const arr = copy[dayStr] ? [...copy[dayStr]] : []
        arr.push(backup)
        arr.sort((a,b) => a.start_minute - b.start_minute)
        copy[dayStr] = arr
        return copy
      })
      setMessage('キャンセルに失敗しました: ' + error.message)
    } else {
      setMessage('キャンセルしました。')
    }
    setSubmitting(false)
  }

  // 右ペイン：選択日のパネル
  function DayPanel() {
    if (!selectedDay) return null
    const isPast = selectedDay < todayStr

    return (
      <aside className="md:w-80 w-full border rounded p-3 h-max sticky top-4">
        <div className="font-medium mb-2">{selectedDay} の予約</div>

        <div className="space-y-2 mb-3 max-h-64 overflow-auto">
          {dayReservations.length === 0 ? (
            <div className="text-sm text-slate-500">予約はありません</div>
          ) : dayReservations.map(r => {
            const mine = userId && r.user_id === userId
            return (
              <div key={r.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                <div>
                  <div className="font-mono">{minutesToTimeStr(r.start_minute)}–{minutesToTimeStr(r.end_minute)}</div>
                  <div className={`text-xs ${mine ? 'text-blue-700' : 'text-slate-500'}`}>
                    {mine ? 'あなたの予約' : '予約あり'}
                  </div>
                </div>
                <div>
                  {mine ? (
                    <button
                      className="text-xs px-2 py-1 border rounded"
                      disabled={submitting}
                      onClick={() => cancel(selectedDay, r)}
                    >
                      キャンセル
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="border-t pt-3">
          <div className="text-sm font-medium mb-2">新規予約</div>
          <div className="flex items-center gap-2 mb-2">
            <label className="text-xs w-16">開始</label>
            <input
              type="time"
              className="border rounded px-2 py-1 text-sm w-full"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs w-16">終了</label>
            <input
              type="time"
              className="border rounded px-2 py-1 text-sm w-full"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
            />
          </div>
          <button
            className="w-full text-sm px-3 py-2 border rounded"
            disabled={submitting || isPast || !userId}
            onClick={() => reserve(selectedDay)}
            title={isPast ? '過去日は不可' : 'この時間で予約'}
          >
            予約する
          </button>
          <p className="text-xs text-slate-500 mt-2">
            ※ 同日の他予約と時間帯が重なる場合はDB側でブロックされます。
          </p>
        </div>
      </aside>
    )
  }

  return (
    <main className="max-w-5xl mx-auto p-4">
      <header className="flex items-center justify-between mb-4">
        <div className="text-xl font-semibold">部屋予約（自由な時間帯）</div>
      </header>

      {message && (
        <div className="mb-3 p-2 rounded bg-amber-100 border border-amber-200 text-amber-900 text-sm">
          {message}
        </div>
      )}

      <div className="md:flex md:items-start md:gap-4">
        {/* 左：月カレンダー */}
        <section className="md:flex-1">
          <div className="mb-3 flex items-center gap-2">
            <button className="px-3 py-1 rounded border" onClick={() => setViewDate(addMonths(viewDate, -1))} disabled={loading}>
              ← 前の月
            </button>
            <div className="font-medium">
              {viewDate.getFullYear()}年 {viewDate.getMonth()+1}月
            </div>
            <button className="px-3 py-1 rounded border" onClick={() => setViewDate(addMonths(viewDate, 1))} disabled={loading}>
              次の月 →
            </button>
            <button className="ml-auto px-3 py-1 rounded border" onClick={() => setViewDate(startOfMonth(new Date()))} disabled={loading}>
              今月へ
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-sm mb-1">
            {['日','月','火','水','木','金','土'].map(d => (
              <div key={d} className="py-2 font-medium">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, idx) => {
              const ymd = formatYMD(d)
              const isToday = ymd === todayStr
              const disabledPast = d < new Date(todayStr)
              const outside = !isSameMonth(d, viewDate)
              const list = bookings[ymd] || []
              const mineCount = userId ? list.filter(r => r.user_id === userId).length : 0

              return (
                <button
                  type="button"
                  key={idx}
                  onClick={() => setSelectedDay(ymd)}
                  className={
                    "p-2 min-h-[100px] border rounded text-left " +
                    (outside ? "opacity-40 " : "") +
                    (isToday ? "ring-2 ring-blue-400 " : "")
                  }
                  title="クリックして詳細を表示"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{d.getDate()}</span>
                    {isToday && <span className="text-[10px] px-1 py-0.5 rounded border">今日</span>}
                  </div>

                  <div className="space-y-1 text-xs">
                    {list.length === 0 ? (
                      <div className="text-slate-400">{disabledPast ? '過去' : '空き'}</div>
                    ) : (
                      list.slice(0, 3).map(r => (
                        <div key={r.id} className={"px-1 py-0.5 rounded border font-mono " + (userId && r.user_id === userId ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200")}>
                          {minutesToTimeStr(r.start_minute)}–{minutesToTimeStr(r.end_minute)}
                          {userId && r.user_id === userId ? '（自分）' : ''}
                        </div>
                      ))
                    )}
                    {list.length > 3 && (
                      <div className="text-slate-500">ほか {list.length - 3} 件</div>
                    )}
                    {mineCount > 0 && <div className="text-blue-700">あなたの予約 {mineCount} 件</div>}
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        {/* 右：選択日の詳細 */}
        <DayPanel />
      </div>

      <footer className="mt-6 text-xs text-slate-500 space-y-1">
        <p>※ 時間帯は <code>開始 ≤ 終了</code> ではなく <code>開始 &lt; 終了</code> です。日をまたぐ予約（23:00→01:00 等）は現仕様では不可。</p>
        <p>※ タイムゾーン差異を避けるため、日付は <code>date</code> 型、時間は分単位整数で保存しています。</p>
      </footer>
    </main>
  )
}
