import Image from "next/image"
import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import { EntryGate } from "@/components/landing/entry-gate"
import { TournamentMark } from "@/components/landing/tournament-mark"

/**
 * The Ozark Open landing page, the front door for members and visitors alike.
 *
 * This is the "front of house" surface. It wears the TOURNAMENT brand (forest
 * green, gold, dark, cinematic), not the sportsbook brand (indigo, cream, flat,
 * sunlight-legible). The boundary is deliberate and stops at /login. The whole
 * brief lives in docs/LANDING_PAGE_OVERHAUL.md.
 *
 * Three beats, one idea each, plus a sponsor strip: the announcement, the card,
 * the strip, the entry. No feature grid, no explainer cards, no names of
 * people. The audience is ~32 invited men who already know what this is, so
 * the page is an announcement rather than a pitch.
 *
 * The door stays a door for everybody (#181). This page used to
 * `redirect("/dashboard")` the moment it saw a session, so a returning member
 * never actually laid eyes on ozark-open.com. The domain is what people are
 * handed, so it renders for everyone and the CTA is what knows who you are:
 * signed out to /login, signed in straight to /dashboard with no login screen
 * in between.
 *
 * Server component apart from the gate. All motion is CSS scroll-driven, so
 * there are no scroll listeners and no animation dependency.
 */

const ROUNDS = [
  {
    round: "Round 1",
    dow: "Thu",
    day: "24",
    course: "Old Kinderhook Golf Club",
    town: "Camdenton, Missouri",
  },
  {
    round: "Round 2",
    dow: "Fri",
    day: "25",
    course: "Bear Creek Valley Golf Club",
    town: "Osage Beach, Missouri",
  },
  {
    round: "Round 3",
    dow: "Sat",
    day: "26",
    course: "Osage National Golf Resort",
    town: "Lake Ozark, Missouri",
  },
]

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const signedIn = Boolean(user)

  return (
    <div className="ozk">
      <EntryGate>
        <div className="ozk-grain" aria-hidden />

        {/* Beat A: the announcement. Centered on purpose. The taste skill
            pushes against centered heroes, but its own exception is the
            editorial / launch-announcement brief where the message is the
            design, which is exactly this page. */}
        <section className="ozk-hero">
          {/* The stage is sticky inside a tall section, which is what gives the
              media room to expand without anyone hijacking the scroll. */}
          <div className="ozk-hero-stage">
            {/* The Old Kinderhook aerial. Decorative, so it carries no alt text
                and lives in CSS: until the file exists at
                public/tournament/old-kinderhook-aerial.jpg this shows the
                card's own ground rather than a broken image. */}
            <div className="ozk-hero-media" aria-hidden />
            <div className="ozk-hero-scrim" aria-hidden />

            <div className="ozk-hero-inner">
              {/* <object> renders its children only when the resource fails to
                  load, so the real tournament logo takes over the instant the
                  file exists and the drawn stand-in covers until then. */}
              <object
                className="ozk-mark"
                type="image/svg+xml"
                data="/tournament/ozark-open-logo.svg"
                aria-label="Ozark Open"
              >
                <TournamentMark className="h-16 w-auto" />
              </object>
              <p className="ozk-eyebrow">5th Annual</p>
              <h1 className="ozk-display ozk-wordmark">
                <span className="ozk-word ozk-word-a">Ozark</span>
                <span className="ozk-word ozk-word-b">Open</span>
              </h1>
              <p className="ozk-meta">September 24-26, 2026</p>
              <p className="ozk-meta-sub">Lake of the Ozarks, Missouri</p>
            </div>
          </div>
        </section>

        {/* Beat B: the card. A scorecard, not a feature grid. Golf already has
            a typographic artifact for three rounds and this is it. */}
        <section className="ozk-section ozk-reveal">
          <h2 className="ozk-display ozk-h2">The Card</h2>
          <table className="ozk-card">
            <thead>
              <tr>
                <th scope="col">Round</th>
                <th scope="col">Date</th>
                <th scope="col">Course</th>
              </tr>
            </thead>
            <tbody>
              {ROUNDS.map((r) => (
                <tr key={r.round}>
                  <td>
                    <span className="ozk-strip-label">{r.round}</span>
                  </td>
                  <td>
                    <span className="ozk-dow ozk-dow-top">{r.dow}</span>
                    <span className="ozk-day">{r.day}</span>
                  </td>
                  <td>
                    <span className="ozk-course ozk-display">{r.course}</span>
                    <span className="ozk-town">{r.town}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* The sponsor strip. Played completely straight: it is a real sponsor
            bar for a joke sponsorship, and the deadpan is what makes it land.
            The badge art is not in the repo yet, so this is type only. */}
        <aside className="ozk-strip ozk-reveal">
          <p className="ozk-strip-label">Proud sponsor of</p>
          <p className="ozk-strip-name ozk-display">
            Pace of Play Awareness Month
          </p>
        </aside>

        {/* Beat C: the handoff. The page changes brand here on purpose, from
            the tournament to the sportsbook, because this is the doorway into
            it. Real sportsbook assets: the indigo ground, the existing mark,
            Azalea, and the one gold action. */}
        <section className="ozk-entry ozk-reveal">
          <div>
            <Image
              src="/ozark-mark.svg"
              alt=""
              width={818}
              height={747}
              unoptimized
              className="ozk-entry-mark"
            />
            <p className="ozk-entry-name">Ozark Open Sportsbook</p>
            <h2 className="ozk-join">Join the Sportsbook</h2>
            <p className="ozk-creed">No house, no rake, no profit.</p>
            <Link href={signedIn ? "/dashboard" : "/login"} className="ozk-cta">
              {signedIn ? "Enter" : "Log In"}
            </Link>
            <p className="ozk-footnote">Invite only</p>
          </div>
        </section>
      </EntryGate>
    </div>
  )
}
