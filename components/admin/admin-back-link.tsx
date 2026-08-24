import Link from "next/link"
import { ChevronLeft } from "lucide-react"

/**
 * The way back out of an admin page.
 *
 * The five admin tools are launched from a menu inside the profile page's
 * Admin tab, and until now the only way back was the browser's own back
 * button — which the app's bottom nav doesn't provide on a phone, and which
 * nobody standing in a clubhouse at 9pm should have to hunt for.
 *
 * `?tab=admin` matters: the profile page's tab state would otherwise reset to
 * "Your status" and drop the admin back at the top of a page they didn't ask
 * for. The server resolves that param, so the right panel is in the first
 * paint.
 */
export function AdminBackLink() {
  return (
    <Link
      href="/profile?tab=admin"
      className="-ml-2 inline-flex min-h-11 items-center gap-1 self-start rounded-md px-2 text-sm font-semibold text-indigo-700 transition-colors duration-fast ease-standard hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <ChevronLeft className="size-4" aria-hidden />
      All admin settings
    </Link>
  )
}
