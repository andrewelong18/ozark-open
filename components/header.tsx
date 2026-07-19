import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { SiteNav, type NavItem } from "@/components/site-nav"
import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"

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
  let nickname: string | null = null
  let avatarUrl: string | null = null
  const extraItems: NavItem[] = []
  if (user) {
    const [{ data }, { data: tournamentData }] = await Promise.all([
      supabase
        .from("users")
        .select("display_name, nickname, avatar_url, is_admin")
        .eq("id", user.id)
        .single(),
      supabase
        .from("tournaments")
        .select("status")
        .order("year", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const profile = data as {
      display_name: string
      nickname: string | null
      avatar_url: string | null
      is_admin: boolean
    } | null
    displayName = profile?.display_name ?? user.email ?? null
    nickname = profile?.nickname ?? null
    avatarUrl = profile?.avatar_url ?? null
    // Results appears only once the tournament wraps — no dead link before
    // that (the page itself also gates on 'completed').
    if ((tournamentData as { status: string } | null)?.status === "completed")
      extraItems.push({ label: "Results", href: "/results" })
    // Admin tools live on the profile page now (Sprint 15) — no top-nav pill.
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
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 transition-colors hover:bg-white/10"
            >
              <Avatar src={avatarUrl} name={displayName ?? "You"} size="sm" />
              {displayName && (
                <UserName
                  displayName={displayName}
                  nickname={nickname}
                  className="hidden text-sm whitespace-nowrap text-white sm:inline"
                />
              )}
            </Link>
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
      {user && <SiteNav extraItems={extraItems} />}
    </header>
  )
}
