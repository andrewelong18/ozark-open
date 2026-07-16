import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { SiteNav } from "@/components/site-nav"

/**
 * App header — the indigo clubhouse bar with the Azalea brand wordmark, the
 * user + logout cluster, and the pill nav. Mobile-first: the wordmark truncates
 * with an ellipsis and never collides with the user/logout cluster.
 */
export async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let displayName: string | null = null
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .single()
    displayName =
      (data as { display_name: string } | null)?.display_name ??
      user.email ??
      null
  }

  return (
    <header className="bg-gradient-to-b from-indigo-700 to-indigo-800 pb-1.5 text-text-on-dark shadow-[inset_0_-1px_0_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex h-14 max-w-[var(--container-max,1120px)] items-center justify-between gap-3 px-4">
        <Link
          href="/"
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span className="truncate font-heading text-xl tracking-[0.01em] text-white">
            Ozark Open Sportsbook
          </span>
        </Link>
        {user ? (
          <div className="flex shrink-0 items-center gap-2.5">
            {displayName && (
              <span className="hidden text-sm whitespace-nowrap text-indigo-200 sm:inline">
                {displayName}
              </span>
            )}
            <form method="POST" action="/auth/signout">
              <button
                type="submit"
                className="h-8 rounded-md border border-white/25 bg-transparent px-3 text-sm font-semibold text-white transition-colors hover:bg-white/10"
              >
                Log out
              </button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="h-8 shrink-0 rounded-md border border-white/25 px-3 text-sm font-semibold leading-8 text-white transition-colors hover:bg-white/10"
          >
            Log in
          </Link>
        )}
      </div>
      {user && <SiteNav />}
    </header>
  )
}
