"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

export type NavItem = { label: string; href: string }

// Only real routes are listed here — no dead links to unbuilt screens.
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Bets", href: "/bets" },
  { label: "My Bets", href: "/my-bets" },
]

/**
 * The clubhouse pill nav — a dark inset rail with a gold active pill. Scrolls
 * horizontally under the brand bar on small screens. `extraItems` appends
 * conditional links the server Header decides on (Results once the
 * tournament completes, Admin for admins) — the base list stays static so
 * there are never dead links.
 */
export function SiteNav({ extraItems = [] }: { extraItems?: NavItem[] }) {
  const pathname = usePathname()
  const items = [...NAV, ...extraItems]

  return (
    <nav
      className={cn(
        "mx-auto mb-3 flex w-[calc(100%-2rem)] max-w-[var(--container-max,1120px)] gap-1 overflow-x-auto rounded-full border border-white/10 bg-indigo-950 p-1.5",
        "shadow-[var(--shadow-lg),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-6px_12px_-8px_rgba(0,0,0,0.6)]",
        "[background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,0.09)_0_2px,rgba(255,255,255,0)_2px_9px)]"
      )}
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-10 shrink-0 items-center rounded-full px-4 text-sm whitespace-nowrap transition-colors",
              active
                ? "bg-accent-gold font-bold text-accent-gold-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-3px_5px_-2px_rgba(0,0,0,0.45),0_2px_5px_rgba(0,0,0,0.35)]"
                : "font-medium text-indigo-200 hover:bg-white/10 hover:text-white"
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
