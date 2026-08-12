import { PageSkeleton } from "@/components/ui/skeleton"

// Route-level loading UI. Before Sprint 12 there was none anywhere in the app,
// so a navigation to a data-backed page showed the previous screen until the
// server responded — on a phone on course data, long enough to read as a dead
// tap. Next renders this instantly on navigation and swaps it for the real page
// when the server tree arrives.
export default function Loading() {
  return <PageSkeleton />
}
