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
  // ここでは <html> は出さず、そのまま子を返すだけでOK（親レイアウトと合成される）
  return <>{children}</>
}