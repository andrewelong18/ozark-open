// Sprint 8 — the leaderboard mirror. Pat copy-pastes his Excel scoring workbook
// into a Google Sheet tab named "Sportsbook Leaderboard"; the app reads that tab
// read-only and renders it. The app never computes standings — it faithfully
// displays whatever the sheet says (same philosophy as the bet import).
//
// Columns A–H, in order:
//   Position · Player · Round 1 Points · Round 2 Points · Total Points ·
//   Starting Strokes · Round 3 Score · Final Score
//
// The last three are golf-relative-to-par values shown with the sheet's own
// number format `+0;-0;"E"` (see formatToPar). Points are plain integers;
// Position and Player are text shown verbatim.

// Note: `google-auth-library` and `next/cache` are imported lazily inside
// getLeaderboard so this module stays loadable by the bare-node test runner
// (npm run test), which can't resolve Next's export-map modules.

const TAB = "Sportsbook Leaderboard"
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly"

export type LeaderboardRow = {
  position: string
  player: string
  round1Points: number | null
  round2Points: number | null
  totalPoints: number | null
  startingStrokes: number | null
  round3Score: number | null
  finalScore: number | null
}

// Render a to-par value the way the sheet's `+0;-0;"E"` format does:
//   positive → "+3", negative → "-2", zero → "E" (even par), blank → "" (not
// yet scored). Rounds to a whole number — the format uses `0`, no decimals.
export function formatToPar(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return ""
  const n = Math.round(value)
  if (n === 0) return "E"
  return n > 0 ? `+${n}` : `${n}`
}

// Coerce one sheet cell to a number, or null when the cell is blank/absent.
// With valueRenderOption=UNFORMATTED_VALUE numeric cells already arrive as
// numbers, but guard against strings and empties just in case.
function toNumber(cell: unknown): number | null {
  if (cell === null || cell === undefined || cell === "") return null
  const n = typeof cell === "number" ? cell : Number(cell)
  return Number.isNaN(n) ? null : n
}

// Turn the raw 2-D `values` array from the Sheets API into typed rows. The
// first row is the header and is dropped. Sheets truncates trailing empty
// cells, so rows can be short — index defensively (`row[i]`).
export function parseLeaderboard(values: unknown[][]): LeaderboardRow[] {
  if (!values || values.length <= 1) return []
  return values.slice(1).map((row) => ({
    position: row[0] != null ? String(row[0]) : "",
    player: row[1] != null ? String(row[1]) : "",
    round1Points: toNumber(row[2]),
    round2Points: toNumber(row[3]),
    totalPoints: toNumber(row[4]),
    startingStrokes: toNumber(row[5]),
    round3Score: toNumber(row[6]),
    finalScore: toNumber(row[7]),
  }))
}

// Hit the live Sheets API and parse the tab. Read-only service-account auth.
async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  // Vercel stores the PEM with literal "\n" — turn them back into newlines.
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!email || !key || !sheetId) {
    throw new Error("Leaderboard Google Sheets env vars are not configured")
  }

  const { JWT } = await import("google-auth-library")
  const auth = new JWT({ email, key, scopes: [SCOPE] })
  const { token } = await auth.getAccessToken()

  const range = encodeURIComponent(`${TAB}!A:H`)
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}` +
    `?valueRenderOption=UNFORMATTED_VALUE`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    throw new Error(`Sheets API ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as { values?: unknown[][] }
  return parseLeaderboard(data.values ?? [])
}

// Public entry point. Cached 5 minutes so Pat's edits appear within the window
// without hammering the Sheets API on every request (the "Done when":
// standings within 5 min of a workbook edit). `next/cache` is imported lazily
// (see note at top) and the cached wrapper is built once, on first call.
let cached: (() => Promise<LeaderboardRow[]>) | null = null
export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  if (!cached) {
    const { unstable_cache } = await import("next/cache")
    cached = unstable_cache(fetchLeaderboard, ["leaderboard"], {
      revalidate: 300,
    })
  }
  return cached()
}
