# Landing Page Overhaul — Context & Preferences

**Status:** draft 1 built and pushed Aug 25, 2026 (Item 6). Still not a sprint.
The page runs; the art does not exist in the repo yet.
**Scope:** `ozark-open.com` root route only — the logged-out marketing page at
[`app/page.tsx`](../app/page.tsx). Everything behind login is out of scope
unless a context item below says otherwise.

This file is the running record of what Andrew wants the overhaul to be. It is
written **incrementally, one context item at a time**, in the order the items
arrive. When the collection phase ends, this doc — plus
`docs/DESIGN_SYSTEM.md` and the `ozark-open-design` skill — is the brief the
implementation works from. Nothing here is built until the brief is closed.

Item 1 is a reference Andrew supplied. **Item 2 is the decision log** — 24
research recommendations with his verdict on each — and is the operative
section. Where the two disagree, Item 2 wins.

---

## 1. What exists today

`app/page.tsx` is a **server component**. It calls `supabase.auth.getUser()`
and `redirect("/dashboard")` for authenticated members, so the landing page is
only ever seen logged-out. It renders, in a single 640px column:

1. `/ozark-mark.svg` (112px), the `Ozark Open Sportsbook` H1 in `font-heading`
   indigo-700, a two-sentence subhead, and the "No house, no rake, no profit."
   line.
2. One gold CTA — `Log in to place your bets` → `/login` — as a plain `<Link>`
   styled by `buttonVariants`, deliberately **zero client JS**.
3. Three `Card size="sm"` blocks: *Everyone's in the pool* (pari-mutuel),
   *Bet the tournament* (Sept 24–26, 2026), *Strictly clubhouse* (invite only).
4. A `Private pool · invite only · Ozark Open 2026` footer line.

Constraints it currently satisfies that any overhaul has to consciously keep or
consciously break: no client JS on the critical path, one gold CTA per screen
(the DS rations gold), single light theme (dark mode is intentionally dropped),
and the auth redirect.

## 2. Stack facts the overhaul must design around

| Fact | Consequence |
|---|---|
| Next.js 16.2 App Router, React 19.2, RSC on | Any scroll-driven hero is a `'use client'` island; the page shell (and the auth redirect) should stay server-side. |
| Tailwind v4, tokens in `app/globals.css` via `@theme inline` | No hardcoded hexes and no raw `blue-200`-style utilities from copy-pasted components — port to DS tokens (`text-on-dark`, `indigo-*`, `gold-*`, `ink-*`). |
| shadcn style `base-nova`, `aliases.ui = @/components/ui` | `components/ui/` already exists (button, card, dialog, input, badge, …). Third-party blocks drop in there or in a sibling `components/blocks/`. |
| `framer-motion` is **not** installed | Any animation-dependent component needs a dependency decision first — see Open Questions. |
| Single light theme, WCAG AA, tuned for outdoor/sunlight reading | Dark hero imagery is a deliberate exception, not the default; contrast has to be checked, not assumed. |
| ~32 invited participants, invite-only, no SEO/public access | The page persuades people who **already know what this is** and need to log in. It is not customer acquisition. Weigh spectacle against "get me to the login button." |

---

## Context items

### Item 1 — Scroll-expansion hero pattern (21st.dev)

**Source:** <https://21st.dev/@arunachalam/components/scroll-expansion-hero>
**Andrew's framing:** *"I am intrigued by the hero pattern found here."* —
interest in the **pattern**, recorded as a reference, not yet an adopted
decision.

**The pattern:** a full-viewport hero that hijacks the first stretch of scroll.
A background image sits at full bleed; a centered media card (video or image)
starts small (300×400) and grows with scroll progress (to ~1550×800 desktop,
~950×600 mobile) while the background fades out, the title halves slide apart
horizontally (`translateX` ± scroll progress), and the media's dark overlay
lightens. At progress ≥ 1 the media is "fully expanded", page scroll unlocks,
and the `children` content section fades in below. Scrolling back up at
`window.scrollY <= 5` re-locks and reverses it.

**Implementation notes / gotchas for our stack** (assessment, not the author's):

- **Dependency:** the source needs `framer-motion`, which we don't have. The
  current package is `motion` (framer-motion's successor). Adding either is a
  new runtime dependency on a page that currently ships **zero** client JS —
  that trade is the first real decision. The four `motion.div` uses here are
  opacity fades that plain CSS transitions could do.
- **Scroll hijacking:** it attaches non-passive `wheel`/`touchmove` listeners
  to `window` and calls `window.scrollTo(0, 0)` on every scroll until
  expansion completes. That means: no keyboard scrolling (Space/PgDn/arrows
  are not handled), no `prefers-reduced-motion` respect, and a hard block on
  reaching the CTA until the animation is satisfied. All three need an answer
  before this ships on a page whose job is "log in."
- **Path mismatch in the source:** the integration prompt says copy to
  `/components/ui`, but `demo.tsx` imports from
  `@/components/blocks/scroll-expansion-hero`. Pick one; `components/blocks/`
  reads better for a page-level composite than `components/ui/` (which is
  primitives).
- **Styling:** hardcoded `text-blue-200` and `bg-black/10|30|50` throughout —
  every one of those becomes a DS token in a port.
- **Assets:** the pattern wants a background image **and** a foreground
  video/image. We have none for this purpose today (`public/` holds the marks,
  onboarding shots, `celebration/great-job.mp4`, and the joke ads). Sourcing
  real Ozark Open course/tournament media is a prerequisite, not a detail.
- **Layout:** it is `min-h-[100dvh]` and full-bleed, which fights the current
  `max-w-[var(--content-max,640px)]` column and sits under the app header
  (`components/header.tsx` / `site-nav.tsx`) — check how the hero and the
  header coexist.

The full component source and the vendor's integration prompt are preserved
verbatim in [Appendix A](#appendix-a--item-1-source-verbatim) so the reference
survives without the chat thread.

---

### Item 2 — Approved design direction (research pass, Aug 24, 2026)

A research pass across golf brand and resort sites, event/conference sites, the
scroll-animation technique literature, and the browser constraints on audio
produced 24 recommendations. Andrew's verdicts are recorded below: **18
approved, 3 revised or partially superseded, 3 rejected.** Everything in this
item is decided unless a row says otherwise.

#### The finding that reframed the brief

The golf-site sweep was mostly a **negative result**. Sand Valley, Cabot,
Ohoopee, TGL and Manors are all *inventory marketing* — courses as products,
"Explore Course", "Plan Your Trip", carousels, press accolades. None of it maps
to a private tournament that sells nothing and has no inventory. The one
transferable lesson came from Ohoopee, and it inverts the expectation: a real
members-only club's homepage is a photo slider and a "Contact Us". **Restraint
is the exclusivity signal.** Resort sites market because they need strangers;
the Ozark Open has ~32 invited men who already know exactly what this is.

So the genre is wrong. This is not a golf site. It is an **annual event site**:
dates, venue, schedule, edition, one entry action. That reframe drives the
section architecture below.

#### Verdict table

| # | Recommendation | Verdict |
|---|---|---|
| 1 | Front-of-house / back-of-house doctrine | ✅ Approved |
| 2 | Ceremony, not persuasion | ✅ Approved |
| 3 | Budget is free on cost, not on time | ✅ Approved |
| 4 | Five beats, one idea per viewport | ⚠️ **Revised** — collapsed to three |
| 5 | Lead with the Roman numeral, not "5th Annual" | ❌ **Rejected** — say "5th Annual" |
| 6 | The agenda is a scorecard, not a timeline | ✅ Approved |
| 7 | Honours board of past champions | ❌ **Rejected** — no names of people |
| 8 | Location as a drawn map, not photography | ✅ Approved *(see note)* |
| 9 | Cut the three sportsbook explainer cards | ✅ Approved |
| 10 | The CTA is a door, not a button | ✅ Approved |
| 11 | Scroll-expansion **without** hijacking scroll | ✅ Approved |
| 12 | GSAP ScrollTrigger over framer-motion, if JS at all | ✅ Approved |
| 13 | Split the wordmark, not a sentence | ✅ Approved |
| 14 | No scroll-scrubbed video in v1 | ✅ Approved |
| 15 | Two parallax planes maximum | ✅ Approved |
| 16 | Reduced motion designed as a poster | ✅ Approved |
| 17 | Hide the app header on `/` until first scroll | ✅ Approved |
| 18 | Autoplay-with-sound is impossible; scroll is not a gesture | ✅ Approved |
| 19 | The first tap is the door | ✅ Approved — **chosen audio path** |
| 20 | Fallback: muted autoplay + corner toggle | ⚠️ **Partially superseded** by 19 |
| 21 | Cut the theme to a 10–15s loop | ❌ **Rejected** — full track |
| 22 | Four years of bad phone footage is the best asset | ✅ Approved |
| 23 | One typeface doing something extraordinary | ⚠️ **Revised** — wrong palette |
| 24 | Film grain at ~3% over the video | ✅ Approved |

> **Note on #8.** Andrew's written comment numbered "8" is about tournament
> format, which is the Format beat, not the map. The map recommendation was
> filed as approved under his blanket "everything else I agree to". If that
> was not the intent, this is the row to correct.

---

#### A. Doctrine

**1. Front of house / back of house.** `ozark-open-design` bans what this page
needs: *"Flat warm cream — no gradients, no imagery, no textures"*, single
light theme, motion "rationed like gold". Rather than quietly break the DS,
the exception is written as a rule: **the landing page is the clubhouse
entrance; the app is the book.** Cinema is permitted on `/` and stops dead at
`/login`. Without this the whole direction is a DS violation, and worse, the
exception leaks into the app over time.

This doctrine got sharper with decision 23 below: the split is not merely
"cinematic vs. flat", it is **two distinct brand systems**. See §E.

**2. Ceremony, not persuasion.** Nobody arrives asking what the Ozark Open is.
That kills the entire benefits-and-features vocabulary — which is exactly what
`app/page.tsx` currently ships (three explainer cards). Replace persuasion with
*announcement*: the register of a pairings sheet or a fight card.

**3. The budget is free on cost, not on time.** ~32 users means bandwidth and
Vercel cost are non-issues; a 15MB hero video is affordable. But the DS says
these users are *"on phones, outdoors, in sunlight"*, so the real constraint is
the first 800ms on LTE. **The poster is the LCP element and the video is
progressive enhancement** — the research consensus is that autoplay hero video
is the top cause of LCP failure. Everything after the poster is free.

#### B. Section architecture

**4 (revised). Three beats, not five.** Andrew combined beats 1+2 and 3+4:

| Beat | Contains | Notes |
|---|---|---|
| **A. The Announcement** | Tournament logo/mark · "5th Annual" · dates · location | Was two beats. Identity and the when/where now land together. |
| **B. The Card** | Three days, three courses, and the **tournament format** per round | Was two beats. The scorecard *is* the format section. |
| **C. Entry** | The sportsbook lead-in and the login | Terminal, full-viewport. |

Nothing else. No feature grid, no testimonials, no FAQ.

**5 (rejected). The page says "5th Annual" plainly.** The recommendation was to
set a giant Roman **V** and let the numeral carry the edition, on the grounds
that "5th Annual" in a subhead is the generic version. Andrew disagrees and
wants it stated. **Decision: "5th Annual" appears as words on the page.** How
it is set typographically is still open, but the numeral-only treatment is off
the table.

**6. The agenda is a scorecard.** The highest-value structural idea that
survived. Golf's own typographic artifact for "three rounds" is the scorecard:
ruled, tabular, numerals aligned. The DS already mandates tabular figures and
describes the aesthetic as *"squared-ish, for a tabular, sportsbook feel"*.
Rounds render as a ruled card — Round · Date · Course · Format. Three feature
cards with icons is what every generic site does, and what the current page
does. A scorecard is what makes a golfer feel this was built by a golfer.

**7 (rejected). No honours board, and no names of people anywhere on the page.**
The proposal was an engraved list of the four previous champions. Andrew: *"I
don't want any specific names of people on this page."* Treat this as a
**standing rule for the landing page**, not just a no on this section — it also
rules out rosters, quotes, attributed copy and champion callouts. Consequence:
with the honours board gone, the plain "5th Annual" statement from decision 5 is
now the *only* thing establishing the tournament's history. It has to carry that
weight alone.

**8. Location as a drawn map.** Three courses plotted as three points on a
minimal vector map, drawn from real coordinates. This also solves the asset
problem: there is no course photography, and the alternative is generic stock
golf imagery, which would undo everything else here.

**The Format (revises beat B and reinforces 9).** Andrew: *"The format should
not focus on the Ozark Open Sportsbook, it should focus on the tournament
format (stroke play, scramble day, etc.)... I only want enough to promote the
sportsbook as the lead in to the call to action, in which we explain the
sportsbook after authenticating."*

- The Format content is **golf**: stroke play, scramble day, and whatever else
  each round runs. Andrew will supply the specifics.
- The **sportsbook is not explained on this page.** It gets only enough to
  motivate the login, immediately before the CTA.
- The full sportsbook explanation lives **after authentication**. That is a
  scope note for a later sprint: something behind login has to do the
  explaining that this page is no longer doing.

**9. Cut the three explainer cards.** Pari-mutuel / bet the tournament /
invite-only all go. *"No house, no rake, no profit"* survives as the sportsbook
lead-in above the CTA, since it is the best line available and does the job in
six words.

**10. The CTA is a door.** Login is the only action, so it earns a full terminal
viewport rather than a button inside a hero. Gold once, at the end — which
keeps the DS's one-gold-moment rule intact rather than breaking it.

#### C. Motion and scroll

**11. Reproduce the scroll-expansion effect without hijacking scroll.** The
important technical decision. `position: sticky` + `animation-timeline:
view()/scroll()` gives the exact choreography of the Item 1 component (media
expands, background fades, title halves split) driven by *real* scroll position:
no wheel interception, keyboard scrolling works, no dependency, compositor
threaded. The Item 1 component is a textbook scrolljack — it calls
`window.scrollTo(0, 0)` on every scroll event until the animation completes.
NN/g research (via secondary sources) finds most participants become at least
mildly disoriented by scrolljacking, and it conflicts with assistive tech and
reduced-motion settings.

Independently corroborated by the newly installed `design-taste-frontend` skill,
whose §5.D bans `window.addEventListener("scroll", ...)` outright and prescribes
`animation-timeline: view()` or ScrollTrigger instead.

Support is ~84%; Firefox stable still had it behind a flag as of June 2026 →
wrap in `@supports`, fallback is the static composition.

**12. If JS is needed, GSAP ScrollTrigger — not framer-motion.** Pinning is
native to ScrollTrigger. GSAP core ~23KB gzipped plus ScrollTrigger; Motion ~32KB
full, ~4.6KB with the `LazyMotion`+`m` pattern. Note `framer-motion` is
deprecated in name (the package is now `motion`), and in the Item 1 source it
only performs opacity fades that CSS does for free.

**13. Split the wordmark, not a sentence.** The Item 1 signature move applied to
a generic headline is a stock effect; applied to the tournament wordmark parting
to reveal the course behind it, it is a brand moment. Same code, different
result.

**14. No scroll-scrubbed video in v1.** Backward scrubbing of `<video>` is
unreliable across codecs and devices; canvas image sequences (the Apple
approach) are reliable but heavy and complex. Ship a plain muted looping
`<video>` behind the poster and let scroll drive only transform/opacity of the
layers above it.

**15. Two parallax planes maximum.** Background at 10–20% of scroll rate,
foreground at 100%. Five-layer dioramas read as 2014.

**16. Design the reduced-motion version as a poster.** Opt-in pattern: base CSS
*is* the final composed state, animation added only inside `@media
(prefers-reduced-motion: no-preference)`. Avoids a flash of animated content
and forces the still frame to be a composition worth printing.

**17. Hide the app header on `/` until first scroll.** Full-bleed cinema with a
nav bar on top of it is the tell that a template was used.

#### D. Audio

**18. Autoplay with sound is impossible — plan around it.** Verified: the
activation-triggering events are `click`, `keydown`, `pointerdown`/`pointerup`,
`touchend`, and **scroll and swipe explicitly do not count**. Muted autoplay is
always allowed. "The theme plays on landing" cannot literally happen on first
load in Chrome or Safari. Any plan assuming otherwise fails silently for every
visitor.

**19. The first tap is the door — chosen path.** The page opens on a held frame
(mark, "5th Annual", *"Tap to enter"*) and that one tap simultaneously starts
the theme, unlocks the hero, and begins the scroll sequence. A gesture is
required anyway; this makes the browser restriction feel like a velvet rope. It
is also the correct read of the product: an invite-only clubhouse should make
you knock. Andrew: *"I'm good with the first click being used to enter the site
first to trigger it."*

**20 (partially superseded).** 19 and 20 were alternatives, and 19 won, so the
"muted autoplay with no gate" variant is **dead**. What survives from 20 and
still applies: a **persistent, visible, keyboard-reachable mute control**
(equalizer-bars affordance), and no restart of audio on client-side navigation.

**21 (rejected). The full track plays, not a loop cut.** The recommendation was
a 10–15s seamless loop. Andrew: *"I want the full track to play until the user
logs in."* Implications to handle at build time:

- The track is a **larger asset**. It must be fetched **after** the entry tap,
  never on initial load, so it cannot touch LCP.
- "Until the user logs in" means the audio has to **survive the route change to
  `/login`**. A full-page navigation kills it; keeping it alive means the audio
  element lives in a shared layout and `/login` is reached by client-side
  navigation. This is a real architectural constraint on how the CTA is wired,
  not a detail.
- No loop is needed, but decide what happens if the track **ends** before the
  user logs in: stop, or loop from the top.

#### E. Craft

**23 (revised). The landing page is branded to the tournament, not the
sportsbook.** The recommendation assumed Azalea in indigo on cream. Andrew: *"There
is a different color palette for the Ozark Open that is different than the
sportsbook. It is more green than blue/indigo. I will provide this and the
tournament logo to you at some point."*

This is the most consequential correction of the pass, because it upgrades
decision 1 from a styling exception into a **brand boundary**:

| | Front of house — `/` | Back of house — the app |
|---|---|---|
| Brand | **Ozark Open tournament** | Ozark Open **Sportsbook** |
| Palette | Forest green + gold (Item 3.2) | Indigo `#312F8C` + rationed gold |
| Mark | `ozark-open-logo.svg` (Item 3.2) | `ozark-mark.svg` / wordmark |
| Register | Cinematic, dark-capable | Flat cream, sunlight-legible |

The underlying principle from 23 still holds — **one typeface doing something
extraordinary beats five effects** — but whether that face is Azalea depends on
the tournament logo. Do not assume the sportsbook type stack carries over.

**22. The most valuable possible asset is four years of bad phone footage.**
Grainy, handheld, badly-lit clips of actual prior Ozark Opens, cut short,
desaturated, silent under the theme, will read as far higher taste than any
drone-shot stock golf video, because it is real and unrepeatable. Polished stock
would actively cheapen everything above. Note this does not conflict with
decision 7 as long as no one is *named*; if faces are identifiable that is worth
a second look.

**24. Film grain at ~3% over the video.** The DS bans textures in-app for
sunlight legibility, which is irrelevant here. Grain is the cheapest thing that
makes video feel authored rather than licensed.

---

#### Assets Andrew owes before this can be built

1. ~~The tournament colour palette and logo~~ — **supplied, see Item 3.** The
   binaries still need committing to `public/tournament/`, and the exact hex
   values still need confirming.
2. ~~The format per round~~ — **dropped (Item 5.2).** Beat B is schedule only.
3. **Any footage from the first four years** — the Old Kinderhook aerial (Item
   3.3) means there is now a viable hero either way, so this decides between
   *typographic over photograph* and *cinematic video*, rather than blocking.
4. ~~The theme track~~ — **supplied and committed** to
   `public/tournament/ozark-open-theme.mp3` (Item 5.1).

---

### Item 3 — Supplied assets and how they are used (Aug 25, 2026)

Andrew supplied four assets in conversation: the Old Kinderhook aerial, the
Pace of Play badge, and three logo variants. **The binaries are not yet in the
repo** — they arrived as chat attachments and were never written to disk, so
every colour value below is eyeballed from the images and every path below is a
proposal, not a fact. See "Still needed" at the end of this item.

#### 3.1 Where tournament assets live

`public/` already holds the **sportsbook** marks at its root (`ozark-mark.svg`,
`ozark-wordmark.svg`). Tournament assets are a different brand (Item 2 §E), so
they get their own namespace rather than sitting beside them:

| Asset | Proposed path |
|---|---|
| Old Kinderhook aerial | `public/tournament/old-kinderhook-aerial.jpg` |
| Logo, green (primary) | `public/tournament/ozark-open-logo.svg` |
| Logo, gold (alt) | `public/tournament/ozark-open-logo-gold.svg` |
| Mark only, no wordmark | `public/tournament/ozark-open-mark.svg` |
| Pace of Play badge | `public/tournament/pace-of-play.svg` |

The directory split physically encodes the front-of-house / back-of-house
boundary, which makes the rule harder to violate by accident.

#### 3.2 The logo — three variants

A Missouri state silhouette with a flagstick planted around the Lake of the
Ozarks, over a small-caps serif "OZARK OPEN" wordmark.

| Variant | Description | Use |
|---|---|---|
| **Green (primary)** | Forest-green state, gold outline, gold pin, red flag, black cup, green wordmark | Default everywhere on `/` |
| **Gold (alt)** | Inverted: gold state, green outline, green pin, red flag, white cup | Only over dark or photographic backgrounds where the green variant would disappear |
| **Mark only** | State + pin, no wordmark | Tight spaces: the entry gate, favicon, the sticky header after scroll |

**Palette read (eyeballed — confirm against source files):**

| Role | Approx. | Notes |
|---|---|---|
| Forest green | `#00693E`-ish | State fill and wordmark. Much deeper than the Pace of Play badge greens. |
| Gold | `#FDDA00`-ish | **Looks near-identical to the sportsbook's `--gold-400` `#FDDA00`.** |
| Flag red | `#C8102E`-ish | Tiny-area accent only. Do not promote it to a UI colour; it collides with the DS's loss-red semantics. |

**Gold is the bridge between the two brands.** If the tournament gold really is
`#FDDA00`, the front/back-of-house boundary is *green vs. indigo* with gold
crossing both — which means the gold CTA reads as continuous through the login,
and the one-gold-moment rule survives the handoff intact. This is worth
confirming precisely, because it is load-bearing for the whole colour strategy.

**The wordmark is not Azalea.** It is an engraved Roman serif set in small caps
(full-height `O`, reduced `ZARK`), higher contrast and more monumental than
Azalea's warm serif. This settles the caution flagged under decision 23:
**the sportsbook type stack does not carry over to the landing page.** Either
identify the actual face from the source file or choose a deliberate match.

**Brand lineage worth naming:** green + gold + red flag on an engraved serif is
unmistakably Masters-derived. That is a gift, because it points the landing page
at *tournament-classic* — engraved, ceremonial, restrained — rather than
modern-sportsbook. It also supplies a far better reference than any of the
resort sites reviewed in Item 2: the Masters' own site is famously austere. The
lineage aligns exactly with decision 2 (ceremony, not persuasion) and with the
Ohoopee finding that restraint is the exclusivity signal.

**Amends decision 8.** The map section should not be a generic vector map. The
logo already contains a Missouri silhouette, so the location section plots the
three courses on **the brand's own geometry** — the same state shape, at a
larger scale, with three pins instead of one. The mark becomes the map, and the
map becomes a section. Strictly better than the original recommendation.

#### 3.3 Old Kinderhook aerial — the hero image

A wide fisheye drone shot: curved horizon, sky across roughly the top third,
clubhouse and the Lake of the Ozarks in the mid-distance, fairways and cart
paths sweeping through the foreground, a road bisecting the frame.

**Why it works.** The curved horizon is genuinely distinctive and reads as
authored rather than licensed. The sky band is natural negative space for the
wordmark, and the curve frames a centred mark. It also confirms the venue:
**Old Kinderhook, Camdenton, Missouri, at the Lake of the Ozarks** — real
location data for the Announcement beat and the map.

**Treatment required.** The photo's greens are bright and saturated; the logo's
green is deep forest. Ungraded, the two will not sit together. Grade it down —
desaturate, deepen the greens, pull the highlights — then apply the film grain
from decision 24. This is also what lets a bright daylight photo carry a
cinematic register.

**Two flags:**

1. **Rights.** The image is watermarked *Shawn Kober Photography* in the bottom
   right. Using it needs either permission or a clean licensed copy. This is
   worth settling before anyone builds against it, not after.
2. **The watermark sits in the bottom-right corner**, which is exactly where a
   full-bleed hero gets cropped hardest on mobile. Even with permission, a
   clean copy is the better input.

**Interaction with decisions 13, 14 and 22.** If no prior-year footage arrives
(decision 22), this still becomes the hero and the design resolves as
**typographic over photograph** rather than cinematic video — which decision 14
already prefers for v1 anyway. The wordmark-split move (decision 13) works
particularly well here: "OZARK / OPEN" parting to reveal the course behind it.

#### 3.4 Pace of Play Awareness Month — the sponsor strip

A parody awareness-ribbon badge: circular, pale mint field, mid-green ribbon,
black "PACE OF PLAY" with "AWARENESS MONTH" curved along the bottom. The Ozark
Open is a sponsor.

**Amends decision 4.** The three-beat structure gains a thin divider between
beats B and C. It is **a strip, not a beat** — full-bleed, short, quiet.

```
Beat A  The Announcement
Beat B  The Card
  ─────  Pace of Play sponsor strip  ─────
Beat C  Entry
```

**Play it completely straight.** Golf tournaments have sponsor bars; rendering
this one with a deadpan sponsor treatment is what makes the joke land. Winking
at it kills it. This also satisfies the DS voice rule directly: *"Inside jokes
are welcome in copy (fraternity crowd) but the UI itself stays sharp, not
jokey."* The strip is the one place humour lives on this page.

**Two craft notes:**

- The badge introduces a **third green** — its pale mint field and mid-green
  ribbon match neither the logo's forest green nor anything in the DS. Either
  recolour it to the brand green, or keep the strip small and quiet on cream so
  the mismatch never reads as a clash.
- The curved "AWARENESS MONTH" lettering **goes illegible below roughly 80px**.
  The strip should pair the badge with separately set type rather than relying
  on the badge's own lettering to carry the line. It also needs real alt text,
  since the joke is the content.

#### 3.5 Still needed

1. **The binaries themselves**, committed to `public/tournament/`. Nothing here can be built until the files exist in the repo.
2. **Exact hex values** from the source files, especially whether the tournament gold is `#FDDA00`. Load-bearing per §3.2.
3. **The wordmark's typeface**, identified or deliberately matched.
4. ~~Clearance on the aerial~~ — settled (Item 5.3). An unwatermarked master is
   still preferable if one exists.
5. **Logo file format** — the variants should be SVG. If they only exist as raster, that is a problem for the entry gate and the sticky header.

---

### Item 4 — The card: three days, three courses (Aug 25, 2026)

The content for beat B, supplied by Andrew. Days of week verified against the
calendar; venue towns verified against the courses' own listings.

| Round | Day | Date | Course | Town | Format |
|---|---|---|---|---|---|
| 1 | Thursday | Sept 24, 2026 | Old Kinderhook Golf Club | Camdenton, MO | *TBD* |
| 2 | Friday | Sept 25, 2026 | Bear Creek Valley Golf Club | Osage Beach, MO | *TBD* |
| 3 | Saturday | Sept 26, 2026 | Osage National Golf Course | Lake Ozark, MO | *TBD* |

Dates match PRD §1 (Sept 24–26, 2026). **The Format column is the one piece
still missing** — Item 2 established that beat B is about the golf (stroke play,
scramble, and so on), and the scorecard cannot be built without it.

**Naming.** Andrew wrote "Osage national golf course"; the venue trades as
**Osage National Golf Resort** (PGA lists it as Osage National Golf Club). On a
page whose whole register is engraved and ceremonial, the venue names should be
their real, correct forms. Worth confirming which name to set for each of the
three.

#### 4.1 Thursday / Friday / Saturday is a typographic gift

The three rounds fall on consecutive days with three-letter abbreviations of
equal visual weight. Set `THU · FRI · SAT` in tabular figures and the scorecard
gets a natural rhythm down the left edge, with the numerals `24 · 25 · 26`
running in lockstep beside them. The DS already mandates tabular figures, so
this costs nothing and is the kind of detail that makes the section feel set
rather than laid out.

**Column widths to plan for.** The venue names are long and uneven (17 to 27
characters). On mobile they are the widest cell by a wide margin and will drive
the layout. Expect the course name to want its own line under the round, with
day/date/format on a tighter row above or below it.

#### 4.2 The three courses are too close together for a state map

**This amends the amended decision 8.** All three venues sit within the Lake of
the Ozarks, spanning roughly 13 miles as the crow flies:

Camdenton → Osage Beach → Lake Ozark, running southwest to northeast along the
lake. Missouri is about 285 miles wide, so at state scale the three courses are
inside ~5% of the silhouette's width. On a 400px-wide state outline the pins
land roughly 18px apart. **They collapse into a single dot, and their labels
collide outright.** Item 3.2's idea of reusing the logo's Missouri silhouette as
the map is therefore not buildable as stated.

Two ways out, in order of preference:

1. **Draw the lake, not the state.** The Lake of the Ozarks has an unmistakable
   serpentine shape that anyone who has been there recognises instantly. Three
   pins sit comfortably on it at any size, the labels have room, and it reads as
   *"we know this place"* rather than *"we are in Missouri."* It also gives the
   page two map scales that work together rather than competing: **the logo says
   Missouri, the map says the Lake.**
2. **State silhouette with an inset.** Keep the logo's geometry, add a zoomed
   detail of the lake region carrying the three pins. Preserves the brand echo
   but is two drawings instead of one, and the inset is the part anyone actually
   reads.

Option 1 is the stronger design and the simpler build. Option 2 only wins if the
brand echo turns out to matter more than legibility, which is unlikely on a
section whose entire job is telling people where they are going.

**Resolves open question 11.**

---

### Item 5 — The theme track, and two content decisions (Aug 25, 2026)

#### 5.1 The track is in the repo

**`public/tournament/ozark-open-theme.mp3`** — the first landing-page asset
actually committed rather than described.

| Property | Value |
|---|---|
| Duration | **3:48** (228.7s) |
| Encoding | MPEG-1 Layer III, VBR averaging 189 kbps |
| Sample rate / channels | 48 kHz stereo |
| Size | 5.4 MB |
| Provenance | Generated with Suno, 2026-06-08 (per the file's ID3 comment) |

Committing a 5.4 MB binary is consistent with the repo's existing practice —
`public/celebration/great-job.mp4` is already tracked — and with CLAUDE.md's
"simplest thing that works." Re-encoding to ~96 kbps stereo would save roughly
2.7 MB, but the track loads **after** the entry tap and so never touches LCP,
which makes the saving close to worthless. Ship it as supplied.

**Implementation notes:**

- `preload="none"`. The file must not be fetched until the entry tap (decision
  19), or it competes with the hero for the first bytes on LTE.
- The audio element lives in a shared layout so it survives the client-side
  navigation to `/login` (decision 21, open question 5).

**3:48 largely settles open question 4.** A visitor who reads the page and logs
in will be gone well before the track ends, so "what happens at the end" is an
edge case, not a design problem. Recommendation: **let it end and stop.** Do not
loop it. Looping a full 3:48 composition is conspicuous in a way looping a short
bed is not, and the seam would land at exactly the moment someone has lingered
long enough to notice.

#### 5.2 Format per round is dropped

Andrew: *"Let's ignore the format per round."*

**Amends decision 6 and beat B.** The scorecard is now schedule only — Round ·
Day · Date · Course · Town — with no Format column. This also retires the Item 2
note that beat B should focus on the tournament format (stroke play, scramble,
and so on); that content is **deferred, not deleted**, and can return as a
column if Andrew wants it later.

Consequence worth noting: the page now says nothing at all about how the golf is
played. That is not a gap so much as a further step toward decision 2 — ceremony,
not explanation. The card announces where everyone will be on three mornings.
People who need to know the format already know it.

#### 5.3 The aerial is cleared

Andrew: *"you can ignore the watermark it is already paid for."* **Resolves open
question 10** — the image is licensed and can be used.

One half of the original note still stands, and it is compositional rather than
legal: the *Shawn Kober Photography* mark is baked into the bottom-right pixels,
which is where a full-bleed hero crops hardest on mobile. If an unwatermarked
master exists it remains the better input. If not, the crop and the type
placement need to account for it, and a photographer credit somewhere on the
page would be a reasonable thing to carry anyway.

---

### Item 6 — Draft 1, built (Aug 25, 2026)

The first build of the approved direction. Files: `app/page.tsx`,
`components/landing/entry-gate.tsx`, `components/landing/tournament-mark.tsx`,
and a `.ozk`-scoped block appended to `app/globals.css`.

**What is real in this draft**

| Decision | Built as |
|---|---|
| 1, 23 (brand boundary) | Every tournament token is scoped under `.ozk`. Nothing touches `:root`, so the sportsbook palette is untouched and the boundary cannot leak. |
| 4 (three beats) | Announcement, card, sponsor strip, entry. |
| 5 ("5th Annual") | Set as a gold eyebrow above the wordmark. |
| 6 (scorecard) | A real `<table>`, tabular figures, sparse rules, stacking to one column under 640px where the venue name would otherwise drive the layout. |
| 9 (cut explainers) | Gone. "No house, no rake, no profit." survives as the lead-in above the CTA. |
| 10 (CTA is a door) | Its own full viewport, gold once, at the end. |
| 11, 13 (expansion without hijack) | `animation-timeline: scroll(root)` parts the wordmark, `view()` reveals sections. No scroll listeners, no animation dependency, all inside `@supports` and `prefers-reduced-motion: no-preference`. |
| 16 (reduced motion as a poster) | Opt-in: the base CSS is the finished composition and motion is added on top. |
| 17 (no chrome on the hero) | `body:has(.ozk) header { display: none }`. No JS, no layout change. |
| 18, 19, 20 (audio) | Tap-to-enter gate as a real `<button>`, so keyboard activation unlocks audio too. Persistent equalizer toggle, `localStorage` mute memory, `preload="none"`. |
| 21 (full track) | The committed 3:48 file, no loop, `onEnded` resets the toggle. |
| 24 (grain) | Fixed, `pointer-events: none`, 3.5%. |

**Deliberate deviations from `design-taste-frontend`, each with cause**

1. **Centered hero** despite the anti-center bias. The skill's own exception is the editorial / launch-announcement brief where the message is the design, which is this page exactly.
2. **Single theme, dark.** The skill calls dark mode mandatory; it also defers to a brand that insists on one mode. The sportsbook is light-only by design and the tournament page is its dark counterpart. Page Theme Lock is satisfied: one theme, no section inverts.
3. **A serif display face.** The skill treats serif as a strong default-reach tell. The exception it names is a brand brief that is genuinely heritage or ceremonial, which the engraved wordmark makes true. Cormorant Garamond stands in until the real face is identified. Not Fraunces, not Instrument Serif.
4. **No CTA in the hero.** Decision 10 puts the only action at the end on purpose. The skill's rule protects conversion for strangers; this page has 32 invited members.

**Resolves open question 7.** The em-dash ban is adopted for page copy. Nothing rendered on `/` contains an em-dash or en-dash. The date reads "September 24-26, 2026" with a hyphen. This applies to page copy only, not to these docs or the app.

**What is still standing in**

- **No aerial.** The photo is a CSS `background-image` at `public/tournament/old-kinderhook-aerial.jpg`, deliberately not `<Image>`: a missing background degrades to the green ground instead of a broken image box. Drop the file at that path and the hero lights up with no code change.
- **Placeholder mark.** A pin, flag and cup in three primitives. Not an attempt to trace Missouri freehand, which would look worse than nothing. Swap for the real logo.
- **Provisional colours.** Read from the logo art, not sampled. One line each in `app/globals.css`.
- **No map.** Amended decision 8 wants the Lake drawn. Deferred rather than faked: an inaccurate freehand Lake of the Ozarks would be worse than none, and it needs real geodata. The card's town column carries "where" for now.
- **No sponsor badge art.** The strip is type only until the badge lands.
- **Audio still stops at `/login`.** Open question 5 is unchanged: keeping it alive needs the element hoisted into a shared layout.

**Verified:** `npm run build` clean, `npm run lint` clean, 397 unit tests pass, and the page was rendered in a real browser at 1440x900 and 390x844. Three defects were found that way and fixed: the wordmark's descender collided with the line beneath it (fixed by setting it uppercase, which also matches the logo's small caps), the scrim was heavy enough to hide the photo entirely, and the CTA overflowed the viewport on a phone.

#### Item 6 addendum, same day: the expansion, the mark, the handoff

Three corrections after Andrew reviewed draft 1.

**The scroll expansion was missing, and that was a miss, not a blocker.** Draft
1 shipped the wordmark parting and a scale-settle on the background, but not
the reference pattern's actual signature: the media growing from a card to full
bleed. Built now. `.ozk-hero` is a 220vh section containing a sticky stage; the
media and its scrim scale from `0.44` to `1` across the first 110vh of scroll,
driven by `animation-timeline: scroll(root)`. Measured in a browser at three
scroll positions: 634px wide, then 997px, then 1440px. The mark, eyebrow and
date lines fade out over the first 70vh so the media is alone by the time it
fills the screen. Still no scroll hijacking and still no JS.

The card's shadow is deliberately static rather than animated: while the media
is small the shadow reads, and once it reaches full bleed the shadow falls
outside the stage and is clipped. Same effect, no per-frame repaint.

**The mark is now wired to the real logo.** It is an `<object>` pointing at
`public/tournament/ozark-open-logo.svg` with the drawn stand-in as its child.
`<object>` renders children only when the resource fails to load, so the real
logo takes over the moment the file exists, with no JavaScript and no
broken-image icon. (A replaced element with `width: auto` defaults to a 300px
box, which floated the mark off-centre; both dimensions are explicit now.)

**Beat C is now the sportsbook, on purpose.** Andrew: the tagline is *"Join the
Sportsbook"*, the button is just *"Log In"*, and the section should carry
sportsbook branding. So the page changes brand exactly once, at the end: the
ground goes from forest green to indigo `#312F8C`, the real `/ozark-mark.svg`
appears, and the type switches to Azalea. This is not a section wandering off
palette, it is the doorway: you walk from the clubhouse into the book. The
taste skill permits exactly one deliberate colour-block switch per page and
this is it. **Gold is what carries across** the boundary, which is the argument
Item 3.2 made for confirming the tournament gold really is `#FDDA00`.

**Still blocked on files, not decisions.** The aerial and the logos have only
ever arrived as chat attachments, which reach the model as images but never
touch the filesystem. The theme mp3 worked because it was attached as a path.
Both hero and mark are wired to their eventual paths and will light up on drop:

- `public/tournament/old-kinderhook-aerial.jpg`
- `public/tournament/ozark-open-logo.svg`

Until the aerial exists the fully expanded hero is an empty green field, which
is the expansion working with nothing to reveal.

---

## Open questions

Carried forward until answered. The Item 1 questions are now mostly resolved by
Item 2; what remains is listed here.

1. **Adopt or borrow the Item 1 hero?** Resolved in principle by decision 11 —
   the *choreography* is adopted, the *implementation* is not. Still open: does
   the media that expands hold footage (decision 22) or typography?
2. **Client JS budget.** Decision 11 prefers CSS scroll-driven animation with no
   dependency. Only if that proves insufficient does decision 12 apply. Not yet
   tested against a real composition.
3. **What is the tournament brand?** Largely answered by Item 3 — forest green,
   gold, engraved serif, Masters lineage. Still open: exact hex values, the
   wordmark's typeface, and whether the tournament gold is the sportsbook's
   `#FDDA00` (which decides whether gold bridges the two brands).
4. ~~What happens when the theme track ends~~ — **settled in Item 5.1.** The
   track is 3:48, longer than any realistic visit; let it end and stop, no loop.
5. **Does the theme survive the route change to `/login`?** Decision 21 requires
   it. Confirm the CTA is client-side navigation and the audio element lives in a
   shared layout, or accept that the music stops at the login page.
6. **Repeat visits.** The full track starting over on every visit may irritate
   rather than delight. Does the entry gate remember that this browser has
   already been let in?
7. ~~The em-dash question~~ — **adopted for page copy (Item 6).** Nothing
   rendered on `/` uses an em-dash or en-dash.
8. **Identifiable faces in footage.** Decision 7 bans names. If prior-year
   footage shows recognisable people, confirm that is still acceptable.
9. **Where does the sportsbook get explained now?** Decision 9 and the Format
   note move that job to after authentication. Nothing behind login currently
   does it. Likely a separate sprint item.
10. ~~Clearance on the aerial~~ — **cleared, it is paid for (Item 5.3).** Still
    open only as craft: is there an unwatermarked master, and does the page
    carry a photographer credit?
11. **Does the Pace of Play badge get recoloured** to the brand's forest green,
    or stay as supplied and sit quietly? See Item 3.4.

---

## Appendix A — Item 1 source, verbatim

Preserved exactly as supplied by 21st.dev's "integrate this component" prompt.
Treat it as reference material to port, not code to paste.

> You are given a task to integrate an existing React component in the codebase
>
> The codebase should support:
> - shadcn project structure
> - Tailwind CSS
> - Typescript
>
> If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.
>
> Determine the default path for components and styles.
> If default path for components is not /components/ui, provide instructions on why it's important to create this folder
> Copy-paste this component to /components/ui folder:

### `scroll-expansion-hero.tsx`

```tsx
'use client';

import {
  useEffect,
  useRef,
  useState,
  ReactNode,
  TouchEvent,
  WheelEvent,
} from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';

interface ScrollExpandMediaProps {
  mediaType?: 'video' | 'image';
  mediaSrc: string;
  posterSrc?: string;
  bgImageSrc: string;
  title?: string;
  date?: string;
  scrollToExpand?: string;
  textBlend?: boolean;
  children?: ReactNode;
}

const ScrollExpandMedia = ({
  mediaType = 'video',
  mediaSrc,
  posterSrc,
  bgImageSrc,
  title,
  date,
  scrollToExpand,
  textBlend,
  children,
}: ScrollExpandMediaProps) => {
  const [scrollProgress, setScrollProgress] = useState<number>(0);
  const [showContent, setShowContent] = useState<boolean>(false);
  const [mediaFullyExpanded, setMediaFullyExpanded] = useState<boolean>(false);
  const [touchStartY, setTouchStartY] = useState<number>(0);
  const [isMobileState, setIsMobileState] = useState<boolean>(false);

  const sectionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setScrollProgress(0);
    setShowContent(false);
    setMediaFullyExpanded(false);
  }, [mediaType]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (mediaFullyExpanded && e.deltaY < 0 && window.scrollY <= 5) {
        setMediaFullyExpanded(false);
        e.preventDefault();
      } else if (!mediaFullyExpanded) {
        e.preventDefault();
        const scrollDelta = e.deltaY * 0.0009;
        const newProgress = Math.min(
          Math.max(scrollProgress + scrollDelta, 0),
          1
        );
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setMediaFullyExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      setTouchStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartY) return;

      const touchY = e.touches[0].clientY;
      const deltaY = touchStartY - touchY;

      if (mediaFullyExpanded && deltaY < -20 && window.scrollY <= 5) {
        setMediaFullyExpanded(false);
        e.preventDefault();
      } else if (!mediaFullyExpanded) {
        e.preventDefault();
        // Increase sensitivity for mobile, especially when scrolling back
        const scrollFactor = deltaY < 0 ? 0.008 : 0.005; // Higher sensitivity for scrolling back
        const scrollDelta = deltaY * scrollFactor;
        const newProgress = Math.min(
          Math.max(scrollProgress + scrollDelta, 0),
          1
        );
        setScrollProgress(newProgress);

        if (newProgress >= 1) {
          setMediaFullyExpanded(true);
          setShowContent(true);
        } else if (newProgress < 0.75) {
          setShowContent(false);
        }

        setTouchStartY(touchY);
      }
    };

    const handleTouchEnd = (): void => {
      setTouchStartY(0);
    };

    const handleScroll = (): void => {
      if (!mediaFullyExpanded) {
        window.scrollTo(0, 0);
      }
    };

    window.addEventListener('wheel', handleWheel as unknown as EventListener, {
      passive: false,
    });
    window.addEventListener('scroll', handleScroll as EventListener);
    window.addEventListener(
      'touchstart',
      handleTouchStart as unknown as EventListener,
      { passive: false }
    );
    window.addEventListener(
      'touchmove',
      handleTouchMove as unknown as EventListener,
      { passive: false }
    );
    window.addEventListener('touchend', handleTouchEnd as EventListener);

    return () => {
      window.removeEventListener(
        'wheel',
        handleWheel as unknown as EventListener
      );
      window.removeEventListener('scroll', handleScroll as EventListener);
      window.removeEventListener(
        'touchstart',
        handleTouchStart as unknown as EventListener
      );
      window.removeEventListener(
        'touchmove',
        handleTouchMove as unknown as EventListener
      );
      window.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [scrollProgress, mediaFullyExpanded, touchStartY]);

  useEffect(() => {
    const checkIfMobile = (): void => {
      setIsMobileState(window.innerWidth < 768);
    };

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const mediaWidth = 300 + scrollProgress * (isMobileState ? 650 : 1250);
  const mediaHeight = 400 + scrollProgress * (isMobileState ? 200 : 400);
  const textTranslateX = scrollProgress * (isMobileState ? 180 : 150);

  const firstWord = title ? title.split(' ')[0] : '';
  const restOfTitle = title ? title.split(' ').slice(1).join(' ') : '';

  return (
    <div
      ref={sectionRef}
      className='transition-colors duration-700 ease-in-out overflow-x-hidden'
    >
      <section className='relative flex flex-col items-center justify-start min-h-[100dvh]'>
        <div className='relative w-full flex flex-col items-center min-h-[100dvh]'>
          <motion.div
            className='absolute inset-0 z-0 h-full'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 - scrollProgress }}
            transition={{ duration: 0.1 }}
          >
            <Image
              src={bgImageSrc}
              alt='Background'
              width={1920}
              height={1080}
              className='w-screen h-screen'
              style={{
                objectFit: 'cover',
                objectPosition: 'center',
              }}
              priority
            />
            <div className='absolute inset-0 bg-black/10' />
          </motion.div>

          <div className='container mx-auto flex flex-col items-center justify-start relative z-10'>
            <div className='flex flex-col items-center justify-center w-full h-[100dvh] relative'>
              <div
                className='absolute z-0 top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-none rounded-2xl'
                style={{
                  width: `${mediaWidth}px`,
                  height: `${mediaHeight}px`,
                  maxWidth: '95vw',
                  maxHeight: '85vh',
                  boxShadow: '0px 0px 50px rgba(0, 0, 0, 0.3)',
                }}
              >
                {mediaType === 'video' ? (
                  mediaSrc.includes('youtube.com') ? (
                    <div className='relative w-full h-full pointer-events-none'>
                      <iframe
                        width='100%'
                        height='100%'
                        src={
                          mediaSrc.includes('embed')
                            ? mediaSrc +
                              (mediaSrc.includes('?') ? '&' : '?') +
                              'autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1'
                            : mediaSrc.replace('watch?v=', 'embed/') +
                              '?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&rel=0&disablekb=1&modestbranding=1&playlist=' +
                              mediaSrc.split('v=')[1]
                        }
                        className='w-full h-full rounded-xl'
                        frameBorder='0'
                        allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
                        allowFullScreen
                      />
                      <div
                        className='absolute inset-0 z-10'
                        style={{ pointerEvents: 'none' }}
                      ></div>

                      <motion.div
                        className='absolute inset-0 bg-black/30 rounded-xl'
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 0.5 - scrollProgress * 0.3 }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  ) : (
                    <div className='relative w-full h-full pointer-events-none'>
                      <video
                        src={mediaSrc}
                        poster={posterSrc}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload='auto'
                        className='w-full h-full object-cover rounded-xl'
                        controls={false}
                        disablePictureInPicture
                        disableRemotePlayback
                      />
                      <div
                        className='absolute inset-0 z-10'
                        style={{ pointerEvents: 'none' }}
                      ></div>

                      <motion.div
                        className='absolute inset-0 bg-black/30 rounded-xl'
                        initial={{ opacity: 0.7 }}
                        animate={{ opacity: 0.5 - scrollProgress * 0.3 }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                  )
                ) : (
                  <div className='relative w-full h-full'>
                    <Image
                      src={mediaSrc}
                      alt={title || 'Media content'}
                      width={1280}
                      height={720}
                      className='w-full h-full object-cover rounded-xl'
                    />

                    <motion.div
                      className='absolute inset-0 bg-black/50 rounded-xl'
                      initial={{ opacity: 0.7 }}
                      animate={{ opacity: 0.7 - scrollProgress * 0.3 }}
                      transition={{ duration: 0.2 }}
                    />
                  </div>
                )}

                <div className='flex flex-col items-center text-center relative z-10 mt-4 transition-none'>
                  {date && (
                    <p
                      className='text-2xl text-blue-200'
                      style={{ transform: `translateX(-${textTranslateX}vw)` }}
                    >
                      {date}
                    </p>
                  )}
                  {scrollToExpand && (
                    <p
                      className='text-blue-200 font-medium text-center'
                      style={{ transform: `translateX(${textTranslateX}vw)` }}
                    >
                      {scrollToExpand}
                    </p>
                  )}
                </div>
              </div>

              <div
                className={`flex items-center justify-center text-center gap-4 w-full relative z-10 transition-none flex-col ${
                  textBlend ? 'mix-blend-difference' : 'mix-blend-normal'
                }`}
              >
                <motion.h2
                  className='text-4xl md:text-5xl lg:text-6xl font-bold text-blue-200 transition-none'
                  style={{ transform: `translateX(-${textTranslateX}vw)` }}
                >
                  {firstWord}
                </motion.h2>
                <motion.h2
                  className='text-4xl md:text-5xl lg:text-6xl font-bold text-center text-blue-200 transition-none'
                  style={{ transform: `translateX(${textTranslateX}vw)` }}
                >
                  {restOfTitle}
                </motion.h2>
              </div>
            </div>

            <motion.section
              className='flex flex-col w-full px-8 py-10 md:px-16 lg:py-20'
              initial={{ opacity: 0 }}
              animate={{ opacity: showContent ? 1 : 0 }}
              transition={{ duration: 0.7 }}
            >
              {children}
            </motion.section>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ScrollExpandMedia;
```

### `demo.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import ScrollExpandMedia from '@/components/blocks/scroll-expansion-hero';

interface MediaAbout {
  overview: string;
  conclusion: string;
}

interface MediaContent {
  src: string;
  poster?: string;
  background: string;
  title: string;
  date: string;
  scrollToExpand: string;
  about: MediaAbout;
}

interface MediaContentCollection {
  [key: string]: MediaContent;
}

const sampleMediaContent: MediaContentCollection = {
  video: {
    src: 'https://me7aitdbxq.ufs.sh/f/2wsMIGDMQRdYuZ5R8ahEEZ4aQK56LizRdfBSqeDMsmUIrJN1',
    poster:
      'https://images.pexels.com/videos/5752729/space-earth-universe-cosmos-5752729.jpeg',
    background:
      'https://me7aitdbxq.ufs.sh/f/2wsMIGDMQRdYMNjMlBUYHaeYpxduXPVNwf8mnFA61L7rkcoS',
    title: 'Immersive Video Experience',
    date: 'Cosmic Journey',
    scrollToExpand: 'Scroll to Expand Demo',
    about: {
      overview:
        'This is a demonstration of the ScrollExpandMedia component with a video. As you scroll, the video expands to fill more of the screen, creating an immersive experience. This component is perfect for showcasing video content in a modern, interactive way.',
      conclusion:
        'The ScrollExpandMedia component provides a unique way to engage users with your content through interactive scrolling. Try switching between video and image modes to see different implementations.',
    },
  },
  image: {
    src: 'https://images.unsplash.com/photo-1682687982501-1e58ab814714?q=80&w=1280&auto=format&fit=crop',
    background:
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1920&auto=format&fit=crop',
    title: 'Dynamic Image Showcase',
    date: 'Underwater Adventure',
    scrollToExpand: 'Scroll to Expand Demo',
    about: {
      overview:
        'This is a demonstration of the ScrollExpandMedia component with an image. The same smooth expansion effect works beautifully with static images, allowing you to create engaging visual experiences without video content.',
      conclusion:
        'The ScrollExpandMedia component works equally well with images and videos. This flexibility allows you to choose the media type that best suits your content while maintaining the same engaging user experience.',
    },
  },
};

const MediaContent = ({ mediaType }: { mediaType: 'video' | 'image' }) => {
  const currentMedia = sampleMediaContent[mediaType];

  return (
    <div className='max-w-4xl mx-auto'>
      <h2 className='text-3xl font-bold mb-6 text-black dark:text-white'>
        About This Component
      </h2>
      <p className='text-lg mb-8 text-black dark:text-white'>
        {currentMedia.about.overview}
      </p>

      <p className='text-lg mb-8 text-black dark:text-white'>
        {currentMedia.about.conclusion}
      </p>
    </div>
  );
};

export const VideoExpansionTextBlend = () => {
  const mediaType = 'video';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        posterSrc={currentMedia.poster}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
        textBlend
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

export const ImageExpansionTextBlend = () => {
  const mediaType = 'image';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
        textBlend
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

export const VideoExpansion = () => {
  const mediaType = 'video';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        posterSrc={currentMedia.poster}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

export const ImageExpansion = () => {
  const mediaType = 'image';
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, []);

  return (
    <div className='min-h-screen'>
      <ScrollExpandMedia
        mediaType={mediaType}
        mediaSrc={currentMedia.src}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
      >
        <MediaContent mediaType={mediaType} />
      </ScrollExpandMedia>
    </div>
  );
};

const Demo = () => {
  const [mediaType, setMediaType] = useState('video');
  const currentMedia = sampleMediaContent[mediaType];

  useEffect(() => {
    window.scrollTo(0, 0);

    const resetEvent = new Event('resetSection');
    window.dispatchEvent(resetEvent);
  }, [mediaType]);

  return (
    <div className='min-h-screen'>
      <div className='fixed top-4 right-4 z-50 flex gap-2'>
        <button
          onClick={() => setMediaType('video')}
          className={`px-4 py-2 rounded-lg ${
            mediaType === 'video'
              ? 'bg-white text-black'
              : 'bg-black/50 text-white border border-white/30'
          }`}
        >
          Video
        </button>

        <button
          onClick={() => setMediaType('image')}
          className={`px-4 py-2 rounded-lg ${
            mediaType === 'image'
              ? 'bg-white text-black'
              : 'bg-black/50 text-white border border-white/30'
          }`}
        >
          Image
        </button>
      </div>

      <ScrollExpandMedia
        mediaType={mediaType as 'video' | 'image'}
        mediaSrc={currentMedia.src}
        posterSrc={mediaType === 'video' ? currentMedia.poster : undefined}
        bgImageSrc={currentMedia.background}
        title={currentMedia.title}
        date={currentMedia.date}
        scrollToExpand={currentMedia.scrollToExpand}
      >
        <MediaContent mediaType={mediaType as 'video' | 'image'} />
      </ScrollExpandMedia>
    </div>
  );
};

export default Demo;
```

### Vendor integration instructions (verbatim)

> Install NPM dependencies:
> ```bash
> framer-motion
> ```
>
> Implementation Guidelines
>  1. Analyze the component structure and identify all required dependencies
>  2. Review the component's argumens and state
>  3. Identify any required context providers or hooks and install them
>  4. Questions to Ask
>  - What data/props will be passed to this component?
>  - Are there any specific state management requirements?
>  - Are there any required assets (images, icons, etc.)?
>  - What is the expected responsive behavior?
>  - What is the best place to use this component in the app?
>
> Steps to integrate
>  0. Copy paste all the code above in the correct directories
>  1. Install external dependencies
>  2. Fill image assets with Unsplash stock images you know exist
>  3. Use lucide-react icons for svgs or logos if component requires them
