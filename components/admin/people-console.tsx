"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EmptyState } from "@/components/modules/empty-state"
import { formatRelativeTime, formatTimestamp } from "@/lib/format"
import { funnelStage, type RosterPerson } from "@/lib/roster"
import type { SkippedLine } from "@/lib/invites"

// The admin people console (Sprint 20) — the client half of /admin/people.
// One worst-first table over lib/roster.ts's derivation, with the lever
// attached to the row that needs it:
//
//   No account                 — nothing to click; the email is there to copy
//   Signed in, not onboarded   — nothing to click either; that absence IS the
//                                information (go text them)
//   Awaiting approval          — Approve (name + entry fee + player flag)
//   Approved                   — Edit (fee / flag), with Revoke inside
//
// Writes go to /api/admin/participants (unchanged since Sprint 16 — same
// POST/PATCH/DELETE contract) and /api/admin/invites; on success we
// router.refresh() so the server re-derives the funnel. No optimistic state,
// no client-side rules — the routes re-validate the fee against the
// tournaments row.
//
// Revoke deliberately does NOT sit inline next to a name: on a glance-and-
// scroll page a mis-tap must not be able to cost someone their access, so it
// only exists inside the row's opened edit panel.

// Mobile keeps the person block + a right-hand stack (status over action);
// sm+ breaks last login, status and action into their own columns via
// `sm:contents` on the stack. Long email addresses make a horizontally
// scrolling table hostile on the phone the admin is holding while texting.
const GRID = "grid grid-cols-[1fr_auto] gap-x-3 px-4 sm:grid-cols-[1fr_112px_120px_92px]"

type InviteResult = {
  added: number
  updated: number
  unchanged: number
  skipped: SkippedLine[]
}

async function callParticipants(
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>
): Promise<string[] | null> {
  const res = await fetch("/api/admin/participants", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (res.ok) return null
  const json = await res.json().catch(() => null)
  return Array.isArray(json?.errors)
    ? json.errors
    : [json?.error ?? `Request failed (${res.status}).`]
}

function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <ul className="flex list-disc flex-col gap-1 rounded-lg border border-loss-border bg-loss-surface py-2 pr-3 pl-7 text-sm text-loss-strong">
      {errors.map((err) => (
        <li key={err}>{err}</li>
      ))}
    </ul>
  )
}

/** The one status badge per person. Admin is a separate badge, not a status. */
function StatusPill({ person }: { person: RosterPerson }) {
  const stage = funnelStage(person)
  if (stage === "approved") return <Badge variant="green">Approved</Badge>
  if (stage === "no_account") return <Badge variant="red">No account</Badge>
  if (stage === "not_onboarded") return <Badge variant="amber">Not onboarded</Badge>
  // Revoked is its own state: the row and the entry fee are still there, the
  // access isn't (#91). fee_unset is a hand-edited participant row with a
  // non-positive fee — still awaiting a valid approval, so it says so plainly.
  if (person.reason === "revoked") return <Badge variant="red">Revoked</Badge>
  return (
    <Badge variant="amber">
      {person.reason === "fee_unset" ? "Fee unset" : "Needs approval"}
    </Badge>
  )
}

function LastLogin({ person }: { person: RosterPerson }) {
  return (
    <time
      dateTime={person.last_sign_in_at ?? undefined}
      title={formatTimestamp(person.last_sign_in_at)}
    >
      {formatRelativeTime(person.last_sign_in_at)}
    </time>
  )
}

/** Entry fee + playing-golfer — the two fields both panels share. */
function ParticipantFields({
  idPrefix,
  entryFee,
  setEntryFee,
  isPlayer,
  setIsPlayer,
  entryFeeMin,
  entryFeeMax,
}: {
  idPrefix: string
  entryFee: string
  setEntryFee: (value: string) => void
  isPlayer: boolean
  setIsPlayer: (value: boolean) => void
  entryFeeMin: number
  entryFeeMax: number
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-fee`}>
          Entry fee (${entryFeeMin}–${entryFeeMax})
        </Label>
        <Input
          id={`${idPrefix}-fee`}
          type="number"
          inputMode="numeric"
          min={entryFeeMin}
          max={entryFeeMax}
          value={entryFee}
          onChange={(e) => setEntryFee(e.target.value)}
          className="w-28"
        />
      </div>
      <label className="flex h-11 items-center gap-2 text-sm text-text-strong">
        <input
          type="checkbox"
          checked={isPlayer}
          onChange={(e) => setIsPlayer(e.target.checked)}
          className="size-4"
        />
        Playing golfer
      </label>
    </div>
  )
}

/** Awaiting approval → create the participant row that grants betting access. */
function ApprovePanel({
  person,
  entryFeeMin,
  entryFeeMax,
  onClose,
}: {
  person: RosterPerson
  entryFeeMin: number
  entryFeeMax: number
  onClose: () => void
}) {
  const router = useRouter()
  // Members arrive with display_name = what they typed at onboarding; the
  // admin confirms/corrects it here so it matches the field (and so the bet
  // importer's name matching lands).
  const [name, setName] = useState(person.name)
  // Re-approving someone who was revoked pre-fills their preserved entry fee
  // and player flag, so the round trip restores them exactly (#91).
  const [entryFee, setEntryFee] = useState(String(person.entry_fee ?? entryFeeMin))
  const [isPlayer, setIsPlayer] = useState(person.is_player ?? true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function approve() {
    setBusy(true)
    setErrors([])
    const errs = await callParticipants("POST", {
      userId: person.user_id,
      displayName: name,
      entryFee: Number(entryFee),
      isPlayer,
    })
    setBusy(false)
    if (errs) {
      setErrors(errs)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface-sunken px-4 py-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`approve-${person.key}-name`}>
          Display name (matches the field)
        </Label>
        <Input
          id={`approve-${person.key}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <ParticipantFields
        idPrefix={`approve-${person.key}`}
        entryFee={entryFee}
        setEntryFee={setEntryFee}
        isPlayer={isPlayer}
        setIsPlayer={setIsPlayer}
        entryFeeMin={entryFeeMin}
        entryFeeMax={entryFeeMax}
      />

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={approve} disabled={busy}>
          {busy ? "Approving…" : "Approve to bet"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>

      <ErrorList errors={errors} />
    </div>
  )
}

/** Approved → edit the fee / player flag, or revoke access entirely. */
function EditPanel({
  person,
  entryFeeMin,
  entryFeeMax,
  onClose,
}: {
  person: RosterPerson
  entryFeeMin: number
  entryFeeMax: number
  onClose: () => void
}) {
  const router = useRouter()
  // Display name is admin-owned after onboarding (A12) and load-bearing: the
  // importer matches picks to people by it, so a typo silently disables that
  // person's self-bet cap, self-pick flag and opponent block (#99). Until
  // Sprint 23 the only way to fix one was a Studio edit.
  const [name, setName] = useState(person.name)
  const [entryFee, setEntryFee] = useState(String(person.entry_fee ?? entryFeeMin))
  const [isPlayer, setIsPlayer] = useState(person.is_player !== false)
  const [busy, setBusy] = useState(false)
  const [confirmingRevoke, setConfirmingRevoke] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const dirty =
    name.trim() !== person.name ||
    Number(entryFee) !== person.entry_fee ||
    isPlayer !== (person.is_player !== false)

  async function save() {
    setBusy(true)
    setErrors([])
    const errs = await callParticipants("PATCH", {
      userId: person.user_id,
      displayName: name,
      entryFee: Number(entryFee),
      isPlayer,
    })
    setBusy(false)
    if (errs) {
      setErrors(errs)
      return
    }
    onClose()
    router.refresh()
  }

  async function revoke() {
    setBusy(true)
    setErrors([])
    const errs = await callParticipants("DELETE", { userId: person.user_id })
    setBusy(false)
    if (errs) {
      setErrors(errs)
      return
    }
    onClose()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-surface-sunken px-4 py-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-${person.key}-name`}>
          Display name (matches the field)
        </Label>
        <Input
          id={`edit-${person.key}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-xs text-text-muted">
          The importer links picks to people by this name — correcting it here
          makes the next upload match.
        </p>
      </div>

      <ParticipantFields
        idPrefix={`edit-${person.key}`}
        entryFee={entryFee}
        setEntryFee={setEntryFee}
        isPlayer={isPlayer}
        setIsPlayer={setIsPlayer}
        entryFeeMin={entryFeeMin}
        entryFeeMax={entryFeeMax}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={busy || !dirty}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={busy}>
          Close
        </Button>
        {/* The on-behalf menu (#101) — for the members who never get through
            the magic-link flow. It's the real bet menu with their budget and
            their limits, not a stripped-down form. */}
        <Button
          size="sm"
          variant="secondary"
          render={<Link href={`/bets?for=${person.user_id}`} />}
        >
          Place bets for them
        </Button>
      </div>

      {/* Revoke lives down here, behind its own confirm. It stamps revoked_at
          on the participant row rather than deleting it (Sprint 21 / #91): the
          entry fee is a pool input, so deleting the row moved money. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {confirmingRevoke ? (
          <>
            <span className="text-sm text-text-body">
              Revoke {person.name}&apos;s access? They drop out of the pool —
              their ${person.entry_fee ?? 0} entry and their wagers both stop
              counting. Nothing is deleted: re-approving brings all of it back.
            </span>
            <Button size="sm" variant="destructive" onClick={revoke} disabled={busy}>
              {busy ? "Revoking…" : "Yes, revoke"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingRevoke(false)}
              disabled={busy}
            >
              Keep access
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirmingRevoke(true)}
            disabled={busy}
          >
            Revoke access
          </Button>
        )}
      </div>

      <ErrorList errors={errors} />
    </div>
  )
}

/** Paste-a-list bulk invite entry (#82) — what makes the funnel start at step one. */
function InviteBox() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<InviteResult | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  async function submit() {
    setBusy(true)
    setErrors([])
    setResult(null)
    const res = await fetch("/api/admin/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
    const json = await res.json().catch(() => null)
    setBusy(false)
    if (!res.ok) {
      setErrors([json?.error ?? `Request failed (${res.status}).`])
      return
    }
    setResult(json as InviteResult)
    setText("")
    router.refresh()
  }

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-text-strong">
            Add people to the invite list
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Paste one <code>name, email</code> per line. Re-pasting is safe.
          </span>
        </span>
        <span aria-hidden className="text-text-muted">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={"Pat Jones, pat@example.com\njake@example.com"}
            className="w-full rounded-lg border border-input bg-transparent p-3 font-mono text-sm text-text-body outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={submit}
              disabled={busy || text.trim() === ""}
            >
              {busy ? "Adding…" : "Add to invite list"}
            </Button>
            <span className="text-xs text-text-muted">
              Invites never touch pool math — they only say who we expect.
            </span>
          </div>

          {result && (
            <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-text-body">
              <span>
                {result.added} added · {result.updated} name
                {result.updated === 1 ? "" : "s"} updated · {result.unchanged}{" "}
                already there
              </span>
              {result.skipped.length > 0 && (
                <span className="text-caution-strong">
                  Skipped {result.skipped.length}: {" "}
                  {result.skipped
                    .map((s) => `line ${s.line} (“${s.text}”)`)
                    .join(", ")}
                </span>
              )}
            </div>
          )}

          <ErrorList errors={errors} />
        </div>
      )}
    </Card>
  )
}

/**
 * Add a member who can't work the magic link (#124 — half 1 of #101).
 *
 * Pat's ask from the Jul 31 dry run. The wager half already shipped
 * (`/bets?for=<userId>`), so once this creates the account he can bet for them
 * immediately — which is the whole point on a Thursday morning when three of
 * ~32 people can't get through their email.
 *
 * TWO requests, one button. Creating the account and approving it are separate
 * endpoints on purpose: /api/admin/participants owns the entry fee and creates
 * the row whose existence IS betting eligibility (PRD §12 A12/A13). If the
 * approve leg fails, the account still exists and the person drops into the
 * table as "Needs approval" — a normal, visible, recoverable state — so the
 * message says that rather than implying nothing happened.
 */
function AddMemberBox({
  entryFeeMin,
  entryFeeMax,
}: {
  entryFeeMin: number
  entryFeeMax: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [entryFee, setEntryFee] = useState(String(entryFeeMin))
  const [isPlayer, setIsPlayer] = useState(true)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])

  async function submit() {
    setBusy(true)
    setErrors([])
    setDone(null)

    const res = await fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, displayName: name }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) {
      setBusy(false)
      setErrors(
        Array.isArray(json?.errors)
          ? json.errors
          : [json?.error ?? `Request failed (${res.status}).`]
      )
      // A 409 means they already exist and a 500 may mean the account was
      // created — either way the table is now stale, so refresh it.
      router.refresh()
      return
    }

    const approveErrors = await callParticipants("POST", {
      userId: json.userId,
      displayName: name,
      entryFee: Number(entryFee),
      isPlayer,
    })
    setBusy(false)
    router.refresh()

    if (approveErrors) {
      setErrors([
        `${name}'s account was created, but approving them failed — they're in the list below as "Needs approval". Approve them there.`,
        ...approveErrors,
      ])
      return
    }

    setDone(`${name} is added and approved — you can place wagers for them now.`)
    setEmail("")
    setName("")
    setEntryFee(String(entryFeeMin))
    setIsPlayer(true)
  }

  return (
    <Card className="gap-0 p-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-text-strong">
            Add a member who can&rsquo;t use the magic link
          </span>
          <span className="mt-0.5 block text-xs text-text-muted">
            Creates their account outright — no email is sent, nothing for them
            to click.
          </span>
        </span>
        <span aria-hidden className="text-text-muted">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-member-email">Email</Label>
            <Input
              id="add-member-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="dan@example.com"
            />
            {/* The typo warning is the point of this line. The address becomes a
                real, confirmed login — so a wrong one is an account somebody
                else could sign in to, and it's also how this member claims the
                account later. */}
            <span className="text-xs text-text-muted">
              Check this carefully. It becomes a real login, and it&rsquo;s how
              they sign in themselves later if they ever get the email working.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="add-member-name">Display name (matches the field)</Label>
            <Input
              id="add-member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dan Smith"
            />
            <span className="text-xs text-text-muted">
              Must match the name on the bet sheet, or their picks won&rsquo;t
              link and their self-bet and opponent rules stop applying.
            </span>
          </div>

          <ParticipantFields
            idPrefix="add-member"
            entryFee={entryFee}
            setEntryFee={setEntryFee}
            isPlayer={isPlayer}
            setIsPlayer={setIsPlayer}
            entryFeeMin={entryFeeMin}
            entryFeeMax={entryFeeMax}
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={submit}
              disabled={busy || email.trim() === "" || name.trim() === ""}
            >
              {busy ? "Adding…" : "Add and approve"}
            </Button>
            <span className="text-xs text-text-muted">
              Their entry fee counts in the pool from the moment they&rsquo;re
              approved.
            </span>
          </div>

          {done && (
            <div className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-sm text-text-body">
              {done}
            </div>
          )}

          <ErrorList errors={errors} />
        </div>
      )}
    </Card>
  )
}

export function PeopleConsole({
  people,
  hasInvites,
  entryFeeMin,
  entryFeeMax,
}: {
  people: RosterPerson[]
  hasInvites: boolean
  entryFeeMin: number
  entryFeeMax: number
}) {
  // One panel at a time — a table you scroll should stay scannable.
  const [openKey, setOpenKey] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-4">
      <InviteBox />
      <AddMemberBox entryFeeMin={entryFeeMin} entryFeeMax={entryFeeMax} />

      {people.length === 0 ? (
        <EmptyState
          title="Nobody yet"
          message="Paste the people you expect into the invite list above — anyone who logs in shows up here automatically."
        />
      ) : (
      <Card className="gap-0 p-0">
        <div
          className={`${GRID} border-b border-border py-2.5 text-[10px] font-bold tracking-wider uppercase text-text-muted`}
        >
          <span>Member</span>
          <span className="hidden sm:block">Last login</span>
          <div className="flex items-center justify-end gap-2 sm:contents">
            <span>Status</span>
            <span className="hidden sm:block" aria-hidden />
          </div>
        </div>

        {people.map((person) => {
          const stage = funnelStage(person)
          // A fee_unset row counts as awaiting approval but already HAS a live
          // participant row, so its lever is Edit — the fee just needs
          // correcting. A revoked row keeps Approve: that's the way back in.
          const action =
            stage === "approved" || person.reason === "fee_unset"
              ? "edit"
              : stage === "awaiting_approval" && person.user_id
                ? "approve"
                : null
          const open = openKey === person.key
          const close = () => setOpenKey(null)

          return (
            <div
              key={person.key}
              // The funnel is a CSS grid, not a <table>, so a row has no role to
              // address it by. person.key is the user id (or `invite:<email>`),
              // which is what the E2E approval journey targets — and asserting
              // the panel that opens is id'd with the SAME key is how that spec
              // proves the console opened the right person's lever.
              data-testid={`person-${person.key}`}
              className="border-t border-border first:border-t-0"
            >
              <div className={`${GRID} items-center py-3`}>
                <div className="flex min-w-0 items-center gap-2.5">
                  {person.user_id ? (
                    <Avatar src={person.avatar_url} name={person.name} size="sm" />
                  ) : (
                    // No person behind this row yet — initials from an email
                    // address would read as noise.
                    <span
                      aria-hidden
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-xs text-text-muted"
                    >
                      ✉
                    </span>
                  )}
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <UserName
                        displayName={person.name}
                        nickname={person.nickname}
                        className="truncate text-[15px] font-semibold text-text-strong"
                      />
                      {person.is_admin && <Badge variant="gold">Admin</Badge>}
                    </div>
                    {/* Selectable plain text — for the "no account" rows this
                        IS the action: copy it into the group text. */}
                    <div className="truncate text-xs text-text-muted">
                      {person.email}
                      {hasInvites && !person.invited && (
                        <span className="ml-1.5">· not on the invite list</span>
                      )}
                    </div>
                    <div className="text-xs text-text-muted sm:hidden">
                      <LastLogin person={person} />
                    </div>
                  </div>
                </div>

                <span className="hidden text-xs text-text-muted sm:block">
                  <LastLogin person={person} />
                </span>

                <div className="flex flex-col items-end gap-1.5 sm:contents">
                  <StatusPill person={person} />
                  <span className="sm:justify-self-end">
                    {action === "approve" && (
                      <Button
                        size="sm"
                        variant={open ? "ghost" : "secondary"}
                        onClick={() => setOpenKey(open ? null : person.key)}
                      >
                        {open ? "Cancel" : "Approve"}
                      </Button>
                    )}
                    {action === "edit" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setOpenKey(open ? null : person.key)}
                      >
                        {open ? "Close" : "Edit"}
                      </Button>
                    )}
                  </span>
                </div>
              </div>

              {open && action === "approve" && (
                <ApprovePanel
                  person={person}
                  entryFeeMin={entryFeeMin}
                  entryFeeMax={entryFeeMax}
                  onClose={close}
                />
              )}
              {open && action === "edit" && (
                <EditPanel
                  person={person}
                  entryFeeMin={entryFeeMin}
                  entryFeeMax={entryFeeMax}
                  onClose={close}
                />
              )}
            </div>
          )
        })}
      </Card>
      )}
    </div>
  )
}
