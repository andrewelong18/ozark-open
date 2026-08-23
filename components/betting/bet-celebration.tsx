"use client"

import * as React from "react"
import { createPortal } from "react-dom"

// The payoff for placing a wager (Sprint 12, #164). A small card is tossed onto
// the screen, a 1.6s clip plays with sound, and it leaves on its own. Nothing to
// dismiss, nothing to click.
//
// The gold `animate-stake-flash` ring on the stake input and the "✓ Locked in"
// receipt are still the *informational* confirmation; this sits on top of them
// and is purely the celebration.
//
// FOUR things about this component are non-obvious, and all four are the
// difference between working and half-working. Number 4 is there because it
// SHIPPED broken: the clip played and nothing appeared.
//
// 1. THE <video> NEVER UNMOUNTS. Every other transient surface in this app
//    (BetErrorToast, Collapse) latches its content and unmounts on
//    animationend. This one cannot, and the reason is autoplay policy: a media
//    element earns the right to play programmatically by having been played
//    during a user gesture, and that right belongs to the ELEMENT. A freshly
//    mounted <video> has never been touched by a gesture, so it would be
//    blocked every time. So the element lives for the life of the page and a
//    three-state machine drives its wrapper instead. Hidden means opacity-0 +
//    inert, NEVER display:none — a display:none element is refused playback.
//
// 2. PLAYBACK IS ARMED IN THE CLICK, NOT AFTER THE AWAIT. arm() runs
//    synchronously inside the "Confirm bet" handler, before the fetch; by the
//    time the API confirms, the gesture is long gone and an audible play()
//    would be refused on iOS Safari and unreliable on Chrome's MEI heuristic.
//    Arming does a muted play/pause, which both unlocks the element and warms
//    the buffer so the clip starts on the first frame it is asked to.
//
// 3. NOTHING HERE EVER TAKES A POINTER EVENT. Every layer is
//    pointer-events-none, and there is no scrim. Someone tapping stakes into
//    thirteen bets must not be interrupted by their own confirmation — and
//    Playwright's actionability check would fail the moment a centred overlay
//    could intercept a click, which is what would break placement.spec.ts,
//    rules-gauntlet.spec.ts, on-behalf.spec.ts and mobile-journey.spec.ts.
//
// 4. IT PORTALS TO document.body, AND THAT IS A BUG FIX, NOT TIDINESS. This
//    shipped rendering in place inside BetsMenu, which lives inside
//    `<div data-enter-stagger>` on /bets — and that column runs `rise-in`,
//    which animates a TRANSFORM. A transformed element becomes the containing
//    block for its `position: fixed` descendants, so `fixed inset-0` sized
//    itself to a 3000px-tall column instead of the viewport and centred the
//    card somewhere far below the fold. The clip played; nobody saw it.
//
//    app/bets/page.tsx already carries a comment warning about exactly this —
//    it is why BetSlipSummary is a child of the GRID and not of the staggered
//    column. Rendering here in place walked straight into it.
//
//    A portal is the structural answer rather than a workaround: attached to
//    document.body there is no ancestor left that can hijack the containing
//    block, establish a stacking context, clip with overflow, or apply a
//    filter. Do not "simplify" this back into the tree.
//
// Reduced motion needs no branch here, deliberately. The blanket floor in
// globals.css flattens the pop and the rotation to 0.01ms, which leaves a plain
// appear/disappear — the calm version sprint-12's "Done when" asks for. The
// clip itself still plays: it is content the user asked for by placing a bet,
// not ambient motion. That the floor gives us this for free is worth knowing
// before someone "fixes" it with a useReducedMotion hook.

/** Ceiling on the hold. `ended` is the real signal and fires at ~1.65s, but a
 * blocked or backgrounded video never fires it at all — this is what stops the
 * card sitting on screen forever in that case. Comfortably clear of the clip. */
const HOLD_FALLBACK_MS = 3000

/** Ceiling on the exit, same belt as BetErrorToast's. If the exit animation is
 * suppressed by something outside our control (a print stylesheet, an
 * extension, a browser that skips animations in a background tab) animationend
 * never arrives and the card would strand mid-fade. */
const EXIT_FALLBACK_MS = 600

/** document.body never changes, so there is nothing to subscribe to; each
 * render re-reads the snapshot anyway. Same helper BetErrorToast uses. */
const subscribeNever = () => () => {}

export type BetCelebrationHandle = {
  /** Call synchronously inside the user's click, before any await. */
  arm: () => void
  /** Call on a confirmed placement. */
  celebrate: () => void
}

type State = "idle" | "open" | "closing"

export function BetCelebration({
  ref,
}: {
  ref: React.Ref<BetCelebrationHandle>
}) {
  const videoRef = React.useRef<HTMLVideoElement>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const [state, setState] = React.useState<State>("idle")
  // Bumped on every celebrate() so the hold timer restarts when a second
  // placement lands on top of a card that is already on screen. Without it
  // setState("open") is a no-op on the second call — same value, no re-render,
  // no new timer — and the restarted clip would be cut short by the first
  // run's fallback.
  const [runId, setRunId] = React.useState(0)

  React.useImperativeHandle(ref, () => ({
    arm() {
      const video = videoRef.current
      if (!video) return
      // Muted, so this is allowed even on a first visit with no media
      // engagement. The pause is immediate — the user never sees or hears it;
      // all we want is the element's unlocked flag and a warm buffer.
      video.muted = true
      void video
        .play()
        .then(() => {
          video.pause()
          video.currentTime = 0
        })
        .catch(() => {
          // Nothing to do. If arming is refused, celebrate() still tries, and
          // still falls back to muted.
        })
    },
    celebrate() {
      const video = videoRef.current
      if (video) {
        video.currentTime = 0
        video.muted = false
        void video.play().catch(() => {
          // Audible autoplay refused. Show the clip silently rather than not
          // at all — the animation is the confirmation, the sound is the bonus.
          video.muted = true
          void video.play().catch(() => {})
        })
      }
      // Restart the entrance even if a card is already on screen. A CSS
      // animation only replays when it is removed and re-added, and the usual
      // React answer (a changing `key`) would remount the <video> and throw
      // away its gesture unlock — see note 1 above. So: force a reflow between
      // clearing the animation and restoring it.
      const card = cardRef.current
      if (card) {
        card.style.animation = "none"
        void card.offsetWidth
        card.style.animation = ""
      }
      setState("open")
      setRunId((n) => n + 1)
    },
  }))

  // The hold. `ended` (below) is the accurate end; this is only the belt.
  React.useEffect(() => {
    if (state !== "open") return
    const id = setTimeout(() => setState("closing"), HOLD_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [state, runId])

  // The exit, belt-and-braces the same way BetErrorToast is.
  React.useEffect(() => {
    if (state !== "closing") return
    const id = setTimeout(() => setState("idle"), EXIT_FALLBACK_MS)
    return () => clearTimeout(id)
  }, [state])

  // Back to rest: stop the clip and rewind, so a card that closed early
  // (fallback timer, or a second placement) doesn't resume mid-yell next time.
  React.useEffect(() => {
    if (state !== "idle") return
    const video = videoRef.current
    if (!video) return
    video.pause()
    video.currentTime = 0
  }, [state])

  const hidden = state === "idle"

  // document.body on the client, null while rendering on the server. Same
  // idiom BetErrorToast uses for its slot: useSyncExternalStore gives the two
  // answers separately without a setState-in-effect, which the lint rules
  // reject. document.body is referentially stable, so this never resubscribes.
  const target = React.useSyncExternalStore(
    subscribeNever,
    () => document.body,
    () => null
  )

  const overlay = (
    <div
      data-testid="bet-celebration"
      data-state={state}
      // No scrim, and pointer-events-none the whole way down. See note 3.
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center"
      // inert while resting keeps the always-mounted <video> out of the
      // accessibility tree and out of the tab order between celebrations.
      inert={hidden}
      aria-hidden
    >
      <div
        ref={cardRef}
        onAnimationEnd={(e) => {
          if (e.target !== e.currentTarget) return
          // The enter animation fires this too; only the exit should rest.
          if (state === "closing") setState("idle")
        }}
        className={[
          "pointer-events-none w-[min(58vw,240px)] overflow-hidden rounded-xl bg-surface-card sm:w-[272px]",
          // Gold is the brand's rationed payoff colour, and this is the one
          // moment in the betting path that has earned it.
          "shadow-[0_18px_50px_rgba(31,29,60,0.32)] ring-4 ring-gold-400",
          hidden ? "opacity-0" : "",
          state === "open" ? "animate-celebrate-in" : "",
          state === "closing" ? "animate-celebrate-out" : "",
        ].join(" ")}
      >
        {/* The aspect box is a WRAPPER with the ratio, and the video fills it
            absolutely — rather than `aspect-[676/720]` on the <video> itself.
            `aspect-ratio` on a replaced element that also has its own
            intrinsic ratio is the corner of the spec browsers have disagreed
            about longest, and a video that resolves to zero height is
            invisible while still playing its audio, which is precisely the
            symptom this component already produced once for another reason.
            A plain div with a ratio and an inset-0 child has no such corner.
            676/720 is the source's real aspect after de-letterboxing, so the
            clip fills the card exactly and nothing is cropped twice. */}
        <div className="relative aspect-[676/720] w-full">
          <video
            ref={videoRef}
            src="/celebration/great-job.mp4"
            poster="/celebration/great-job-poster.jpg"
            preload="auto"
            // WITHOUT playsInline iOS Safari takes the clip fullscreen, which
            // is the single loudest way this feature could fail. Not optional.
            playsInline
            // The pre-10 iOS spelling of the same thing. Harmless everywhere
            // else, and the attribute is the only guard old WebKit reads.
            webkit-playsinline="true"
            disablePictureInPicture
            controlsList="nodownload noplaybackrate noremoteplayback"
            onEnded={() => setState("closing")}
            tabIndex={-1}
            aria-hidden
            // pointer-events-none on the element itself, not just the wrapper:
            // it is what kills the media context menu and tap-to-pause. No
            // `controls` anywhere — this is a UI flourish, not a player.
            className="pointer-events-none absolute inset-0 block size-full object-cover"
          />
        </div>
      </div>
    </div>
  )

  // Server render has no document; the client attaches to body. See note 4.
  return target ? createPortal(overlay, target) : null
}
