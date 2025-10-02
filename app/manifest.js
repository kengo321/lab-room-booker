// app/manifest.js
export default function manifest() {
  return {
    name: 'Lab Room Booker',
    short_name: 'LabBook',
    start_url: '/',        // 直接 /book にしてもOK（好み）
    scope: '/',
    display: 'standalone', // ← これがフルスクリーン化の鍵
    background_color: '#ffffff',
    theme_color: '#111827',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }
}