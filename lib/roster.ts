// Admin roster (Sprint 10): the pure half of /admin/people — merging the
// expected roster (tournament_invites), everyone who has actually signed in
// (users), who's approved to bet (tournament_participants) and when each
// last logged in (admin_auth_activity) into one row per person, each with a
// single derived status.
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
  | "fee_unset" // participant row with a non-positive fee (hand-edited)
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

/** PostgREST may hand ints back as strings — entry_fee is coerced, not trusted. */
export type ParticipantQueryRow = {
  user_id: string
  entry_fee?: number | string | null
  is_player?: boolean | null
}

export type AuthActivityQueryRow = {
  user_id: string
  last_sign_in_at?: string | null
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
  entry_fee: number | null
  /** null when there's no participant row; the edit form pre-fills from it. */
  is_player: boolean | null
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
 * participant row already exists — a hand-edit anomaly that should approximately
 * never fire, surfaced honestly rather than hidden.
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

const STATUS_RANK: Record<RosterStatus, number> = {
  not_registered: 0,
  not_ready: 1,
  ready: 2,
}

/** Merge the four reads into one row per person with a derived status. */
export function buildRoster(input: {
  invites: InviteQueryRow[]
  users: UserQueryRow[]
  participants: ParticipantQueryRow[]
  authActivity: AuthActivityQueryRow[]
}): Roster {
  const usersByEmail = new Map<string, UserQueryRow>()
  for (const u of input.users) {
    const key = normalizeEmail(u.email)
    if (key !== "") usersByEmail.set(key, u)
  }

  const participantByUser = new Map<string, ParticipantQueryRow>()
  for (const p of input.participants) participantByUser.set(p.user_id, p)

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
    const fee = Number(participant?.entry_fee)
    const hasFee = participant !== undefined && Number.isFinite(fee) && fee > 0

    let status: RosterStatus
    let reason: RosterReason
    if (hasFee) {
      // A participant row is the betting gate (PRD §12 A11) — a member the
      // admin approved is ready even if they never finished onboarding. This
      // page must not disagree with what the app actually allows.
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
      entry_fee: hasFee ? fee : null,
      // Undefined on the row means the schema default (true) applied.
      is_player: participant === undefined ? null : participant.is_player !== false,
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
      entry_fee: null,
      is_player: null,
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
    },
    hasInvites: input.invites.some((i) => normalizeEmail(i.email) !== ""),
  }
}
