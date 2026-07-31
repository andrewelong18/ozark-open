# Dry Run — What Pat Needs to Bring

*Send this over before the session. Everything here is on Pat; Andrew handles the rest.*

---

Tomorrow evening we're running the whole tournament weekend end to end against the real site —
opening the book, taking bets, closing Phase 1, publishing Round 1 results, opening Phase 2, and
paying out a pool. About three hours.

**You'll be driving.** You'll do everything you'd do in September: the uploads, the approvals,
the closes. I'll read the steps and watch the database. Anywhere you get stuck is the most
useful thing that happens all night — that's a real finding, not a failure.

---

## 1. The spreadsheet, in four saved states · **the important one**

Your workbook is what actually runs September, so testing *your* file is most of the point. Save
off four versions, whatever you'd genuinely upload at each moment:

| # | When | What's in it |
|---|---|---|
| **1** | Before the tournament | Phase 1 bets `open`, Phase 2 `hidden`, every result `Pending` |
| **2** | Thursday morning + night | Phase 1 `closed`, Round 1 results filled in |
| **3** | Friday night | Phase 2 flipped to `open`, with its updated tournament odds |
| **4** | Saturday night | Phase 2 `closed`, all final results |

Two things to build in deliberately, because we've never tested either:

- **At least one `Void`** somewhere — a match where someone withdrew, say. Void behaves
  differently from a push (it pulls the money out of the pool entirely), and there's never been
  one in any test data.
- **One line that moves.** In sheet 2 or 3, change the odds on a pick that people had already
  bet on in Phase 1. Everyone who bet at the old price has to keep the old price, and I want to
  watch that happen rather than take it on faith.

Don't tidy anything up for us. Helper columns, extra tabs, weird formatting — leave it exactly
as you'd really have it. If it breaks the upload, that's precisely what we need to know tonight
rather than on a Thursday morning.

**If they're not ready, don't sweat it** — I've built a set of stand-ins from the sample
workbook and the evening runs either way. But we'd be testing my file instead of yours.

## 2. Your payout math · **this is the test that decides everything**

At the end I'll hand you a list of every wager placed — who, which pick, how much, at what odds,
and how it finished. **Run it through your workbook and tell me what everyone should get paid.**

Then we compare, to the cent.

Everything else in the app is convenience. If these two numbers don't match, it can't be used to
settle real money — so bring whatever you'd normally use to work out payouts.

## 3. Your phone

Almost everyone will only ever use this thing from a phone, standing on a tee box, probably on
bad signal. We'll walk every page on your actual phone at the end. Bring a charger.

## 4. Half an hour of decisions

Five things have been sitting open, most of them yours to call. We'll hit each one at the moment
the test walks into it, so you'll have just seen the thing you're deciding about:

- **The 5–10 bet count.** Back in July you said it should span the whole tournament — all of
  them in one round and none in the other being fine. The app currently enforces 5–10 *per
  phase*. Those are different rules and I built the wrong one, or the notes are wrong. Which is
  it?
- **A stricter cap for non-playing bettors.** You asked for one and we never landed on a number.
  Right now there's no stricter limit at all — a non-player gets exactly the same maximums as
  anyone else.
- **Entry collection.** Is "$20 out of the deposit, the rest by Venmo" firm?
- **Dates.** Sept 24–26 — an earlier note said 24–27. Which is right?
- **The leaderboard.** You mentioned dropping it. If that's still where you're at, I can cut the
  whole Google Sheets integration and it saves real work.

## 5. What you do *not* need

- Nothing to install, no accounts to make
- Don't study the app beforehand — **cold is better.** A big chunk of what we're testing is
  whether it makes sense to someone who hasn't been staring at it for two months.

---

## What'll be sitting there when you arrive

I'll have set up about a dozen fake bettors so the pool is realistic — a fifteen-person book
rather than the two of us. They're named after golfers already in your sample sheet (Dan Mercer,
Jake Kohne, Garrett Klenke and so on), which is how the app works out that a pick refers to a
particular person. That's what makes the interesting rules testable:

- Betting on yourself is allowed but capped and flagged
- Betting on your **opponent** in a match you're playing in is refused outright
- Different entry fees produce different maximums — a $25 entry caps a single bet at $12, a $50
  entry caps at $20

They all get deleted afterwards. Nothing touches your real account beyond your own entry fee,
which I'll set during the session anyway.

---

**Rough shape of the evening:** first hour is signup, approvals and opening the book. Second hour
is the betting rules and closing Phase 1. Last hour is results, Phase 2, and the payout
reconciliation. We'll take the decisions as they come up rather than saving them for the end.
