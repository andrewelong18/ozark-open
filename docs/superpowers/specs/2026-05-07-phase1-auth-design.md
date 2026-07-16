# Phase 1 — Authentication & User Records Design

**Date:** 2026-05-07
**Goal:** Participants can log in via magic link, see their name in the header, and log out. A `public.users` row is created automatically on first login.

---

## Scope

Implement full Supabase magic-link auth using `@supabase/ssr` with Next.js App Router. Protect `/dashboard` and `/bets` behind login. Update the header to show the authenticated user's `display_name`.

Out of scope: profile editing, admin promotion UI (done in Studio), any Phase 2+ features.

---

## Approach

`@supabase/ssr` with middleware — the standard Supabase-recommended pattern for Next.js App Router. Sessions stored in HTTP-only cookies so Server Components can read them without client-side hydration.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/supabase/client.ts` | Create | Browser client for Client Components |
| `lib/supabase/server.ts` | Create | Server client for Server Components + route handlers |
| `middleware.ts` | Create | Session refresh + route protection |
| `supabase/migrations/001_users_table.sql` | Create | `public.users` table, RLS policies, new-user trigger |
| `app/login/page.tsx` | Create | Magic-link login form |
| `app/auth/callback/route.ts` | Create | Exchange code → session, redirect to `/dashboard` |
| `app/auth/signout/route.ts` | Create | Sign out, redirect to `/login` |
| `components/header.tsx` | Modify | Async Server Component: show user name + logout, or Log in link |

---

## Section 1: Supabase Client Setup

### `lib/supabase/client.ts`
Browser client, used in Client Components. Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from the environment.

```ts
import { createBrowserClient } from "@supabase/ssr"

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

### `lib/supabase/server.ts`
Server client, used in Server Components and route handlers. Reads and writes cookies via `next/headers`.

```ts
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

---

## Section 2: Middleware

### `middleware.ts` (repo root)

Runs on every non-static request. Refreshes the Supabase session cookie, then enforces:
- Unauthenticated user accessing `/dashboard` or `/bets` → redirect to `/login`
- Authenticated user accessing `/login` → redirect to `/dashboard`

```ts
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname
  const protectedRoutes = ["/dashboard", "/bets"]
  const isProtected = protectedRoutes.some(r => pathname.startsWith(r))

  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
```

---

## Section 3: Database Migration

### `supabase/migrations/001_users_table.sql`

Creates `public.users` table, enables RLS, adds read policies, and creates the trigger that mirrors `auth.users` inserts.

**Table:**
```sql
CREATE TABLE public.users (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  display_name text NOT NULL,
  is_admin     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

**RLS:**
```sql
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Security definer function avoids recursive RLS when checking is_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true
  );
$$;

CREATE POLICY "Users can read own row"
  ON public.users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all users"
  ON public.users FOR SELECT
  USING (public.is_admin());
```

**New-user trigger:**
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (NEW.id, NEW.email, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**display_name default:** full email address (e.g., "esswein93@gmail.com"). Admins update names in Supabase Studio after users first log in.

---

## Section 4: Login Page

### `app/login/page.tsx`

Centered card (shadcn `Card`) with:
- Heading: "Ozark Open Sportsbook"
- Subtext: "Enter your email to receive a magic link."
- Email input + "Send magic link" button
- Server Action handles the submit: calls `supabase.auth.signInWithOtp()` with `emailRedirectTo` pointing to `/auth/callback`
- Success state: replaces form with "Check your email for a login link."
- Error state: shows error message inline below the button

No client-side JS required — form submits via Server Action.

**`emailRedirectTo`:** constructed from `NEXT_PUBLIC_SITE_URL` env var (added to `.env.local.example`). Falls back to `http://localhost:3000` for local dev.

**New env var needed:** `NEXT_PUBLIC_SITE_URL` — the full base URL (e.g., `https://ozark-open.vercel.app`). Add to `.env.local.example` and to Vercel project settings.

---

## Section 5: Auth Callback Route

### `app/auth/callback/route.ts`

`GET` handler. Receives `?code=` from the magic link email.

```
GET /auth/callback?code=<supabase_code>
```

Calls `supabase.auth.exchangeCodeForSession(code)`. On success: redirects to `/dashboard`. On failure (missing or invalid code): redirects to `/login?error=auth_failed`.

---

## Section 6: Sign-Out Route

### `app/auth/signout/route.ts`

`POST` handler. Calls `supabase.auth.signOut()` then redirects to `/login`. The header's logout button is a `<form method="POST" action="/auth/signout">` — no JavaScript required.

---

## Section 7: Header Update

### `components/header.tsx`

Converted from a static component to an async Server Component.

**Authenticated state:**
- Left: "Ozark Open" → `/`
- Right: user's `display_name` (text, not a link) + "Log out" form button

**Unauthenticated state:**
- Left: "Ozark Open" → `/`
- Right: "Log in" link (shadcn `<Button asChild><Link href="/login">`)

The server client reads the user from the session cookie. If the user row exists in `public.users`, use `display_name`. If somehow the row is missing (edge case), fall back to the auth email.

---

## Done When

- Log in with a real email, receive magic link, click it, land on `/dashboard`
- Header shows your email address as `display_name`
- Log out returns to `/login`
- New `public.users` row appears in Supabase Studio after first login
- `/dashboard` and `/bets` redirect to `/login` when not authenticated
- Admins can promote users to `is_admin = true` in Studio
