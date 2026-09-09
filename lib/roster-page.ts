// The member-facing roster (Sprint 26): the pure half of /roster — deciding
// who is in the field and in what order.
//
// Not to be confused with lib/roster.ts, which builds the ADMIN people
// console. That one shows everyone in the funnel, including people who
// haven't signed in yet, because chasing them is its whole job. This one
// shows the field: who is actually playing the Ozark Open.
//
// Three conditions, and each one is load-bearing:
//
//   a live participant row (entry_fee > 0, revoked_at IS NULL) — the app's
//   existing betting gate (PRD §12 A11, refined by #91), so the roster can't
//   disagree with who the rest of the app treats as signed up; and
//
//   is_player — a member approved to BET isn't necessarily swinging a club,
//   and a page called Roster that lists them is lying about the field.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.

/** A users row, as /roster selects it. */
export type RosterUserRow = {
  id: string
  display_name?: string | null
  nickname?: string | null
  avatar_url?: string | null
}

/** A tournament_participants row. PostgREST may hand entry_fee back as a
 *  string, so it is coerced, never trusted. */
export type RosterParticipantRow = {
  user_id: string
  entry_fee?: number | string | null
  is_player?: boolean | null
  revoked_at?: string | null
}

/** One player on the roster card grid. Nothing else — the rest of the
 *  profile lives in the modal, which fetches it on open. */
export type RosterPlayer = {
  user_id: string
  name: string
  nickname: string | null
  avatar_url: string | null
}

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim()
}

/** Registered, approved, not revoked, and actually golfing. */
export function isFieldParticipant(row: RosterParticipantRow): boolean {
  const fee = Number(row.entry_fee)
  if (!Number.isFinite(fee) || fee <= 0) return false
  if (trimmed(row.revoked_at) !== "") return false
  // Undefined on the row means the schema default (true) applied.
  return row.is_player !== false
}

/**
 * The field, sorted by name. A participant row whose user is missing is
 * dropped rather than rendered as a faceless blank — it can only happen if a
 * users row is deleted out from under one, and a gap in the grid tells the
 * viewer nothing useful.
 */
export function buildFieldRoster(input: {
  users: RosterUserRow[]
  participants: RosterParticipantRow[]
}): RosterPlayer[] {
  const usersById = new Map<string, RosterUserRow>()
  for (const u of input.users) usersById.set(u.id, u)

  const players: RosterPlayer[] = []
  const seen = new Set<string>()
  for (const p of input.participants) {
    if (!isFieldParticipant(p) || seen.has(p.user_id)) continue
    const user = usersById.get(p.user_id)
    if (!user) continue
    seen.add(p.user_id)
    players.push({
      user_id: user.id,
      name: trimmed(user.display_name) || "Unknown member",
      nickname: trimmed(user.nickname) || null,
      avatar_url: trimmed(user.avatar_url) || null,
    })
  }

  return players.sort((a, b) =>
    a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
  )
}
