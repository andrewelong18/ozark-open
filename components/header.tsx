import Image from "next/image"
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { MobileNav, SiteNav, type NavItem } from "@/components/site-nav"

/**
 * App header — the indigo clubhouse bar: the mark, the Azalea wordmark, and
 * the nav. Log out lives on the profile page.
 *
 * One line at every width (Aug 23, 2026). The pill rail used to sit on its own
 * row beneath this bar, which spent two rows of a phone screen on chrome; it
 * now rides in the bar itself from `lg` up, and below that it's behind the
 * Menu button. The avatar + name cluster on the right went with it — Profile
 * is a nav item now, wearing the same face as its icon.
 */
export async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const extraItems: NavItem[] = []
  if (user) {
    const [
      { data, error: profileError },
      { data: tournamentData, error: tournamentError },
    ] = await Promise.all([
      supabase
        .from("users")
        .select("display_name, avatar_url")
        .eq("id", user.id)
        .single(),
      supabase
        .from("tournaments")
        .select("status")
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    // The header degrades on purpose: a failed read here must not take down
    // every page's chrome. But it logs, because a silently missing admin link
    // is indistinguishable from having lost admin (#132).
    if (profileError) {
      console.error("[header] profile read failed:", profileError.message)
    }
    if (tournamentError) {
      console.error("[header] tournament read failed:", tournamentError.message)
    }
    const profile = data as {
      display_name: string
      avatar_url: string | null
    } | null
    // Results appears only once the tournament wraps — no dead link before
    // that (the page itself also gates on 'completed').
    if ((tournamentData as { status: string } | null)?.status === "completed")
      extraItems.push({ label: "Results", href: "/results" })
    // Profile is the last pill, and the only one with a face. The label is
    // just "Profile" — the member's own name was the top-right cluster's job,
    // and a name in the nav rail would be the widest pill on the row.
    extraItems.push({
      label: "Profile",
      href: "/profile",
      avatar: {
        src: profile?.avatar_url ?? null,
        name: profile?.display_name ?? user.email ?? "You",
      },
    })
    // Admin tools live on the profile page now (Sprint 15) — no top-nav pill.
  }

  return (
    // relative: the mobile menu panel hangs off the bottom of this bar.
    <header className="relative bg-gradient-to-b from-indigo-700 to-indigo-800 py-2 text-text-on-dark shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex min-h-14 max-w-[var(--container-max,1120px)] items-center gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          {/* The mark, back in the bar. Unoptimized: it's a two-colour SVG
              already in /public — running it through the image pipeline buys
              nothing and costs a request. */}
          <Image
            src="/ozark-mark.svg"
            alt=""
            width={818}
            height={747}
            unoptimized
            priority
            className="h-8 w-auto shrink-0"
          />
          <span className="truncate font-heading text-xl tracking-[0.01em] text-white">
            Ozark Open Sportsbook
          </span>
        </Link>

        {user ? (
          <>
            {/* Desktop: the rail on the same line, pushed right. Below lg the
                same items live behind Menu. */}
            <SiteNav extraItems={extraItems} className="ml-auto hidden lg:flex" />
            <MobileNav extraItems={extraItems} className="ml-auto lg:hidden" />
          </>
        ) : (
          <Link
            href="/login"
            className="ml-auto h-8 shrink-0 rounded-md border border-white/25 px-3 text-sm font-semibold leading-8 text-white transition-colors duration-fast ease-standard hover:bg-white/10"
          >
            Log in
          </Link>
        )}
      </div>
    </header>
  )
}
