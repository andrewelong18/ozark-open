import { NextResponse } from "next/server"

import { createClient } from "@/lib/supabase/server"
import { buildHealthReport } from "@/lib/health"

// Glue. Every decision — which reads, in what order, what counts as red, and
// the rule that no data ever comes back — lives in lib/health.ts, where it is
// unit tested. See that file's header for why a process ping wouldn't have
// caught the outage this endpoint exists for.

export const dynamic = "force-dynamic"

export async function GET() {
  const report = await buildHealthReport(await createClient())

  return NextResponse.json(report, {
    // 503 so a monitor that understands nothing but status codes still works.
    // The body is for the human who opens it next.
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  })
}
