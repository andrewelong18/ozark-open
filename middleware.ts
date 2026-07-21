import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY")
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const protectedRoutes = [
    "/dashboard",
    "/bets",
    "/my-bets",
    "/leaderboard",
    "/admin",
    "/results",
    "/profile",
    "/onboarding",
  ]
  const isProtected = protectedRoutes.some((r) => pathname.startsWith(r))

  if (!user && isProtected) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // First-run onboarding gate (Sprint 16): an authenticated member with
  // onboarded_at IS NULL must complete the required setup step before the rest
  // of the app. Skip the check for the onboarding page itself and the auth
  // callback so they can actually get there / sign in.
  if (user && !pathname.startsWith("/auth")) {
    const { data: profile, error } = await supabase
      .from("users")
      .select("onboarded_at")
      .eq("id", user.id)
      .maybeSingle()

    // Fail OPEN if the check itself failed (e.g. the onboarding migration
    // isn't applied yet, so users.onboarded_at doesn't exist). Forcing
    // /onboarding on a query error traps every member in an inescapable loop —
    // the onboarding write targets the same missing column and 500s, so it can
    // never be satisfied. A soft first-run gate must never brick the whole app.
    const onboarded = error
      ? true
      : Boolean((profile as { onboarded_at: string | null } | null)?.onboarded_at)

    if (!onboarded && !pathname.startsWith("/onboarding")) {
      return NextResponse.redirect(new URL("/onboarding", request.url))
    }
    if (onboarded && (pathname === "/login" || pathname.startsWith("/onboarding"))) {
      return NextResponse.redirect(new URL("/dashboard", request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
