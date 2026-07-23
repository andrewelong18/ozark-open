import type { Metadata } from "next"
import { Montserrat } from "next/font/google"
import localFont from "next/font/local"
import "./globals.css"
import { Header } from "@/components/header"
import { PlayerProfileProvider } from "@/components/player/player-profile-provider"

// Workhorse UI + body face. Exposed as --font-montserrat → --font-sans.
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
})

// Display / brand face — headings and the wordmark ONLY.
// Exposed as --font-azalea → --font-display / --font-heading.
const azalea = localFont({
  src: "./fonts/Azalea.otf",
  variable: "--font-azalea",
  display: "swap",
})

export const metadata: Metadata = {
  title: "Ozark Open Sportsbook",
  description: "Private betting pool for tournament participants.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${montserrat.variable} ${azalea.variable}`}>
      <body className="font-sans antialiased">
        <PlayerProfileProvider>
          <Header />
          <main>{children}</main>
        </PlayerProfileProvider>
      </body>
    </html>
  )
}
