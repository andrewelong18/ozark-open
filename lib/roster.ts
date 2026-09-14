// Admin roster (Sprint 10): the pure half of /admin/people — merging the
// expected roster (tournament_invites), everyone who has actually signed in
// (users), who's approved to bet (tournament_participants), what each asked
// to put in (entry_requests, Sprint 30) and when each last logged in
// (admin_auth_activity) into one row per person, each with a single derived
// status.
//
// Sprint 20 made this the ONLY derivation behind the admin people console —
// the old /admin/participants page derived its own pending/approved split and
// disagreed with this one. Hence `is_player` riding along (the edit form needs
// it) and `funnel` (the header counts, filtered off the same sorted array the
// table renders, so the two cannot disagree).
//
// The merge key is the normalized email, because an invite deliberately has
// no FK to users — the whole point is that the users row may not exist yet.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.

/** The one status a person gets. "Admin" is a badge, never a status. */
export type RosterStatus = "not_registered" | "not_ready" | "ready"

/** Why someone isn't ready — drives the badge label and the chase hint. */
export type RosterReason =
  | "no_account" // invited, never signed in
  | "not_onboarded" // signed in, never finished /onboarding
  | "not_approved" // onboarded, but no tournament_participants row
  | "fee_unset" // participant row with no entry in either phase
  | "revoked" // approved once, access revoked — the row and entries are kept
  | "ready"

export type InviteQueryRow = {
  email?: string | null
  invited_name?: string | null
}

export type UserQueryRow = {
  id: string
  email?: string | null
  display_name?: string | null
  nickname?: string | null
  avatar_url?: string | null
  is_admin?: boolean | null
  onboarded_at?: string | null
}

/** PostgREST may hand ints back as strings — entries are coerced, not trusted. */
export type ParticipantQueryRow = {
  user_id: string
  /** Sprint 30: one entry per phase; NULL = not in that phase. */
  phase1_entry_fee?: number | string | null
  phase2_entry_fee?: number | string | null
  is_player?: boolean | null
  /** Non-null = access revoked; the row and its entries are kept (Sprint 21 / #91). */
  revoked_at?: string | null
  /** Entry money collected. Absent on a database that predates the column. */
  paid_amount?: number | string | null
  paid_note?: string | null
}

/** What a member asked for on the entry request (Sprint 30 / A26). */
export type EntryRequestQueryRow = {
  user_id: string
  phase1_amount?: number | string | null
  phase2_amount?: number | string | null
  is_player?: boolean | null
  created_at?: string | null
}

export type AuthActivityQueryRow = {
  user_id: string
  last_sign_in_at?: string | null
}

/** The request as the console shows it, next to the approve form it prefills. */
export type RosterRequest = {
  phase1_amount: number
  phase2_amount: number
  is_player: boolean
  created_at: string | null
}

/** One human on the roster, registered or not. */
export type RosterPerson = {
  /** Stable React key: the user id when registered, else `invite:<email>`. */
  key: string
  user_id: string | null
  /** As typed / as stored — the display form, not the normalized key. */
  email: string
  /** display_name → invited_name → email. */
  name: string
  nickname: string | null
  avatar_url: string | null
  is_admin: boolean
  /** On this tournament's invite roster. */
  invited: boolean
  onboarded: boolean
  /** The phase entries as recorded; null = not in that phase. */
  phase1_entry_fee: number | null
  phase2_entry_fee: number | null
  /** What they owe: the sum of the entries they are in. null when there is
   *  no participant row or no entry recorded on it. */
  entry_fee: number | null
  /** null when there's no participant row; the edit form pre-fills from it. */
  is_player: boolean | null
  /** Entry money collected, in whole dollars. 0 when nothing is recorded and
   *  when there's no participant row — "hasn't paid" and "isn't approved yet"
   *  are told apart by entry_fee, not by this. NEVER a pool input. */
  paid_amount: number
  /** How it arrived, in the admin's own words. */
  paid_note: string | null
  /** Their one-time entry request, if they made one. */
  request: RosterRequest | null
  last_sign_in_at: string | null
  status: RosterStatus
  reason: RosterReason
}

/** The four stages of the access funnel, in order. */
export type FunnelStage =
  | "no_account"
  | "not_onboarded"
  | "awaiting_approval"
  | "approved"

/**
 * Which funnel stage a row sits in — and therefore which action (if any) the
 * console attaches to it.
 *
 * `fee_unset` lands in `awaiting_approval`: it IS still awaiting a valid
 * approval. Its row still gets Edit/Revoke rather than Approve, because the
 * participant row already exists — since Sprint 30 that is the ordinary state
 * of a member whose entries were cleared in the rollout, and of anyone
 * approved before their money was recorded.
 *
 * `revoked` lands there too, and deliberately gets Approve: re-approving is
 * exactly what an admin wants next, and the POST clears `revoked_at`.
 */
export function funnelStage(person: RosterPerson): FunnelStage {
  if (person.status === "not_registered") return "no_account"
  if (person.status === "ready") return "approved"
  return person.reason === "not_onboarded" ? "not_onboarded" : "awaiting_approval"
}

export type Roster = {
  /** Chase-first order: not registered → not ready → ready, then by name. */
  people: RosterPerson[]
  /** Chase list 1 — "hasn't registered yet". */
  notRegistered: RosterPerson[]
  /** Chase list 2 — "registered but not set up to bet". */
  notReady: RosterPerson[]
  ready: RosterPerson[]
  /** The console's header, stage by stage. Same rows, same order, as `people`. */
  funnel: {
    noAccount: RosterPerson[]
    notOnboarded: RosterPerson[]
    awaitingApproval: RosterPerson[]
    approved: RosterPerson[]
  }
  counts: {
    total: number
    notRegistered: number
    notReady: number
    ready: number
    admins: number
    /** Requests waiting on an approval — the admin's Venmo-checking queue. */
    requested: number
  }
  /** False when no invites are entered yet, so the page can suppress the
   * "not on the invite list" note that would otherwise fire for everyone. */
  hasInvites: boolean
}

/** The merge key. Agrees with the migration's `lower(email)` unique index. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase()
}

function trimmed(value: string | null | undefined): string {
  return (value ?? "").trim()
}

/** A phase entry, or null for NULL, blank, zero or nonsense. */
function entry(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

const STATUS_RANK: Record<RosterStatus, number> = {
  not_registered: 0,
  not_ready: 1,
  ready: 2,
}

/** Merge the reads into one row per person with a derived status. */
export function buildRoster(input: {
  invites: InviteQueryRow[]
  users: UserQueryRow[]
  participants: ParticipantQueryRow[]
  authActivity: AuthActivityQueryRow[]
  /** Optional so callers that predate Sprint 30 still build. */
  requests?: EntryRequestQueryRow[]
}): Roster {
  const usersByEmail = new Map<string, UserQueryRow>()
  for (const u of input.users) {
    const key = normalizeEmail(u.email)
    if (key !== "") usersByEmail.set(key, u)
  }

  const participantByUser = new Map<string, ParticipantQueryRow>()
  for (const p of input.participants) participantByUser.set(p.user_id, p)

  const requestByUser = new Map<string, EntryRequestQueryRow>()
  for (const r of input.requests ?? []) requestByUser.set(r.user_id, r)

  // An empty map (RPC blocked or failed) just means every row reads "Never".
  const lastSignInByUser = new Map<string, string | null>()
  for (const a of input.authActivity)
    lastSignInByUser.set(a.user_id, a.last_sign_in_at ?? null)

  /** Build the row for someone who has a users record. */
  function registered(
    user: UserQueryRow,
    invited: boolean,
    invitedName: string
  ): RosterPerson {
    const email = trimmed(user.email)
    const participant = participantByUser.get(user.id)
    const phase1 = entry(participant?.phase1_entry_fee)
    const phase2 = entry(participant?.phase2_entry_fee)
    const hasFee = participant !== undefined && (phase1 !== null || phase2 !== null)
    const revoked =
      participant !== undefined && trimmed(participant.revoked_at) !== ""

    let status: RosterStatus
    let reason: RosterReason
    if (revoked) {
      // The row survives a revoke so the entries come back on re-approval, but
      // it no longer means "approved to bet" (Sprint 21 / #91).
      status = "not_ready"
      reason = "revoked"
    } else if (hasFee) {
      // A live participant row with an entry is the betting gate (PRD §12
      // A11, refined by #91 and ADR 0002) — a member the admin approved is
      // ready even if they never finished onboarding. This page must not
      // disagree with what the app actually allows.
      status = "ready"
      reason = "ready"
    } else if (participant !== undefined) {
      status = "not_ready"
      reason = "fee_unset"
    } else if (trimmed(user.onboarded_at) === "") {
      status = "not_ready"
      reason = "not_onboarded"
    } else {
      status = "not_ready"
      reason = "not_approved"
    }

    const req = requestByUser.get(user.id)
    const request: RosterRequest | null = req
      ? {
          phase1_amount: Math.max(0, Number(req.phase1_amount) || 0),
          phase2_amount: Math.max(0, Number(req.phase2_amount) || 0),
          is_player: req.is_player !== false,
          created_at: trimmed(req.created_at) || null,
        }
      : null

    return {
      key: user.id,
      user_id: user.id,
      email,
      name: trimmed(user.display_name) || invitedName || email,
      nickname: trimmed(user.nickname) || null,
      avatar_url: trimmed(user.avatar_url) || null,
      is_admin: Boolean(user.is_admin),
      invited,
      onboarded: trimmed(user.onboarded_at) !== "",
      phase1_entry_fee: phase1,
      phase2_entry_fee: phase2,
      entry_fee: hasFee ? (phase1 ?? 0) + (phase2 ?? 0) : null,
      // Undefined on the row means the schema default (true) applied.
      is_player: participant === undefined ? null : participant.is_player !== false,
      paid_amount: Math.max(0, Number(participant?.paid_amount) || 0),
      paid_note: trimmed(participant?.paid_note) || null,
      request,
      last_sign_in_at: lastSignInByUser.get(user.id) ?? null,
      status,
      reason,
    }
  }

  const people: RosterPerson[] = []
  const seenEmails = new Set<string>()

  // 1. The expected roster. Dedupe on the normalized key so a Studio
  //    double-entry with different casing collapses to one person.
  for (const invite of input.invites) {
    const key = normalizeEmail(invite.email)
    if (key === "" || seenEmails.has(key)) continue
    seenEmails.add(key)

    const email = trimmed(invite.email)
    const invitedName = trimmed(invite.invited_name)
    const user = usersByEmail.get(key)

    if (user) {
      people.push(registered(user, true, invitedName))
      continue
    }

    people.push({
      key: `invite:${key}`,
      user_id: null,
      email,
      name: invitedName || email,
      nickname: null,
      avatar_url: null,
      is_admin: false,
      invited: true,
      onboarded: false,
      phase1_entry_fee: null,
      phase2_entry_fee: null,
      entry_fee: null,
      is_player: null,
      paid_amount: 0,
      paid_note: null,
      request: null,
      last_sign_in_at: null,
      status: "not_registered",
      reason: "no_account",
    })
  }

  // 2. Everyone who signed in but isn't on the roster — an email mismatch or
  //    a stranger. Either way the admin needs to see them.
  for (const user of input.users) {
    const key = normalizeEmail(user.email)
    if (key !== "" && seenEmails.has(key)) continue
    if (key !== "") seenEmails.add(key)
    people.push(registered(user, false, ""))
  }

  // The table then reads top-down as the admin's work queue.
  people.sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (rank !== 0) return rank
    return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
  })

  // Filters over the sorted array, so the strip and the table agree on order.
  const notRegistered = people.filter((p) => p.status === "not_registered")
  const notReady = people.filter((p) => p.status === "not_ready")
  const ready = people.filter((p) => p.status === "ready")

  return {
    people,
    notRegistered,
    notReady,
    ready,
    funnel: {
      noAccount: people.filter((p) => funnelStage(p) === "no_account"),
      notOnboarded: people.filter((p) => funnelStage(p) === "not_onboarded"),
      awaitingApproval: people.filter((p) => funnelStage(p) === "awaiting_approval"),
      approved: people.filter((p) => funnelStage(p) === "approved"),
    },
    counts: {
      total: people.length,
      notRegistered: notRegistered.length,
      notReady: notReady.length,
      ready: ready.length,
      admins: people.filter((p) => p.is_admin).length,
      requested: people.filter((p) => p.request !== null && p.status !== "ready").length,
    },
    hasInvites: input.invites.some((i) => normalizeEmail(i.email) !== ""),
  }
}
