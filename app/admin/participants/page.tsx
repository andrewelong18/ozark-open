import { redirect } from "next/navigation"

// Sprint 20 merged this page into /admin/people, which shows the whole access
// funnel — including the members this page used to hide behind its
// onboarded_at filter — with approve/edit/revoke attached per row. Kept as a
// redirect so existing links keep working; the admin gate lives at the
// destination. The API it used, /api/admin/participants, is unchanged.
export default function AdminParticipantsPage() {
  redirect("/admin/people")
}
