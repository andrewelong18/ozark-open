/* Fake data for the Ozark Open Sportsbook UI kit. Mirrors the PRD:
   pari-mutuel pool, American odds, two rounds, hit/miss/push/void. */
window.OZ = {
  tournament: { name: "Ozark Open 2026", dates: "Sep 24–27, 2026", status: "active", poolTotal: 520, players: 24 },
  me: { name: "Jake Kohne", entryFee: 40, maxSingle: 20, maxSelf: 10, minBets: 5, maxBets: 10 },

  // Round 1 — open for betting; Round 2 — resolved (post-close social view)
  rounds: [
    {
      round: 1,
      status: "open",
      categories: [
        { name: "Outright Winner", bets: [
          { n: 1, desc: "Dan Mercer to win the tournament", odds: 450 },
          { n: 2, desc: "The Field to win", odds: -300 },
          { n: 3, desc: "Steve Rivers to win the tournament", odds: 600 },
        ]},
        { name: "Top-N Finish + Ties", bets: [
          { n: 4, desc: "Dan Mercer to finish top 4 + ties", odds: 150 },
          { n: 5, desc: "Pat Leicht to finish top 8 + ties", odds: -120 },
          { n: 6, desc: "Andrew Long to finish top 4 + ties", odds: 220 },
        ]},
        { name: "Head-to-Head", bets: [
          { n: 7, desc: "Kohne beats Leicht (no ties)", odds: 120 },
          { n: 8, desc: "Rivers beats Mercer (void if tied)", odds: -110 },
          { n: 9, desc: "Long best of Kohne/Leicht/Rivers", odds: 260 },
        ]},
        { name: "Props", bets: [
          { n: 10, desc: "Best ball under 80.5 on Thursday", odds: -115 },
          { n: 11, desc: "Any hole-in-one during Round 1", odds: 900 },
        ]},
      ],
    },
    {
      round: 2,
      status: "resolved",
      categories: [
        { name: "Outright Winner", bets: [
          { n: 12, desc: "Dan Mercer to win the tournament", odds: 200, outcome: "hit" },
          { n: 13, desc: "The Field to win", odds: -250, outcome: "miss" },
        ]},
        { name: "Top-N Finish + Ties", bets: [
          { n: 14, desc: "Pat Leicht to finish top 4 + ties", odds: 175, outcome: "hit" },
          { n: 15, desc: "Andrew Long to finish top 8 + ties", odds: -140, outcome: "push" },
        ]},
        { name: "Head-to-Head", bets: [
          { n: 16, desc: "Kohne beats Rivers (void if tied)", odds: 130, outcome: "void" },
          { n: 17, desc: "Leicht beats Long (no ties)", odds: -105, outcome: "miss" },
        ]},
      ],
    },
  ],

  // "My Bets" — Jake's placements this tournament (running total vs $40 entry)
  myBets: [
    { n: 4, desc: "Dan Mercer to finish top 4 + ties", odds: 150, round: 1, stake: 8, status: "open" },
    { n: 7, desc: "Kohne beats Leicht (no ties)", odds: 120, round: 1, stake: 5, status: "open" },
    { n: 10, desc: "Best ball under 80.5 on Thursday", odds: -115, round: 1, stake: 10, status: "open" },
    { n: 12, desc: "Dan Mercer to win the tournament", odds: 200, round: 2, stake: 6, status: "resolved", outcome: "hit" },
    { n: 14, desc: "Pat Leicht to finish top 4 + ties", odds: 175, round: 2, stake: 4, status: "resolved", outcome: "hit" },
  ],

  // Final results / standings (post-tournament share of the pool)
  results: [
    { name: "Dan Mercer", entry: 40, theo: 61.5, actual: 82.4, pl: 42.4 },
    { name: "Jake Kohne", entry: 40, theo: 38.9, actual: 52.1, pl: 12.1 },
    { name: "Pat Leicht", entry: 30, theo: 27.0, actual: 36.2, pl: 6.2 },
    { name: "Steve Rivers", entry: 50, theo: 33.1, actual: 44.3, pl: -5.7 },
    { name: "Andrew Long", entry: 40, theo: 22.4, actual: 30.0, pl: -10.0 },
    { name: "Cole Ramsey", entry: 20, theo: 8.2, actual: 11.0, pl: -9.0 },
  ],

  // Leaderboard mirrored from the scoring sheet
  leaderboard: [
    { pos: "1", name: "Dan Mercer", thru: "F", today: "-4", total: "-9" },
    { pos: "2", name: "Pat Leicht", thru: "F", today: "-2", total: "-6" },
    { pos: "T3", name: "Jake Kohne", thru: "F", today: "-1", total: "-4" },
    { pos: "T3", name: "Steve Rivers", thru: "F", today: "+1", total: "-4" },
    { pos: "5", name: "Andrew Long", thru: "F", today: "E", total: "-2" },
    { pos: "6", name: "Cole Ramsey", thru: "F", today: "+3", total: "+5" },
  ],
};
