// The member-facing roster (Sprint 26): the pure half of /roster — deciding
// who is in the field and in what order.
//
// Not to be confused with lib/roster.ts, which builds the ADMIN people
// console. That one shows everyone in the funnel, including people who
// haven't signed in yet, because chasing them is its whole job. This one
// shows the field: who is actually playing the Ozark Open.
//
// ---------------------------------------------------------------------------
// REWRITTEN Sept 20, 2026. The roster is now driven by ACCOUNTS, not entries.
// ---------------------------------------------------------------------------
//
// It used to require a live participant row carrying an entry in some phase —
// the app's betting gate (PRD §12 A11, ADR 0002). That tied the page to the
// wrong question. "Is this person in the field" and "has an admin approved
// their money for phase 1" are different facts that happen to correlate late
// in the funnel, and the gap between them is the whole pre-tournament week:
// people register days before anyone approves an entry, and the roster was
// blank for all of it.
//
// It bit for real. The Sept 20 reset cleared every phase entry to put
// production back to pre-Phase-1 (the entries are re-requested through /entry),
// and /roster went to zero players — seven registered members, a full field on
// the way, and a page reading "Nobody's been approved for this year's field
// yet." Nothing was broken; the gate was just answering a question nobody
// asked.
//
// So: a member is in the field when they have an account with a name AND a
// profile. Two conditions, and each is load-bearing:
//
//   a display_name — set at onboarding, so this is "finished signing up"
//   rather than "clicked a magic link". A nameless row has nothing to put on
//   a card; it used to render as "Unknown member", which is a data fault
//   dressed as a person.
//
//   a profile — any of the six columns public.player_profile_seed writes
//   (20260909000000). The seed is keyed by lower(trim(display_name)) and
//   covers all 27 of this year's players, applied by a BEFORE INSERT OR
//   UPDATE OF display_name trigger. So a profile is exactly the signal "this
//   account matched somebody we know is playing", and it arrives in the same
//   statement that sets the name — a new registrant is on the roster the
//   moment they finish onboarding, with no admin step at all.
//
//   That also makes the failure mode self-correcting rather than mysterious:
//   someone who onboards as "Mike Yenzer Jr" matches no seed row, gets no
//   profile, and stays off the roster. Fix the display name on /admin/people
//   (#99) and the trigger fires on the UPDATE, the profile lands, and they
//   appear. A blank card would have hidden that; an absent one sends you to
//   the page that fixes it.
//
// PARTICIPANT ROWS ARE NOW A VETO, NEVER A REQUIREMENT. Two admin statements
// still remove someone from the field, because both say something the account
// alone cannot:
//
//   is_player = false — a member approved to BET isn't necessarily swinging a
//   club, and a page called Roster that lists them is lying about the field.
//   This was in the original gate and is kept verbatim.
//
//   revoked_at — an admin explicitly took them out of the pool (#91). Putting
//   them back on the member-facing roster would quietly undo that.
//
// Neither applies when there is no participant row, which is the ordinary
// state of a freshly registered member and the entire point of the rewrite.
//
// Pure module by design — no Supabase, no "@/" alias imports — so the
// node:test suite exercises the exact code the page runs.

/** A users row, as /roster selects it. The profile columns are read only to
 *  answer "is there a profile at all" — the modal fetches the real thing on
 *  open, and nothing here renders them. */
export type RosterUserRow = {
  id: string
  display_name?: string | null
  nickname?: string | null
  avatar_url?: string | null
  hometown?: string | null
  member_since?: number | string | null
  bio?: string | null
  strength?: string | null
  weakness?: string | null
  past_performance?: unknown
}

/** A tournament_participants row. Only the two veto columns are read now;
 *  the entries are deliberately no longer consulted. */
export type RosterParticipantRow = {
  user_id: string
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

/**
 * Does this account carry a player profile?
 *
 * Any one of the six seeded columns is enough. They are written together by
 * public.apply_player_profile_seed(), so in practice a seeded row has all of
 * them — but `past_performance` is NULL for the six 2026 debutants (Dale
 * Price, Derek Mercer, Don Harris, Justin Hendrix, Matt Jackson, TJ Johnson),
 * who have no finishes yet. Requiring every column would have quietly kept
 * every first-year player off the roster, so this is deliberately ANY, not
 * ALL.
 *
 * `member_since` is coerced rather than trusted: PostgREST can hand a smallint
 * back as a string, and "" must not read as a profile.
 */
export function hasPlayerProfile(user: RosterUserRow): boolean {
  if (trimmed(user.hometown) !== "") return true
  if (trimmed(user.bio) !== "") return true
  if (trimmed(user.strength) !== "") return true
  if (trimmed(user.weakness) !== "") return true

  const since = user.member_since
  if (since !== null && since !== undefined && since !== "") {
    if (Number.isFinite(Number(since))) return true
  }

  // A non-empty array. The column is jsonb, so an empty array and an empty
  // object both mean "nothing recorded" and neither is a profile.
  const places = user.past_performance
  if (Array.isArray(places) && places.length > 0) return true

  return false
}

/** Has this member finished onboarding — i.e. is there a name for the card? */
export function hasFinishedOnboarding(user: RosterUserRow): boolean {
  return trimmed(user.display_name) !== ""
}

/**
 * Registered, named, carrying a profile — and not vetoed by an admin.
 *
 * `participant` is the member's tournament_participants row when one exists.
 * Its absence is not a reason to exclude anybody; that is the whole change.
 */
export function isFieldMember(
  user: RosterUserRow,
  participant?: RosterParticipantRow
): boolean {
  if (!hasFinishedOnboarding(user)) return false
  if (!hasPlayerProfile(user)) return false
  if (participant) {
    if (participant.is_player === false) return false
    if (trimmed(participant.revoked_at) !== "") return false
  }
  return true
}

/**
 * The field, sorted by name.
 *
 * Iterates USERS now rather than participants, which is what lets a member
 * with no participant row appear. A duplicate users row cannot happen (id is
 * the primary key), but the guard is kept so a caller passing a concatenated
 * list can't double a card.
 */
export function buildFieldRoster(input: {
  users: RosterUserRow[]
  participants: RosterParticipantRow[]
}): RosterPlayer[] {
  // First row wins on a duplicate, matching lib/activity.ts's memberIndex:
  // two participant rows for one member in one tournament is impossible
  // (UNIQUE (user_id, tournament_id)) and picking one beats throwing.
  const participantByUser = new Map<string, RosterParticipantRow>()
  for (const p of input.participants) {
    if (!p.user_id || participantByUser.has(p.user_id)) continue
    participantByUser.set(p.user_id, p)
  }

  const players: RosterPlayer[] = []
  const seen = new Set<string>()
  for (const user of input.users) {
    if (!user.id || seen.has(user.id)) continue
    if (!isFieldMember(user, participantByUser.get(user.id))) continue
    seen.add(user.id)
    players.push({
      user_id: user.id,
      name: trimmed(user.display_name),
      nickname: trimmed(user.nickname) || null,
      avatar_url: trimmed(user.avatar_url) || null,
    })
  }

  return players.sort((a, b) =>
    a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
  )
}
