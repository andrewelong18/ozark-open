# Roadmap

The phased build plan. Each phase has a clear definition-of-done so you (or an AI coding assistant) can tell when to move on.

The phases follow the incremental steps from the original Sportsbook memo, expanded into work that is sized for vibe-coding.

---

## Sequencing Principle

Build in the order that lets you see and demo something working as early as possible. Auth + an empty bets list is more motivating than a perfect data model with no UI. The plan below front-loads visible progress.

---

## Phase 0 — Foundations (½ day)

**Goal:** project skeleton exists, deploys to a public URL, has nothing in it.

- Create the GitHub repo from a Next.js + Tailwind starter template.
- Create a Supabase project (free tier).
- Connect Supabase to a local `.env.local` and to Vercel as production env vars.
- Connect Vercel to the GitHub repo with auto-deploy from `main`.
- Push a "Hello, Ozark Open" page. Confirm it deploys.

**Done when:** you can visit `https://<your-project>.vercel.app` and see the placeholder page.

---

## Phase 1 — Authentication & User Records (½ day)

**Goal:** participants can log in via magic link, and a `users` row exists for them after first login.

- Configure Supabase Auth with magic-link email enabled.
- Build a `/login` page with an email input.
- Build the auth callback route that handles the magic-link redirect.
- Build a `/logout` action.
- Create the `users` table and a database trigger that mirrors `auth.users` rows into `public.users` on signup.
- Build a header component showing the logged-in user's `display_name` and a logout button.
- Manually promote yourself (and Pat, Jake, Steve) to `is_admin = true` in Supabase Studio.

**Done when:** you can log in with your email, see your name in the header, and log out. New `users` rows appear in Supabase Studio after each first-time login.

---

## Phase 2 — Tournament & Participants Setup (½ day)

**Goal:** an admin can create a tournament and add participants to it.

- Migration: create `tournaments` and `tournament_participants` tables.
- Seed the 2026 tournament row.
- Use Supabase Studio to add `tournament_participants` rows manually for each participant. (No admin UI in the app for this yet — Studio is sufficient.)
- Build an authenticated `/dashboard` page that:
  - Shows the active tournament name and year.
  - Shows the logged-in user's entry fee and "you're in" status, or a message that they're not in this tournament's participant list.

**Done when:** logged-in users see their participant status; admins can add/remove participants from Studio without touching code.

---

## Phase 3 — The Bet Menu (1 day)

**Goal:** participants can see open bets, grouped by category and round.

- Migrations: create `bet_categories`, `bets`, `bet_subjects` tables. Seed the seven categories.
- Use Supabase Studio to manually add ~5 sample bets across both rounds.
- Build a `/bets` page that lists all bets in the active tournament where `status != 'draft'`, grouped by `round_number` and then by `bet_categories.name`.
- For each bet, show: number, description, American odds, fractional-odds display (computed), implied probability (computed), status, and outcome (if resolved).

**Done when:** the bet menu renders correctly. Admins can add new bets in Studio and see them appear in the app on next page load.

---

## Phase 4 — Placing Bets (2 days)

**Goal:** participants can place bets, edit them, and remove them — with all constraints enforced.

- Migration: create `bet_placements` table.
- Build a "Place Bet" UI on the bet menu page: each open bet has an inline input for amount.
- Implement `app/api/placements/route.ts` (POST/PATCH/DELETE) that validates against:
  1. Bet status must be `open`.
  2. Amount is a positive whole dollar.
  3. Single-bet maximum (per `tournaments.max_single_bet_pct` and `max_single_bet_cap`).
  4. Per-round count not exceeding `max_bets_per_round`.
  5. Self-bet maximum (per `tournaments.max_self_bet_pct` and `max_self_bet_cap`).
  6. Total placements for this round don't exceed entry fee.
  7. If user is a subject of the bet, flag `requires_admin_review = true` (add this column).
- Build a "My Bets" tab showing the user's current placements for the active tournament, grouped by round, with running totals and remaining budget.
- Validate at submission: total placements per round must equal entry fee and there must be at least `min_bets_per_round` placements before the round closes.

**Done when:** participants can complete a full betting flow without breaking any of the seven rules from the original memo.

---

## Phase 5 — Closing a Round, Marking Outcomes (½ day)

**Goal:** admins can close betting for a round and mark each bet's outcome from Supabase Studio.

- No new app UI needed — this is a Studio workflow.
- Document the workflow in `README.md` (the "Updating Bets and Outcomes" section is already there; expand it with screenshots of Studio).
- App-side change: when `bet.status = 'closed'`, hide the placement input but show the placement (read-only).
- App-side change: when `bet.status = 'resolved'`, show the outcome (hit / miss / push / void) prominently with color coding.

**Done when:** Pat can take the workbook's day-1 results, change five bets to `outcome = hit` and ten bets to `outcome = miss` in Studio, and the app reflects this on the next page load.

---

## Phase 6 — Theoretical Payouts Per Bet (1 day)

**Goal:** each participant sees their per-bet theoretical payout and a running total.

- Migration: create the `placement_payouts_view` Postgres view (defined in `DATA_MODEL.md` §4).
- Add a column to "My Bets" showing the theoretical payout for each resolved placement.
- Add a "Total theoretical payout" summary at the top.
- Add a "View all bets" page (admin-only) that shows everyone's placements in a single table — replicating what the spreadsheet's `View` sheet does today.

**Done when:** the numbers match what Pat would compute by hand for any user.

---

## Phase 7 — Final Pari-Mutuel Payouts (½ day)

**Goal:** after all bets are resolved, the app computes and displays each participant's actual payout share.

- Implement `lib/payouts.ts` with a function that:
  1. Sums the theoretical payout for every participant.
  2. Computes each participant's share = `participant_total / pool_total × pool_size`.
- Build a `/results` page that shows the final standings: name, entry fee, theoretical payout, actual payout, profit/loss.
- Display only when `tournament.status = 'completed'`.

**Done when:** the app's final payout numbers match the spreadsheet's `View` sheet within rounding error.

---

## Phase 8 — Leaderboard Mirror from Sheets (1 day)

**Goal:** the app reads tournament standings from the existing scoring workbook (mirrored to Google Sheets) and displays them.

- Pat copies the relevant tabs from the Excel workbook into a Google Sheet (or sets up a Google Sheets version directly).
- Configure a Google Cloud service account with read-only access to the Sheet.
- Add the service account credentials to Vercel env vars.
- Build a `/leaderboard` page that fetches from the Sheets API, caches for 5 minutes, and renders the leaderboard table.

**Done when:** participants can see live tournament standings (refreshed within 5 min of Pat updating the workbook).

---

## Phase 9 — Polish (1+ days, ongoing)

These improve the experience but aren't required for a working pool. Pick what you have time for:

- Mobile-responsive polish (check that everything works on a phone before tournament day).
- Email participants when bets are released for Round 2 (Supabase Edge Functions or a manual admin-triggered send).
- Career stats: per-user history of profit/loss across multiple tournaments.
- Bet aggregate stats (after a round closes, show "$48 was wagered on Dan Mercer to win" type breakdowns).
- An admin UI inside the app for promoting users to admin / adding tournament participants, so admins don't need to use Studio. (Skip this for v1 — Studio works fine.)

---

## Recommended Build Sequence

If you have one full weekend: Phase 0–4 gets you a working bet-submission app. That's the minimum viable version.

If you have two weekends: add Phase 5–7 for outcomes and payouts. That's the full original Sportsbook workflow, automated.

If you have a month of evenings: add Phase 8–9. Now it's nicer than the spreadsheet ever was.

---

## What Is Explicitly Not on the Roadmap

- A custom admin UI (Studio is the admin UI).
- Notifications, email digests, or push notifications (out of scope for v1).
- A mobile app (it's a mobile-responsive web app — no native build).
- Public access, marketing pages, SEO (private app, behind login).
- Multi-tenancy (this is one pool for one group; it does not need to support multiple unrelated leagues).
- Payment processing (Venmo and cash, out of band, as today).

If a feature isn't here, default to "no" until someone makes the case for it.
