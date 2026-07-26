import { redirect } from "next/navigation"

// Sprint 20 merged this page into /admin/people — the roster and the approval
// page were two views of one access funnel. Kept as a redirect so the README's
// links and three sprints' worth of muscle memory keep working; the admin gate
// lives at the destination.
export default function AdminRosterPage() {
  redirect("/admin/people")
}
