// The house lines — the third event kind in the dashboard activity feed.
//
// Editing this list is the whole authoring interface. No table, no admin page:
// a line is an entry in this array, and changing one is a one-line commit.
//
// THEY ARE MEANT TO PASS FOR REAL EVENTS (Andrew, Aug 31, 2026). Same row as a
// wager: the member's linked profile name, their avatar, a timestamp, dropped
// in between the real ones. An earlier version rendered them muted and italic
// with no name and no stamp precisely so they could NOT be mistaken for
// something that happened — that was the wrong call for this pool. The joke is
// that they read as fact.
//
// TWO RULES survive that, and both are load-bearing:
//
//   1. A line never encodes REAL data. Nothing here is derived from a
//      placement, a pick, an amount, a count or a result — these are fiction
//      typed by hand. The lines may SAY anything; they may not KNOW anything.
//      "Garrett Klenke bet on himself again" is a running joke, not a read of
//      the book: the feed's licence to exist mid-phase is that it never
//      publishes a position (PRD §8, §12 A16), and that holds because no line
//      here has ever touched the database.
//
//   2. No "$" in a line. e2e/activity-feed.spec.ts asserts the whole rail
//      carries no dollar sign — the cheap canary for a stake leaking into a
//      surface that is readable while a bet is still open. A line with a price
//      in it would blunt that check rather than trip it. Pinned by a unit test
//      in lib/activity.test.ts, so this is enforced and not merely requested.
//
// The names are matched to members by display_name (see lib/activity.ts), the
// same key the importer matches pick names with. A name with no account yet
// renders as plain text — the joke still lands, it just doesn't link.

/** A house line: the member it is about, and what it claims they did. Rendered
 *  as `${name} ${line}`, which is the sentence as written. */
export type Quip = { name: string; line: string }

export const ACTIVITY_QUIPS: readonly Quip[] = [
  { name: "Rob Vemmer", line: "shit his pants." },
  { name: "Mike Yenzer", line: "cracked open another beer." },
  { name: "Evan Shippee", line: "rode a ripsrick in the lake." },
  { name: "Steve Esswein", line: "hacked the mainframe." },
  { name: "Auben Mitchell", line: "tripped on his laces." },
  { name: "Mike Cimo", line: "snapped his putter." },
  { name: "Dan Mercer", line: "got cum on his green jacket." },
  { name: "Devin Arand", line: "became super gay." },
  { name: "Joey Suntrup", line: "lost a ball in the fairway." },
  {
    name: "Jake Kohne",
    line: "took out a second mortgage for more sportsbook bets.",
  },
  { name: "Brendan Nulsen", line: "was caught by a fisherman." },
  { name: "Andrew Long", line: "threw a club into the water." },
  { name: "Garrett Klenke", line: "bet on himself again." },
  { name: "Steve Jones", line: "was acting kinda fruity." },
  { name: "Hayden Schiller", line: "lost four balls on one hole." },
  { name: "Austin Davis", line: "learned a new 5th grade vocabulary word." },
  { name: "Pat Leicht", line: "used his pocket pussy in the AirBNB bedroom." },
  { name: "Ethan Kipping", line: "tripped over the tee box marker." },
  { name: "Dustin Scheller", line: "drove the cart into a bunker." },
] as const
