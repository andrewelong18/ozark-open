"use client"

import { useRef, useState } from "react"

import { createClient } from "@/lib/supabase/client"
import { Avatar } from "@/components/avatar"
import { HowItWorks } from "@/components/onboarding/how-it-works"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { DISPLAY_NAME_MAX, NICKNAME_MAX } from "@/lib/profile"

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — plenty for an avatar.

// The required first-run flow (Sprint 16): step 1 sets the member's own
// display name (+ optional nickname/photo) and stamps onboarded_at; step 2 is
// the "how it works" walkthrough. Reuses the /profile avatar-upload path
// (browser → Storage under <uid>/avatar); the API derives the public URL.
export function OnboardingForm({
  userId,
  email,
  minPicks,
  maxPicks,
}: {
  userId: string
  email: string
  minPicks: number
  maxPicks: number
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<"identity" | "walkthrough">("identity")
  const [displayName, setDisplayName] = useState("")
  const [nickname, setNickname] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErrors([])
    const chosen = e.target.files?.[0] ?? null
    if (!chosen) {
      setFile(null)
      setPreview(null)
      return
    }
    if (!ACCEPTED.includes(chosen.type)) {
      setErrors(["Choose a JPG, PNG, WebP, or GIF image."])
      return
    }
    if (chosen.size > MAX_BYTES) {
      setErrors(["That image is over 2 MB — pick a smaller one."])
      return
    }
    setFile(chosen)
    setPreview(URL.createObjectURL(chosen))
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBusy(true)
    setErrors([])

    try {
      if (file) {
        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(`${userId}/avatar`, file, {
            upsert: true,
            contentType: file.type,
          })
        if (uploadError) {
          setErrors([`Uploading your photo failed: ${uploadError.message}`])
          return
        }
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName,
          nickname: nickname.trim() === "" ? null : nickname,
          avatarUpdated: file !== null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setErrors(
          Array.isArray(json?.errors)
            ? json.errors
            : [json?.error ?? `Couldn't save (${res.status}).`]
        )
        return
      }
      setStep("walkthrough")
    } catch {
      setErrors(["Save failed — check your connection and try again."])
    } finally {
      setBusy(false)
    }
  }

  if (step === "walkthrough") {
    return (
      <HowItWorks
        minPicks={minPicks}
        maxPicks={maxPicks}
        doneLabel="Start betting"
        onDone={() => {
          // onboarded_at is already set (step 1 stamped it), so middleware will
          // let us into the app — but only on a *fresh* request. A client
          // router.push() would replay this page's poisoned Router Cache: the
          // nav Links prefetched /dashboard, /bets, /my-bets while onboarded_at
          // was still NULL, so middleware redirected those prefetches back to
          // /onboarding and cached that result. A hard navigation resets the
          // cache and re-runs middleware with the now-onboarded session.
          window.location.assign("/bets")
        }}
      />
    )
  }

  const nameForInitials = displayName.trim() === "" ? email : displayName

  return (
    <Card accent elevated>
      <CardContent className="flex flex-col gap-5">
        <div>
          <div className="font-heading text-2xl text-text-strong">
            Set up your profile
          </div>
          <p className="mt-1 text-sm leading-normal text-text-muted">
            Your name is how everyone sees your bets when they go public. A
            nickname and photo are optional.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar src={preview} name={nameForInitials} size="lg" />
            <div className="flex flex-col gap-2">
              <Label htmlFor="avatar-file">Profile picture (optional)</Label>
              <input
                ref={fileRef}
                id="avatar-file"
                type="file"
                accept={ACCEPTED.join(",")}
                onChange={pickFile}
                className="block w-full max-w-xs cursor-pointer rounded-lg border border-border bg-surface-sunken text-sm text-text-muted file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-primary-foreground"
              />
              <p className="text-xs text-text-muted">
                JPG, PNG, WebP, or GIF · up to 2 MB.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              maxLength={DISPLAY_NAME_MAX}
              placeholder="e.g. Andrew Long"
              autoFocus
              required
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Use your real name — an admin matches it to the field to link your
              bets.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="nickname">Nickname (optional)</Label>
            <Input
              id="nickname"
              value={nickname}
              maxLength={NICKNAME_MAX}
              placeholder="e.g. Slim"
              onChange={(e) => setNickname(e.target.value)}
            />
            <p className="text-xs text-text-muted">
              Shown in quotes next to your name across the app.
            </p>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Continue"}
          </Button>

          {errors.length > 0 && (
            <ul className="flex list-disc flex-col gap-1 rounded-lg border border-loss-border bg-loss-surface py-3 pr-3 pl-8 text-sm text-loss-strong">
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
