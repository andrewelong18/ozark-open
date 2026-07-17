import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ImportForm } from "@/components/admin/import-form"

// The one custom admin page in v1 (ADR 0001 §7): publish and update the bet
// menu by uploading the admin's spreadsheet. Non-admins get a 404 — the page
// shouldn't exist for them.
export default async function AdminImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) notFound()

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!(profile as { is_admin: boolean } | null)?.is_admin) notFound()

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="font-heading text-3xl leading-tight text-text-strong">
          Import Bets
        </h1>
        <p className="mt-0.5 text-sm text-text-muted">
          Upload the bets spreadsheet (.xlsx or .csv) to publish or update the
          menu. Re-uploading is the normal workflow — rows upsert by their
          sheet IDs.
        </p>
      </div>
      <ImportForm />
    </div>
  )
}
