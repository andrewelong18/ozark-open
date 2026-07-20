import Image from "next/image"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"

// The required first-run step (Sprint 16). Middleware routes any authenticated
// member with onboarded_at IS NULL here; once they finish, the same middleware
// keeps them out. Belt-and-suspenders: we re-check here too.
export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: profile } = await supabase
    .from("users")
    .select("onboarded_at")
    .eq("id", user.id)
    .maybeSingle()
  if ((profile as { onboarded_at: string | null } | null)?.onboarded_at) {
    redirect("/dashboard")
  }

  // The pick-count range is a tournament rule — read it, never hardcode it.
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("min_picks_per_phase, max_picks_per_phase")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle()
  const rules = tournament as {
    min_picks_per_phase: number
    max_picks_per_phase: number
  } | null

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-gradient-to-t from-ink-100 to-background px-6 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src="/ozark-mark.svg"
            alt=""
            width={84}
            height={84}
            className="h-16 w-auto"
            priority
          />
          <div className="mt-2 font-heading text-2xl leading-none text-indigo-700">
            Welcome to the Ozark Open
          </div>
        </div>
        <OnboardingForm
          userId={user.id}
          email={user.email ?? ""}
          minPicks={rules?.min_picks_per_phase ?? 5}
          maxPicks={rules?.max_picks_per_phase ?? 10}
        />
      </div>
    </div>
  )
}
