import Image from "next/image"

import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { signIn } from "./actions"

type Props = {
  searchParams: Promise<{ sent?: string; error?: string }>
}

function Brand() {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <Image
        src="/ozark-mark.svg"
        alt=""
        width={108}
        height={108}
        className="h-24 w-auto"
        priority
      />
      <div className="mt-2 font-heading text-4xl leading-none text-indigo-700">
        Ozark Open
      </div>
      <div className="font-heading text-xl leading-none text-gold-600">
        Sportsbook
      </div>
    </div>
  )
}

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center bg-gradient-to-t from-ink-100 to-background px-6">
      <div className="w-full max-w-sm">
        <Brand />
        <Card accent elevated>
          <div className="px-6 py-5">
            {params.sent ? (
              <div className="text-center">
                <div className="mb-2 font-heading text-2xl text-text-strong">
                  Check your email
                </div>
                <p className="text-sm leading-normal text-text-muted">
                  We sent a magic link to your address. Click it to sign in.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-1 font-heading text-2xl text-text-strong">
                  Welcome back
                </div>
                <p className="mb-4 text-sm leading-normal text-text-muted">
                  Enter your email to get a magic link. No passwords, no house.
                </p>
                <form action={signIn} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  {params.error && (
                    <p className="text-sm text-destructive">
                      {decodeURIComponent(params.error)}
                    </p>
                  )}
                  <Button type="submit" size="lg" className="w-full">
                    Send magic link
                  </Button>
                </form>
              </>
            )}
          </div>
        </Card>
        <p className="mt-4 text-center text-xs text-text-muted">
          Private pool · invite only · 24 players
        </p>
      </div>
    </div>
  )
}
