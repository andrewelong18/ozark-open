"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { siteOrigin } from "@/lib/site-url"

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string
  const supabase = await createClient()

  // Where the emailed link lands. In production this is always ozark-open.com,
  // never the host this request happened to arrive on — see lib/site-url.ts for
  // the inbox-full-of-.vercel.app-links bug that pinned it down. It must stay in
  // step with the Supabase project's Site URL (the email template builds the
  // link from that) and be covered by the redirect allow-list; scripts/auth-url-check.sh
  // asserts both against prod.
  const headersList = await headers()
  const origin = siteOrigin(headersList.get("host"), process.env.VERCEL_ENV)

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`)
  }

  redirect("/login?sent=true")
}
