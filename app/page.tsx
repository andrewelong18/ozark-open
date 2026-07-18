import Link from "next/link"
import Image from "next/image"

import { buttonVariants } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

// Marketing landing page. One CTA only — log in — rendered as a plain <Link>
// styled by buttonVariants so navigation works with zero client JS.
export default function Home() {
  return (
    <div className="mx-auto max-w-[var(--content-max,640px)] px-4 pt-14 pb-16 sm:pt-20">
      <section className="flex flex-col items-center text-center">
        <Image
          src="/ozark-mark.svg"
          alt=""
          width={112}
          height={112}
          className="h-24 w-auto"
          priority
        />
        <h1 className="mt-5 font-heading text-5xl leading-none text-indigo-700 sm:text-6xl">
          Ozark Open Sportsbook
        </h1>
        <p className="mt-4 max-w-md text-lg leading-normal text-text-body">
          The private betting pool for the Ozark Open. Ante up, pick your
          spots, and let the golf settle it.
        </p>
        <p className="mt-2 font-semibold text-text-strong">
          No house, no rake, no profit.
        </p>
        <Link
          href="/login"
          className={cn(
            buttonVariants({ variant: "gold", size: "lg" }),
            "mt-8 w-full sm:w-auto sm:px-10"
          )}
        >
          Log in to place your bets
        </Link>
        <p className="mt-3 text-sm text-text-muted">
          Magic link, no passwords. Invite only.
        </p>
      </section>

      <section className="mt-14 grid gap-4 sm:mt-16">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Everyone&apos;s in the pool</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-normal text-text-body">
            Pari-mutuel, all the way down. Entry fees build the pot, and the
            whole thing gets paid back out based on how everyone&apos;s bets
            perform. Nobody skims a cut.
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Bet the tournament</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-normal text-text-body">
            A full menu of odds on the field — pick your spots round by round
            across three days of golf, September 24&ndash;26, 2026.
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Strictly clubhouse</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-normal text-text-body">
            Invite only, behind login. If you&apos;re in the field,
            you&apos;re in the book.
          </CardContent>
        </Card>
      </section>

      <p className="mt-10 text-center text-xs text-text-muted">
        Private pool · invite only · Ozark Open 2026
      </p>
    </div>
  )
}
