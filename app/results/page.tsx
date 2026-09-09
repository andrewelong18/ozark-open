import { redirect } from "next/navigation"

// /results retired to a redirect in Sprint 28 (#197).
//
// One table, one truth: the standings now live on the dashboard, which is the
// page everyone already opens. Two surfaces ranking the same 32 people by
// different columns is a thing to be argued about at 11pm, not a feature.
//
// THE ROUTE STAYS. It is written down in the README and the pre-tournament
// checklist, it is named in /admin/close's copy, and it has been pasted into
// the group thread. A dead link on Saturday night is worse than a redirect, and
// it stays in middleware.ts's protectedRoutes so it is still behind the login.
//
// A temporary redirect on purpose: a permanent one is cached in browsers
// forever, and this route is one decision away from being wanted back.
export default function ResultsPage() {
  redirect("/dashboard")
}
