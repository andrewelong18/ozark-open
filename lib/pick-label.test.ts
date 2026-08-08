import { strict as assert } from "node:assert"
import { test } from "node:test"

import { splitPickLabel, stripStrokeSuffix } from "./pick-label.ts"

// ---------------------------------------------------------------------------
// stripStrokeSuffix — the matching side. These cases are the importer's
// contract: whatever comes out is looked up against users.display_name.
// ---------------------------------------------------------------------------

test("stripStrokeSuffix: even par", () => {
  assert.equal(stripStrokeSuffix("Jake Kohne (E)"), "Jake Kohne")
})

test("stripStrokeSuffix: negative strokes", () => {
  assert.equal(stripStrokeSuffix("Mike Yenzer (-10)"), "Mike Yenzer")
})

test("stripStrokeSuffix: positive strokes", () => {
  assert.equal(stripStrokeSuffix("Steve Jones (+2)"), "Steve Jones")
})

test("stripStrokeSuffix: unsigned strokes", () => {
  assert.equal(stripStrokeSuffix("Pat Hurley (5)"), "Pat Hurley")
})

test("stripStrokeSuffix: lowercase e", () => {
  assert.equal(stripStrokeSuffix("Jake Kohne (e)"), "Jake Kohne")
})

test("stripStrokeSuffix: no suffix is left alone", () => {
  // These are exactly the labels that must match nobody and stay unlinked.
  assert.equal(stripStrokeSuffix("Field"), "Field")
  assert.equal(stripStrokeSuffix("Yes"), "Yes")
  assert.equal(stripStrokeSuffix("No"), "No")
})

test("stripStrokeSuffix: only a trailing suffix is stripped", () => {
  // A parenthetical that is not the stroke notation stays put — stripping it
  // would change the string the importer matches on.
  assert.equal(stripStrokeSuffix("Team (A) vs Team (B)"), "Team (A) vs Team (B)")
  assert.equal(stripStrokeSuffix("Top 5 (incl. ties)"), "Top 5 (incl. ties)")
})

test("stripStrokeSuffix: surrounding whitespace is trimmed", () => {
  assert.equal(stripStrokeSuffix("  Jake Kohne  (E)  "), "Jake Kohne")
})

// ---------------------------------------------------------------------------
// splitPickLabel — the display side. The point of these is that `name` is
// always identical to what the importer matched on.
// ---------------------------------------------------------------------------

test("splitPickLabel: name and stroke come apart", () => {
  assert.deepEqual(splitPickLabel("Jake Kohne (E)"), {
    name: "Jake Kohne",
    stroke: "E",
  })
  assert.deepEqual(splitPickLabel("Mike Yenzer (-10)"), {
    name: "Mike Yenzer",
    stroke: "-10",
  })
})

test("splitPickLabel: no suffix means no badge", () => {
  assert.deepEqual(splitPickLabel("Field"), { name: "Field", stroke: null })
})

test("splitPickLabel: a label that is only a suffix keeps its text", () => {
  // Malformed, but a nameless row is worse than an odd one.
  assert.deepEqual(splitPickLabel("(E)"), { name: "(E)", stroke: null })
})

test("splitPickLabel: the one deliberate divergence is safe", () => {
  // A label that is NOTHING but a suffix is the only case where the display
  // name and the importer's match key differ, and it is safe in the direction
  // that matters: the match key is "", which matches no display_name, so the
  // pick stays correctly unlinked. Display falls back to the raw label so the
  // row still has text. Every other label is pinned identical by the test
  // below.
  assert.equal(stripStrokeSuffix("(E)"), "")
  assert.equal(splitPickLabel("(E)").name, "(E)")
})

test("splitPickLabel: name always equals stripStrokeSuffix — no drift", () => {
  // THE REGRESSION THIS FILE EXISTS FOR (#102). If display and matching ever
  // diverge, a pick renders fine and silently links to nobody, which disables
  // the §7 self-bet cap, the self-pick review flag and the opponent block.
  const labels = [
    "Jake Kohne (E)",
    "Mike Yenzer (-10)",
    "Steve Jones (+2)",
    "Pat Hurley (5)",
    "Field",
    "Yes",
    "Top 5 (incl. ties)",
    "  Andrew Long  (e)  ",
  ]
  for (const label of labels) {
    assert.equal(
      splitPickLabel(label).name,
      stripStrokeSuffix(label),
      `display name drifted from the importer's match key for ${label}`
    )
  }
})
