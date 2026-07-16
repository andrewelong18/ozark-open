"use server"

import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"

export async function signIn(formData: FormData) {
  const email = formData.get("email") as string
  const supabase = await createClient()

  const headersList = await headers()
  const host = headersList.get("host") ?? "localhost:3000"
  const protocol = host.includes("localhost") ? "http" : "https"
  const origin = `${protocol}://${host}`

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
