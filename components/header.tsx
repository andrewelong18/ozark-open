import Link from "next/link"
import { Button } from "@/components/ui/button"

export function Header() {
  return (
    <header className="border-b">
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <Link href="/" className="text-lg font-bold">
          Ozark Open
        </Link>
        <Button disabled>Log in</Button>
      </div>
    </header>
  )
}
