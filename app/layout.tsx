import './globals.css'
import Script from 'next/script'

export const metadata = {
  title: 'Vibe Calorie Tracker',
  description: 'Приватний трекер калорій',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="uk">
      <head>
        {/* Залізобетонне підключення Telegram SDK */}
        <script src="https://telegram.org/js/telegram-web-app.js" async></script>
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
