# Phase 0 — App Skeleton Design

**Date:** 2026-05-07  
**Goal:** Scaffold the Next.js app, push a skeleton shell to `main`, confirm Vercel auto-deploy succeeds. Phase 0 done-when from ROADMAP.md.

---

## Scope

Create the minimum Next.js + Tailwind + shadcn/ui skeleton that:

1. Deploys successfully to Vercel on `git push main`
2. Has a real layout shell (header, nav) that Phase 1 auth work drops into without restructuring

No auth, no database calls, no real routing logic.

---

## Scaffolding

- `npx create-next-app@latest` with: TypeScript, Tailwind CSS, App Router, no `src/` directory
- `npx shadcn@latest init` with neutral base theme
- `.env.local.example` listing the two Supabase env vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`); `.env.local` already exists with real values and is gitignored

---

## File Structure

```
app/
  layout.tsx          ← root layout, renders <Header> + {children}
  page.tsx            ← landing: "Welcome to the Ozark Open Sportsbook" + "Betting opens soon."
  dashboard/
    page.tsx          ← stub: "Dashboard coming soon"
  bets/
    page.tsx          ← stub: "Bet menu coming soon"
components/
  header.tsx          ← app name left, disabled "Log in" button right
```

---

## Header Component

- Left: "Ozark Open" text (bold, link to `/`)
- Right: shadcn `<Button>` labeled "Log in", `disabled` prop set, no `onClick` — Phase 1 wires this up
- Tailwind: simple horizontal flex, border-bottom, standard padding

---

## Landing Page

- Centered layout
- `<h1>` — "Ozark Open Sportsbook"
- `<p>` — "Private betting pool for tournament participants. Betting opens soon."
- No links, no CTAs — Phase 1 adds the real login flow

---

## Stub Pages

`/dashboard` and `/bets` each render a single centered line: "Dashboard coming soon" / "Bet menu coming soon". They exist so Phase 1 has target routes to redirect to after login.

---

## What This Is NOT

- No auth guards
- No Supabase client initialization (Phase 1)
- No routing logic
- No mobile-specific polish (Phase 9)

---

## Definition of Done

Vercel deployment URL loads, shows the header and landing copy, no build errors.
