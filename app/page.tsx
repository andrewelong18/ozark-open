import Link from "next/link"
import Image from "next/image"

import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] max-w-xl flex-col items-center justify-center gap-6 px-4 text-center">
      <Image
        src="/ozark-mark.svg"
        alt=""
        width={96}
        height={96}
        className="h-20 w-auto"
        priority
      />
      <div>
        <h1 className="font-heading text-4xl leading-none text-indigo-700">
          Ozark Open Sportsbook
        </h1>
        <p className="mt-3 text-lg text-text-body">
          Private betting pool for tournament participants.
        </p>
        <p className="mt-1 text-sm text-text-muted">
          No house, no rake, no profit.
        </p>
      </div>
      <div className="flex gap-3">
        <Button render={<Link href="/dashboard" />}>Go to Dashboard</Button>
        <Button variant="secondary" render={<Link href="/login" />}>
          Log in
        </Button>
      </div>
    </div>
  )
}
