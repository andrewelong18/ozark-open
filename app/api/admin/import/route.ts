import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Spreadsheet ingestion endpoint (ADR 0001 §7). Writes run under the admin's
// own session — the Sprint 1 RLS policies ("Admins can write bets/bet_picks")
// are the authorization; there is no service-role key in play.

const ACCEPTED_EXTENSIONS = [".xlsx", ".csv"]

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle()

  if (!(profile as { is_admin: boolean } | null)?.is_admin) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get("file")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 })
  }

  const name = file.name.toLowerCase()
  if (!ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext))) {
    return NextResponse.json(
      { error: "Upload the bets spreadsheet as .xlsx or .csv." },
      { status: 400 }
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  return NextResponse.json({
    message: `Received ${file.name} (${buffer.length} bytes). Importer lands in the next commits.`,
  })
}
