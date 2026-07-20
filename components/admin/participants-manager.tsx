"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { Avatar } from "@/components/avatar"
import { UserName } from "@/components/user-name"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// Admin approval UI (Sprint 16). Two lists: registrants awaiting approval and
// current participants. All writes go through /api/admin/participants; after a
// success we router.refresh() so the server-rendered lists re-split. Kept
// deliberately simple — no optimistic state, no client-side rules (the route
// re-validates the entry fee against the tournaments row).

type PendingUser = {
  id: string
  display_name: string
  nickname: string | null
  avatar_url: string | null
  email: string
}

type ApprovedParticipant = PendingUser & {
  entry_fee: number
  is_player: boolean
}

async function callApi(
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

function PendingRow({
  user,
  entryFeeMin,
  entryFeeMax,
}: {
  user: PendingUser
  entryFeeMin: number
  entryFeeMax: number
}) {
  const router = useRouter()
  // Brand-new members arrive with display_name = the name they typed at
  // onboarding; the admin confirms/corrects it here to match the field.
  const [name, setName] = useState(user.display_name)
  const [entryFee, setEntryFee] = useState(String(entryFeeMin))
  const [isPlayer, setIsPlayer] = useState(true)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  async function approve() {
    setBusy(true)
    setErrors([])
    const errs = await callApi("POST", {
      userId: user.id,
      displayName: name,
      entryFee: Number(entryFee),
      isPlayer,
    })
    setBusy(false)
    if (errs) {
      setErrors(errs)
      return
    }
    router.refresh()
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar src={user.avatar_url} name={user.display_name} size="md" />
          <div className="min-w-0">
            <div className="truncate font-semibold text-text-strong">
              <UserName displayName={user.display_name} nickname={user.nickname} />
            </div>
            <div className="truncate text-xs text-text-muted">{user.email}</div>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`name-${user.id}`}>Display name (matches the field)</Label>
          <Input
            id={`name-${user.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`fee-${user.id}`}>
              Entry fee (${entryFeeMin}–${entryFeeMax})
            </Label>
            <Input
              id={`fee-${user.id}`}
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
          <Button size="sm" onClick={approve} disabled={busy} className="ml-auto">
            {busy ? "Approving…" : "Approve to bet"}
          </Button>
        </div>

        <ErrorList errors={errors} />
      </CardContent>
    </Card>
  )
}

function ApprovedRow({
  user,
  entryFeeMin,
  entryFeeMax,
}: {
  user: ApprovedParticipant
  entryFeeMin: number
  entryFeeMax: number
}) {
  const router = useRouter()
  const [entryFee, setEntryFee] = useState(String(user.entry_fee))
  const [isPlayer, setIsPlayer] = useState(user.is_player)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const dirty =
    Number(entryFee) !== user.entry_fee || isPlayer !== user.is_player

  async function save() {
    setBusy(true)
    setErrors([])
    const errs = await callApi("PATCH", {
      userId: user.id,
      entryFee: Number(entryFee),
      isPlayer,
    })
    setBusy(false)
    if (errs) {
      setErrors(errs)
      return
    }
    router.refresh()
  }

  async function revoke() {
    setBusy(true)
    setErrors([])
    const errs = await callApi("DELETE", { userId: user.id })
    setBusy(false)
    if (errs) {
      setErrors(errs)
      return
    }
    router.refresh()
  }

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <Avatar src={user.avatar_url} name={user.display_name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-text-strong">
              <UserName displayName={user.display_name} nickname={user.nickname} />
            </div>
            <div className="truncate text-xs text-text-muted">{user.email}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`afee-${user.id}`}>
              Entry fee (${entryFeeMin}–${entryFeeMax})
            </Label>
            <Input
              id={`afee-${user.id}`}
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
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={save}
              disabled={busy || !dirty}
            >
              Save
            </Button>
            <Button size="sm" variant="destructive" onClick={revoke} disabled={busy}>
              Revoke
            </Button>
          </div>
        </div>

        <ErrorList errors={errors} />
      </CardContent>
    </Card>
  )
}

export function ParticipantsManager({
  entryFeeMin,
  entryFeeMax,
  pending,
  approved,
}: {
  entryFeeMin: number
  entryFeeMax: number
  pending: PendingUser[]
  approved: ApprovedParticipant[]
}) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-text-strong">
          Awaiting approval{pending.length > 0 ? ` (${pending.length})` : ""}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-text-muted">
            No one's waiting — every registered member is in the pool.
          </p>
        ) : (
          pending.map((u) => (
            <PendingRow
              key={u.id}
              user={u}
              entryFeeMin={entryFeeMin}
              entryFeeMax={entryFeeMax}
            />
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg text-text-strong">
          In the pool{approved.length > 0 ? ` (${approved.length})` : ""}
        </h2>
        {approved.length === 0 ? (
          <p className="text-sm text-text-muted">No participants yet.</p>
        ) : (
          approved.map((u) => (
            <ApprovedRow
              key={u.id}
              user={u}
              entryFeeMin={entryFeeMin}
              entryFeeMax={entryFeeMax}
            />
          ))
        )}
      </section>
    </div>
  )
}
