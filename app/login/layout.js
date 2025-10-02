export const metadata = {
  // iOSのフルスクリーン化
  appleWebApp: {
    capable: true,
    title: 'LabBook',
    statusBarStyle: 'default',
  },
  // iOSのノッチ対応
  viewport: {
    width: 'device-width',
    initialScale: 1,
    viewportFit: 'cover',
  },
  // iOSホーム用アイコン（public/icons/apple-touch-icon.png）
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
}

export default function LoginLayout({ children }) {
  return (
    <>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LabBook" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Android系のこれが残ってても問題なし */}
        {/* <meta name="mobile-web-app-capable" content="yes" /> */}
      </head>
      {children}
    </>
  )
}