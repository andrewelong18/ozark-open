// Unit tests for lib/roster-page.ts — who /roster shows, and in what order.
// Zero-dependency by design: node:test via npm run test.

import test from "node:test"
import assert from "node:assert/strict"
import {
  buildFieldRoster,
  isFieldParticipant,
  type RosterParticipantRow,
} from "./roster-page.ts"

const live: RosterParticipantRow = { user_id: "u1", entry_fee: 20, is_player: true }

// ---------------------------------------------------------------------------
// isFieldParticipant
// ---------------------------------------------------------------------------

test("isFieldParticipant: an approved player is in the field", () => {
  assert.equal(isFieldParticipant(live), true)
})

test("isFieldParticipant: a string entry_fee is coerced, not trusted", () => {
  assert.equal(isFieldParticipant({ ...live, entry_fee: "30" }), true)
  assert.equal(isFieldParticipant({ ...live, entry_fee: "nope" }), false)
})

test("isFieldParticipant: no fee means not approved yet", () => {
  assert.equal(isFieldParticipant({ ...live, entry_fee: 0 }), false)
  assert.equal(isFieldParticipant({ ...live, entry_fee: null }), false)
})

test("isFieldParticipant: a revoked row is out, fee or not", () => {
  // The row survives a revoke because it carries the entry fee (#91), so
  // row-existence alone is never the gate.
  assert.equal(
    isFieldParticipant({ ...live, revoked_at: "2026-09-01T00:00:00Z" }),
    false
  )
})

test("isFieldParticipant: a bettor who isn't golfing isn't on the roster", () => {
  assert.equal(isFieldParticipant({ ...live, is_player: false }), false)
  // Absent means the schema default (true) applied.
  assert.equal(isFieldParticipant({ user_id: "u1", entry_fee: 20 }), true)
})

// ---------------------------------------------------------------------------
// buildFieldRoster
// ---------------------------------------------------------------------------

test("buildFieldRoster sorts by name, case-insensitively", () => {
  const roster = buildFieldRoster({
    users: [
      { id: "a", display_name: "Pat Leicht" },
      { id: "b", display_name: "alex leslie" },
      { id: "c", display_name: "Ethan Kipping" },
    ],
    participants: [
      { user_id: "a", entry_fee: 30, is_player: true },
      { user_id: "b", entry_fee: 20, is_player: true },
      { user_id: "c", entry_fee: 20, is_player: true },
    ],
  })
  assert.deepEqual(
    roster.map((p) => p.name),
    ["alex leslie", "Ethan Kipping", "Pat Leicht"]
  )
})

test("buildFieldRoster carries only what the card renders", () => {
  const [player] = buildFieldRoster({
    users: [
      {
        id: "a",
        display_name: "Ethan Kipping",
        nickname: "  Cheeks McGee  ",
        avatar_url: "https://x/y.jpg",
      },
    ],
    participants: [{ user_id: "a", entry_fee: 20, is_player: true }],
  })
  assert.deepEqual(player, {
    user_id: "a",
    name: "Ethan Kipping",
    nickname: "Cheeks McGee",
    avatar_url: "https://x/y.jpg",
  })
})

test("buildFieldRoster blanks become null, not empty strings", () => {
  const [player] = buildFieldRoster({
    users: [{ id: "a", display_name: "Pat Leicht", nickname: "   ", avatar_url: "" }],
    participants: [{ user_id: "a", entry_fee: 20 }],
  })
  assert.equal(player.nickname, null)
  assert.equal(player.avatar_url, null)
})

test("buildFieldRoster drops everyone the gate excludes", () => {
  const roster = buildFieldRoster({
    users: [
      { id: "a", display_name: "Approved" },
      { id: "b", display_name: "Unapproved" },
      { id: "c", display_name: "Revoked" },
      { id: "d", display_name: "Bettor only" },
      { id: "e", display_name: "Never signed up" },
    ],
    participants: [
      { user_id: "a", entry_fee: 20, is_player: true },
      { user_id: "b", entry_fee: 0, is_player: true },
      { user_id: "c", entry_fee: 20, is_player: true, revoked_at: "2026-09-01" },
      { user_id: "d", entry_fee: 20, is_player: false },
    ],
  })
  assert.deepEqual(
    roster.map((p) => p.name),
    ["Approved"]
  )
})

test("buildFieldRoster drops a participant with no users row", () => {
  const roster = buildFieldRoster({
    users: [],
    participants: [{ user_id: "ghost", entry_fee: 20, is_player: true }],
  })
  assert.deepEqual(roster, [])
})

test("buildFieldRoster renders each player once", () => {
  const roster = buildFieldRoster({
    users: [{ id: "a", display_name: "Pat Leicht" }],
    participants: [
      { user_id: "a", entry_fee: 20, is_player: true },
      { user_id: "a", entry_fee: 20, is_player: true },
    ],
  })
  assert.equal(roster.length, 1)
})

test("buildFieldRoster names a member with no display_name", () => {
  const [player] = buildFieldRoster({
    users: [{ id: "a", display_name: "  " }],
    participants: [{ user_id: "a", entry_fee: 20 }],
  })
  assert.equal(player.name, "Unknown member")
})
