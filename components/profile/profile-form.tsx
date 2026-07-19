"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { Avatar } from "@/components/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NICKNAME_MAX } from "@/lib/profile"

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/gif"]
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB — plenty for an avatar.

export function ProfileForm({
  userId,
  displayName,
  initialNickname,
  initialAvatarUrl,
}: {
  userId: string
  displayName: string
  initialNickname: string | null
  initialAvatarUrl: string | null
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [nickname, setNickname] = useState(initialNickname ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [saved, setSaved] = useState(false)

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    setErrors([])
    setSaved(false)
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
    setSaved(false)

    try {
      // Upload the file straight to Storage under our own folder first; the
      // bucket's RLS enforces the <uid>/ prefix.
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

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: nickname.trim() === "" ? null : nickname,
          avatarUpdated: file !== null,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setErrors(
          Array.isArray(json?.errors)
            ? json.errors
            : [json?.error ?? `Save failed (${res.status}).`]
        )
        return
      }

      setFile(null)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ""
      setSaved(true)
      router.refresh()
    } catch {
      setErrors(["Save failed — check your connection and try again."])
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <Avatar
              src={preview ?? initialAvatarUrl}
              name={displayName}
              size="lg"
            />
            <div className="flex flex-col gap-2">
              <Label htmlFor="avatar-file">Profile picture</Label>
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
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              value={nickname}
              maxLength={NICKNAME_MAX}
              placeholder="e.g. Slim"
              onChange={(e) => {
                setNickname(e.target.value)
                setSaved(false)
              }}
            />
            <p className="text-xs text-text-muted">
              Shown next to your name across the app. Leave blank to remove it.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </Button>
            {saved && (
              <span className="text-sm font-medium text-win-strong">Saved ✓</span>
            )}
          </div>

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
