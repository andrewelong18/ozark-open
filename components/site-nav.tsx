"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar } from "@/components/avatar"
import { Collapse } from "@/components/ui/collapse"

export type NavItem = {
  label: string
  href: string
  /** Renders the member's face as the pill's icon — Profile only. */
  avatar?: { src: string | null; name: string }
}

// Only real routes are listed here — no dead links to unbuilt screens.
// Leaderboard came out Aug 23, 2026 at Andrew's call; /leaderboard is still
// built and deployed, just not linked from anywhere.
const NAV: NavItem[] = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Place Bets", href: "/bets" },
  { label: "My Bets", href: "/my-bets" },
]

/** Dashboard/Place Bets/My Bets, plus whatever the server appended. */
function navItems(extraItems: NavItem[]): NavItem[] {
  return [...NAV, ...extraItems]
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/")
}

/** The gold-pill link, shared by the desktop rail and the mobile menu. */
function NavPill({
  item,
  active,
  className,
  linkRef,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  className?: string
  linkRef?: React.Ref<HTMLAnchorElement>
  onNavigate?: () => void
}) {
  return (
    <Link
      href={item.href}
      ref={linkRef}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm whitespace-nowrap transition-colors duration-fast ease-standard",
        active
          ? "bg-accent-gold font-bold text-accent-gold-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.5),inset_0_-3px_5px_-2px_rgba(0,0,0,0.45),0_2px_5px_rgba(0,0,0,0.35)]"
          : "font-medium text-indigo-200 hover:bg-white/10 hover:text-white",
        className
      )}
    >
      {item.avatar && (
        <Avatar src={item.avatar.src} name={item.avatar.name} size="xs" />
      )}
      {item.label}
    </Link>
  )
}

/**
 * The clubhouse pill nav — a dark inset rail with a gold active pill.
 *
 * Desktop only since Aug 23, 2026: it used to sit on its own line under the
 * brand bar at every width, which cost the app a whole row of header on the
 * screen with the least of it to spare. It now rides in the brand bar itself
 * from `lg` up, and everything narrower gets <MobileNav>'s Menu button.
 *
 * `extraItems` appends what the server Header decides on — Results once the
 * tournament completes, and Profile, which carries the member's own avatar as
 * its icon (it was a separate cluster in the top-right until it became a nav
 * item like any other).
 */
export function SiteNav({
  extraItems = [],
  className,
}: {
  extraItems?: NavItem[]
  className?: string
}) {
  const pathname = usePathname()
  const items = navItems(extraItems)
  const activeRef = useRef<HTMLAnchorElement | null>(null)

  // Bring the gold pill into view if the rail ever overflows — an appended
  // Results pill on a narrow laptop is the case that still can. `block:
  // "nearest"` keeps this strictly horizontal; scrolling the PAGE to reveal
  // the nav would be its own bug.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [pathname])

  return (
    <nav
      className={cn(
        "scrollbar-none flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-indigo-950 p-1.5",
        "shadow-[var(--shadow-lg),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-6px_12px_-8px_rgba(0,0,0,0.6)]",
        "[background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,0.09)_0_2px,rgba(255,255,255,0)_2px_9px)]",
        className
      )}
    >
      {items.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <NavPill
            key={item.href}
            item={item}
            active={active}
            linkRef={active ? activeRef : undefined}
          />
        )
      })}
    </nav>
  )
}

/**
 * The tablet/phone nav: a Menu button in the brand bar, and the same pills
 * stacked in a panel that drops out of it.
 *
 * The panel overlays the page rather than pushing it down — a nav that shoves
 * the whole dashboard 250px south on open is disorienting on the screen this
 * exists for. Hence the backdrop, which is also what closes it on a tap
 * outside; Escape and a route change close it too.
 */
export function MobileNav({
  extraItems = [],
  className,
}: {
  extraItems?: NavItem[]
  className?: string
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = navItems(extraItems)

  // Navigating is the one close that isn't a dismissal — without it the panel
  // stays open over the page it just took you to. Adjusted during render, not
  // in an effect: that's React's sanctioned shape for state derived from a
  // changing input, and it's what react-hooks/set-state-in-effect requires
  // (the same call the repo's <Collapse> makes, for the same reason).
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="mobile-nav-panel"
        className="relative z-50 flex h-11 items-center gap-2 rounded-full border border-white/25 px-3.5 text-sm font-semibold text-white transition-colors duration-fast ease-standard hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {open ? (
          <X className="size-5" aria-hidden />
        ) : (
          <Menu className="size-5" aria-hidden />
        )}
        Menu
      </button>

      {/* Tap-anywhere-else to close. aria-hidden + tabIndex -1: Escape and the
          button itself are the keyboard paths, so this must not become a stop
          in the tab order. */}
      {open && (
        <div
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/20"
        />
      )}

      <div
        id="mobile-nav-panel"
        className="absolute top-full right-0 left-0 z-40 px-4"
      >
        <Collapse open={open}>
          <nav className="mt-1 flex flex-col gap-1 rounded-xl border border-white/10 bg-indigo-950 p-1.5 shadow-[var(--shadow-lg),inset_0_1px_0_rgba(255,255,255,0.1)] [background-image:repeating-linear-gradient(-45deg,rgba(255,255,255,0.09)_0_2px,rgba(255,255,255,0)_2px_9px)]">
            {items.map((item) => (
              <NavPill
                key={item.href}
                item={item}
                active={isActive(pathname, item.href)}
                className="w-full"
                onNavigate={() => setOpen(false)}
              />
            ))}
          </nav>
        </Collapse>
      </div>
    </div>
  )
}
