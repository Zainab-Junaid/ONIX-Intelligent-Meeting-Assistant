import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { AuthProvider } from '@/components/auth-provider'
import { CalendarPermissionModal } from '@/components/calendar-permission-modal'

export const metadata: Metadata = {
  title: 'Onix',
  description: 'Onix Dashboard',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <AuthProvider>
          {children}
          <CalendarPermissionModal />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  )
}
