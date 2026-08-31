// The house quips — the third event kind in the dashboard activity feed.
//
// Editing this list is the whole authoring interface. No table, no admin page:
// a quip is a string in an array, and changing one is a one-line commit.
//
// TWO RULES, both load-bearing rather than stylistic:
//
//   1. A quip carries NO betting information. Not a pick, not a name, not an
//      amount, not a count, not "someone just took the Field" — the feed's
//      entire licence to exist pre-close is that it says who is playing and
//      never what they played (PRD §8, and the §12 entry for this feature).
//      A joke that implies a position is a leak wearing a costume.
//
//   2. A quip never imitates a real event. It must be impossible to misread as
//      something that happened, which is also why the feed renders these in a
//      visually distinct row — muted, italic, no name, no profile link.
//
// Tone: the book's own voice — dry, fond of these people, never urgent. No
// countdown anxiety (the brand rule), no goading anyone into betting more.
export const ACTIVITY_QUIPS: readonly string[] = [
  "The book never sleeps. The book does, however, nap.",
  "Odds are locked. Opinions are not.",
  "No house, no rake, no refunds. Just Pat and a spreadsheet.",
  "Somewhere out there, a putt is being badly over-read.",
  "A reminder that the lake remains undefeated.",
  "Every wager here is a receipt for a story told at the turn.",
  "Handicaps are a suggestion. The scorecard is not.",
  "The pool does not care how confident you sounded in the group chat.",
  "Course conditions: warm, humid, mildly hostile.",
  "Par is a number, not a promise.",
  "This message contains no inside information. Nobody here has any.",
  "The range balls are optimistic. So are we.",
  "Statistically, someone is about to blame the wind.",
  "Wagers cost money. Confidence is free.",
  "Pace of play: still a theoretical concept.",
  "If you are reading this instead of practicing — same.",
] as const
