import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { parseSheet, validateSheet } from "@/lib/import"

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

  const { data: categoriesData, error: categoriesError } = await supabase
    .from("bet_categories")
    .select("id, name")
  if (categoriesError || !categoriesData || categoriesData.length === 0) {
    return NextResponse.json(
      { error: "Couldn't load bet categories." },
      { status: 500 }
    )
  }
  const categories = categoriesData as { id: string; name: string }[]

  let parsed
  try {
    parsed = await parseSheet(buffer, file.name)
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that file — is it a valid .xlsx or .csv?" },
      { status: 400 }
    )
  }

  // Contract errors reject the whole file — no partial imports (PRD §8.2).
  const validation = validateSheet(
    parsed,
    categories.map((c) => c.name)
  )
  if (!validation.ok) {
    return NextResponse.json({ errors: validation.errors }, { status: 400 })
  }

  return NextResponse.json({
    message: `Validated ${validation.rows.length} rows. Upsert lands in the next commit.`,
  })
}
