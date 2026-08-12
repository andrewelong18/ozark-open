import type { Metadata, Viewport } from "next"
import { Montserrat } from "next/font/google"
import localFont from "next/font/local"
import "./globals.css"
import { Header } from "@/components/header"
import { RouteFade } from "@/components/route-fade"
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
  // Renders `<meta name="robots" content="noindex, nofollow">` on every route.
  // This is the half that actually removes the pool from search results — see
  // app/robots.ts for why robots.txt deliberately does NOT disallow crawling,
  // and why doing so would strand the existing listing instead of clearing it.
  robots: { index: false, follow: false },
}

// The tournament happens on phones, so the viewport meta tag is load-bearing
// rather than boilerplate. `viewportFit: "cover"` is the half that matters:
// without it the browser letterboxes the page above the home indicator and
// every `env(safe-area-inset-*)` in the app resolves to 0 — which is what the
// fixed bet-slip bar was quietly relying on. With it, the page runs edge to
// edge and the insets carry real numbers the footers can pad by.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
          {/* RouteFade wraps only the page body, never the header or the nav
              rail — chrome that fades on every navigation costs the user their
              spatial anchor. See the file for why this is not <ViewTransition>. */}
          <main>
            <RouteFade>{children}</RouteFade>
          </main>
        </PlayerProfileProvider>
      </body>
    </html>
  )
}
