// /app/book/page.js
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { motion, useMotionValue, useAnimation, useTransform, AnimatePresence } from 'framer-motion'

/* ---------- 日付ユーティリティ ---------- */
function startOfMonth(d) { const x = new Date(d.getFullYear(), d.getMonth(), 1); x.setHours(0,0,0,0); return x }
function endOfMonth(d)   { const x = new Date(d.getFullYear(), d.getMonth()+1, 0); x.setHours(23,59,59,999); return x }
function addMonths(d,n)  { const x = new Date(d); x.setMonth(x.getMonth()+n); return x }
function formatYMD(d)    { const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}` }
function getMonthMatrix(viewDate) {
  const first = startOfMonth(viewDate)
  const firstWeekday = first.getDay()
  const gridStart = new Date(first); gridStart.setDate(first.getDate() - firstWeekday)
  const cells = []
  for (let i=0; i<42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate()+i); cells.push(d) }
  return cells
}
/* ---------- 時刻ユーティリティ ---------- */
function timeStrToMinutes(t){ const [hh,mm]=t.split(':').map(n=>parseInt(n,10)); if(Number.isNaN(hh)||Number.isNaN(mm)) return null; return hh*60+mm }
function minutesToTimeStr(min){ const hh=String(Math.floor(min/60)).padStart(2,'0'); const mm=String(min%60).padStart(2,'0'); return `${hh}:${mm}` }

export default function BookPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const [userId, setUserId] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [viewDate, setViewDate] = useState(() => startOfMonth(new Date()))
  const [bookings, setBookings] = useState({}) // { 'YYYY-MM-DD': [ ... ] }
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const [selectedDay, setSelectedDay] = useState(null)  // 'YYYY-MM-DD' or null
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')

  // セル要素の参照（選択日にスクロール用）
  const cellRefs = useRef({})

   // ===== Framer Motion: 横スワイプ制御 =====
  const x = useMotionValue(0)                 // ドラッグ中のXオフセット
  const controls = useAnimation()             // アニメーション制御
  const width = typeof window !== 'undefined' ? window.innerWidth : 375

  // 軽いパララックス（ヘッダはゆっくり、グリッドは等速）
  const parallaxHeaderX = useTransform(x, (v) => v * 0.3)  // 3割の移動量
  const parallaxGridX   = x                                // 等速

   // スワイプ判定
  const SWIPE_THRESH = Math.min(120, Math.max(80, width * 0.18)) // 画面幅18% or 80〜120px

  // ログインユーザー取得
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!mounted) return
      if (error) console.error('getUser error:', error)
      setUserId(data?.user?.id ?? null)

      const user = data?.user
      const uid = user.id
        if (!user) {
          setDisplayName('')
          return
        }

        const email = (user.email || '').toLowerCase()

        await supabase
          .from('allowed_signup_emails')
          .update({ user_id: uid })
          .eq('email', (user.email || '').toLowerCase())

        // email をキーに note を取得
        const { data: row, error: selErr } = await supabase
          .from('allowed_signup_emails')
          .select('note')
          .eq('email', email)
          .maybeSingle()

          setUserId(uid)
        setDisplayName(row?.note?.trim() || '')
      
    })()
    return () => { mounted = false }
  }, [supabase])

  // selectedDay が決まったらシートを開き、セルへスクロール
  useEffect(() => {
    if (selectedDay) {
      setSheetOpen(true)
      const el = cellRefs.current[selectedDay]
      // カレンダーをスクロール可能にした上で、セルが見えるように
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedDay])

  // 指定月の予約一覧を取得
  async function fetchMonth(targetDate = viewDate) {
    setLoading(true)
    setMessage(null)
    const fromStr = formatYMD(startOfMonth(targetDate))
    const toStr   = formatYMD(endOfMonth(targetDate))

    const { data, error } = await supabase
      .from('bookings')
      .select('id, day, user_id, start_minute, end_minute, note')
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
    fetchMonth(viewDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewDate?.getFullYear(), viewDate?.getMonth()])

  useEffect(() => {
    setMessage("")
  }, [selectedDay])

  const today = new Date()
  const todayStr = formatYMD(new Date())
  const isSameMonth = (a,b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()

  // 予約作成
  async function reserve(dayStr) {
    if (!userId) return
    const s = timeStrToMinutes(startTime)
    const e = timeStrToMinutes(endTime)
    if (s == null || e == null) { setMessage('エラー:時刻の形式が不正です。'); return }
    if (s < 0 || e > 1440 || s >= e) { setMessage('エラー:開始は終了より前、かつ 00:00〜24:00 の範囲で指定してください。'); return }
    if (dayStr < todayStr) { setMessage('エラー:過去日は予約できません。'); return }

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

    //const safeName = (displayName || '').trim()
    const { error } = await supabase.from('bookings').insert({
      day: dayStr, user_id: userId, start_minute: s, end_minute: e, note: displayName
    })

    if (error) {
      // 失敗：一時追加を取り消し
      setBookings(prev => {
        const copy = { ...prev }
        copy[dayStr] = (copy[dayStr] || []).filter(r => r.id !== tempId)
        return copy
      })
      if (error.code === '23P01') setMessage('エラー:時間帯が他の予約と重なっています。')
      else setMessage('エラー:予約に失敗しました: ' + error.message)
    } else {
      await fetchMonth()
      setMessage('予約しました。')
    }
    setSubmitting(false)
  }

  // 予約キャンセル（自分の予約のみ）
  async function cancel(dayStr, row) {
    if (!userId) return
    if (row.user_id !== userId) { setMessage('エラー:自分の予約のみキャンセルできます。'); return }

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
      setMessage('エラー:キャンセルに失敗しました: ' + error.message)
    } else {
      setMessage('キャンセルしました。')
    }
    setSubmitting(false)
  }

  const handleDragEnd = async (_, info) => {
    const offsetX = info.offset.x

    // 右→左（次月）
    if (offsetX <= -SWIPE_THRESH) {
      // いったん画面外までアニメ → 月+1 → 位置を0へ戻す
      await controls.start({ x: -width, transition: { type: 'tween', duration: 0.18 } })
      x.set(0) // 直ちに原点へ
      setViewDate(prev => startOfMonth(addMonths(prev, +1)))
      // 月が切り替わった見た目に合わせるため、左から入ってくる感じを演出（任意）
      await controls.start({ x: width, transition: { duration: 0 } })
      await controls.start({ x: 0, transition: { type: 'tween', duration: 0.18 } })
      return
    }

    // 左→右（前月）
    if (offsetX >= SWIPE_THRESH) {
      await controls.start({ x: width, transition: { type: 'tween', duration: 0.18 } })
      x.set(0)
      setViewDate(prev => startOfMonth(addMonths(prev, -1)))
      await controls.start({ x: -width, transition: { duration: 0 } })
      await controls.start({ x: 0, transition: { type: 'tween', duration: 0.18 } })
      return
    }

    // 閾値未満 → 元位置へ戻す
    await controls.start({ x: 0, transition: { type: 'spring', stiffness: 420, damping: 40 } })
  }

  /* =========================
     月グリッド描画（1面分）
  ==========================*/
  function MonthGrid({ baseDate }) {
    const cells = getMonthMatrix(baseDate)
    const listByDay = bookings
    const defaultHighlight = isSameMonth(today, baseDate) ? todayStr : null
    const highlightedDay = selectedDay ?? defaultHighlight
    

    return (
      <div className="flex flex-col w-full">
        {/* 曜日ヘッダ */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs mb-1 px-4">
          {['日','月','火','水','木','金','土'].map(d => (
            <div key={d} className="py-2 font-medium">{d}</div>
          ))}
        </div>

        {/* 日付セル */}
        <div className="mx-4 grid grid-cols-7  border-t border-l  border-slate-300 overflow-hidden">
          {cells.map((d, idx) => {
            const ymd = formatYMD(d)
            const isToday = ymd === todayStr
            const disabledPast = d < new Date(todayStr)
            const outside = !isSameMonth(d, baseDate)
            const list = listByDay[ymd] || []
            const mineCount = userId ? list.filter(r => r.user_id === userId).length : 0
            const isHighlighted = highlightedDay === ymd
            

            return (
              <button
                ref={el => { cellRefs.current[ymd] = el }}
                type="button"
                key={idx}
                onClick={() => setSelectedDay(ymd)}
                className={
                  "relative p-1 min-h-[92px] border-r border-b text-left flex flex-col items-start border-slate-300 " +
                  (outside ? "bg-gray-200 " : "") +
                  (isToday ? "bg-gray-300 " : "")                   
                }
                title="クリックして詳細を表示"
              >
                {/* 強調用の太枠（見た目だけ、レイアウトに影響しない） */}
                {isHighlighted && (
                  <div className="pointer-events-none absolute inset-0 border-2 border-gray-500"></div>
                )}

                <div className="mb-1">
                  <span className="text-sm block">{d.getDate()}</span>
                  {/* {isToday && (
                    <span className="text-[10px] px-1 py-0.5 rounded border mt-0.5 inline-block">
                      今日
                    </span>
                  )} */}
                </div>

                <div className="space-y-1 text-[11px] ">
                  {list.length > 0 && (
                    <div className="text-blue-700 text-[10px] px-1 py-0.5 rounded border mt-0.5 inline-block">
                      {list.length} 件
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  

  function BottomSheet({
    open,
    selectedDay,
    bookings,
    userId,
    submitting,
    startTime,
    endTime,
    setStartTime,
    setEndTime,
    minutesToTimeStr,
    onReserve,
    onCancel,
    onClose,                  // ← 親側で setSheetOpen(false); setSelectedDay(null)
    maxHeight = "45vh",
  }) {
    const list = selectedDay ? (bookings[selectedDay] || []) : []
    const controls = useAnimation()

    // マウント時に上へスライドイン
    useEffect(() => {
      if (open) {
        controls.start({ y: 0, transition: { type: "tween", duration: 0.22 } })
      }
    }, [open, controls])

    // スライドアウトしてから閉じる
    const closeWithSlide = async () => {
      if (submitting) return;
      await controls.start({ y: "100%", transition: { type: "tween", duration: 0.22 } })
      onClose()
    }

    return (
      <AnimatePresence initial={false}>
        {open && selectedDay && (
          <motion.div
            key="bottomsheet"
            data-bottomsheet-root
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-black bg-white"
            initial={{ y: "100%" }}        // 入場は下から
            animate={controls}              // 開閉は controls で制御
            exit={{ y: "100%" }}            // （保険として）Unmount時も下へ
            drag="y"
            dragListener={!submitting}   
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.08}
            dragMomentum={false}
            onDragEnd={(_, info) => { if (info.offset.y > 80) closeWithSlide() }}
          >
            {/* つまみ（逆三角形）: タップでも閉じる */}
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={closeWithSlide}
                aria-label="閉じる"
                className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[12px]
                          border-l-transparent border-r-transparent border-t-slate-400 cursor-pointer"
              />
            </div>

            {message && (
              <div
                className={`text-sm mt-2 text-center ${
                  message.includes("エラー") 
                    ? "text-red-600"
                    : "text-green-600"
                }`}
              >
                {message}
              </div>
            )}

            {/* タイトル行（ボタンも置いておくと親切） */}
            <div className="sticky top-0 z-10 bg-white px-4 py-2 border-b flex items-center justify-between">
              <div className="font-medium">{selectedDay} の予約</div>
            </div>

            {/* コンテンツ */}
            <div className="p-4" style={{ maxHeight, overflow: "auto" }}>
              <div className="space-y-2 mb-3">
                {list.length === 0 ? (
                  <div className="text-sm text-slate-500">予約はありません</div>
                ) : list.map(r => {
                  const mine = userId && r.user_id === userId
                  const who  = mine ? 'あなた' : (r.note?.trim() )
                  return (
                    <div key={r.id} className="flex items-center justify-between text-sm border rounded px-2 py-1">
                      <div>
                        <div className="font-mono">
                          {minutesToTimeStr(r.start_minute)}–{minutesToTimeStr(r.end_minute)}
                        </div>
                        <div className="text-xs text-slate-600">{who}</div>
                      </div>
                      <div>
                        {mine ? (
                          <button
                            className="text-xs px-2 py-1 border rounded"
                            disabled={submitting}
                            onClick={() => onCancel(selectedDay, r)}
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

              {/* 新規予約 */}
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
                  disabled={submitting || !userId}
                  onClick={() => onReserve(selectedDay)}
                >
                  予約する
                </button>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )
  }


  return (
    <main
      className="max-w-5xl mx-auto px-0 sm:px-4 flex flex-col"
      style={{ height: 'var(--app-vh)' }}
    >
      {/* ヘッダ */}
      <header
        style={{ x: parallaxHeaderX }}
        className="sticky top-0 z-20 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-between select-none border-b"
      >
        <div className="text-lg sm:text-xl font-semibold">部屋予約（216号室）</div>
        <div className="text-lg sm:text-base font-medium">
          {viewDate.getFullYear()}年 {viewDate.getMonth()+1}月
        </div>
      </header>

      {/* カレンダー領域（スクロールはこの中だけで完結） */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* 横スワイプ担当（transformはここだけ） */}
        <motion.div
          className="px-0 sm:px-4 h-full"
          drag={sheetOpen ? false : "x"}  
          dragListener={!sheetOpen}
          dragPropagation={true}
          dragConstraints={{ left: 0, right: 0 }}// シート開時は横ドラッグを無効化
          dragElastic={0.12}
          dragDirectionLock
          dragMomentum={false}
          style={{ x: parallaxGridX}}                 // ← ここには touchAction を付けない
          animate={controls}
          onDragEnd={handleDragEnd}
        >
          {/* 縦スクロール担当（transformなしの普通のdiv） */}
          <div
            className={`h-full allow-vertical-scroll ${
              sheetOpen ? 'overflow-y-auto' : 'overflow-y-hidden'
            }`}
            style={{
              //WebkitOverflowScrolling: sheetOpen ? 'touch' : 'auto',
              // シート閉時は横スワイプだけ許可（縦は無効）
              //touchAction: sheetOpen ? 'pan-y' : 'pan-x',
              // iOSの背景バウンドを抑える保険（対応端末）
              overscrollBehaviorY: sheetOpen ? 'contain' : 'none',
              WebkitOverflowScrolling: sheetOpen ? 'touch' : 'auto',
              touchAction: 'pan-y'
            }}
          >
            <MonthGrid baseDate={viewDate} />

            {/* シート分の余白は開いているときだけ */}
            {sheetOpen && <div className="pb-[45vh]" />}

            
          </div>
        </motion.div>
      </div>

      

      {/* ボトムシート（背景なし） */}
      <BottomSheet
        open={sheetOpen}
        selectedDay={selectedDay}
        bookings={bookings}
        userId={userId}
        submitting={submitting}
        startTime={startTime}
        endTime={endTime}
        setStartTime={setStartTime}
        setEndTime={setEndTime}
        minutesToTimeStr={minutesToTimeStr}
        onReserve={(dayStr) => reserve(dayStr)}
        onCancel={(dayStr, row) => cancel(dayStr, row)}
        onClose={() => { setSheetOpen(false), setMessage("") }}
        maxHeight="45vh"
      />

      {/* フッター（カレンダー直下に置く場合）
            <footer className="mt-4 px-4 pb-3 text-[11px] text-slate-500 space-y-1">
              <p>※ 時間帯は <code>開始 &lt; 終了</code>。日またぎ（23:00→01:00 等）は現仕様では不可。</p>
              <p>※ タイムゾーン差異回避のため、日付は <code>date</code>、時間は分整数で保存。</p>
            </footer> */}

      
    </main>
  )
}
