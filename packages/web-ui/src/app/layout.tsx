import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Dialectic - Multi-Agent Debate System',
  description: 'Orchestrate AI debates to solve software design problems',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  )
}

