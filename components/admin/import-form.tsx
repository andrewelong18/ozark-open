"use client"

import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export function ImportForm() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = inputRef.current?.files?.[0]
    if (!file) return

    setBusy(true)
    setError(null)
    setMessage(null)

    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/admin/import", { method: "POST", body })
      const json = await res.json().catch(() => null)

      if (!res.ok) {
        setError(json?.error ?? `Upload failed (${res.status})`)
        return
      }
      setMessage(json?.message ?? "Upload received.")
    } catch {
      setError("Upload failed — check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-3.5">
          <label
            htmlFor="import-file"
            className="text-sm font-semibold text-text-strong"
          >
            Bets spreadsheet
          </label>
          <input
            ref={inputRef}
            id="import-file"
            name="file"
            type="file"
            accept=".xlsx,.csv"
            required
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null)
              setError(null)
              setMessage(null)
            }}
            className="block w-full cursor-pointer rounded-lg border border-border bg-surface-sunken text-sm text-text-muted file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-primary file:px-4 file:font-semibold file:text-primary-foreground"
          />
          <Button type="submit" disabled={busy || !fileName}>
            {busy ? "Importing…" : "Import"}
          </Button>
          {error && (
            <p className="text-sm font-medium text-loss-strong">{error}</p>
          )}
          {message && (
            <p className="text-sm font-medium text-text-strong">{message}</p>
          )}
        </form>
      </CardContent>
    </Card>
  )
}
