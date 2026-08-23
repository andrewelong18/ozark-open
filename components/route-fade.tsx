"use client"

import { usePathname } from "next/navigation"

/**
 * A route-level entrance: the incoming page fades up rather than replacing the
 * old one in a single frame.
 *
 * WHY NOT React's <ViewTransition>. Sprint 12 tried it first — it is the better
 * technique on paper, and it would have given the gold nav pill a genuine
 * shared-element morph between routes for free. Two measurements sent it back:
 *
 *   1. `experimental.viewTransition: true` on its own does nothing. Instrumented
 *      document.startViewTransition in a real browser and counted calls: zero on
 *      a <Link> navigation, zero on router.refresh(). Next needs an explicit
 *      <ViewTransition> component in the tree, which means wrapping every
 *      page.tsx — ten-plus files behind an experimental React API, three weeks
 *      before this app has to be finished and reliable for a live tournament.
 *   2. The upside over this file is a nicer curve and the pill morph. Not worth
 *      that surface area on a weekend project that has to work in September.
 *
 * The one thing this deliberately gets RIGHT that view transitions make hard:
 * every write in this app ends in router.refresh(), and a route transition that
 * fired on a refresh would crossfade the whole page each time somebody places a
 * stake — the single most repeated interaction of the weekend, and squarely
 * into the attention-grabbing motion the design system bans. Keying on pathname
 * gets the correct behaviour for free: a refresh re-renders into the same key,
 * so it never replays. That is a feature of this approach, not a limitation.
 *
 * Entrance only. React swaps route subtrees synchronously, so there is no exit
 * to animate without keeping the old tree alive, which is a much bigger change
 * than the white-flash it would fix.
 *
 * Wraps <main>'s children only, so the indigo header and the nav rail stay put —
 * a chrome that fades on every navigation costs the user their spatial anchor.
 * app/layout.tsx stays a server component: passing server-rendered children
 * through a client component as `children` does not make them client components.
 */
export function RouteFade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    // The duration lives in --animate-fade-in-soft, not in a `duration-enter`
    // class alongside it: `duration-*` sets transition-duration and Tailwind's
    // --tw-duration, and neither retimes an `animation` shorthand that already
    // carries its own. The class that used to be here was inert, and the fade
    // ran at --dur-base while every comment around it said --dur-enter.
    <div key={pathname} className="motion-safe:animate-fade-in-soft">
      {children}
    </div>
  )
}
