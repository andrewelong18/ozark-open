"use client"

import * as React from "react"

/**
 * The entry gate, and the only client JS on the landing page.
 *
 * Why a gate at all: browsers will not autoplay audio without a user gesture,
 * and scroll is explicitly NOT a gesture (only click, keydown, pointerdown,
 * pointerup and touchend count). "The theme plays on landing" is therefore
 * impossible on first load. Rather than fight that, the gate turns the
 * restriction into the ceremony: one tap starts the theme and opens the page.
 * See docs/LANDING_PAGE_OVERHAUL.md decisions 18 and 19.
 *
 * The track is the full 3:48 cut and does not loop. It is long enough that a
 * visitor who reads the page and logs in never reaches the end, so looping
 * would only ever be heard by someone who lingered, and a full composition's
 * loop seam is conspicuous (decision 21 / Item 5.1).
 *
 * KNOWN GAP: the audio element unmounts on navigation to /login, so the theme
 * stops at the login page. Keeping it alive across that route change means
 * hoisting it into a shared layout. Open question 5.
 */

const THEME_SRC = "/tournament/ozark-open-theme.mp3"
const MUTE_KEY = "ozk-muted"

export function EntryGate({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [playing, setPlaying] = React.useState(false)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  // Whether this browser previously turned the sound off. Read at the moment
  // of the tap rather than held in state: it is only ever needed then, so
  // there is nothing to synchronise and no server/client mismatch to manage.
  // Private mode and blocked storage both fall through to "not muted".
  function isMuted() {
    try {
      return window.localStorage.getItem(MUTE_KEY) === "1"
    } catch {
      return false
    }
  }

  function enter() {
    setOpen(true)
    if (isMuted()) return
    void start()
  }

  async function start() {
    const el = audioRef.current
    if (!el) return
    try {
      await el.play()
      setPlaying(true)
    } catch {
      // The gesture can still be refused (a browser-level site mute, for
      // instance). The page opens regardless; the toggle stays available.
      setPlaying(false)
    }
  }

  function toggle() {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      setPlaying(false)
      persist(true)
    } else {
      void start()
      persist(false)
    }
  }

  function persist(next: boolean) {
    try {
      window.localStorage.setItem(MUTE_KEY, next ? "1" : "0")
    } catch {
      // Not worth failing the interaction over.
    }
  }

  return (
    <>
      {/* preload="none" matters: without it the browser starts fetching 5.4MB
          while the hero is still competing for the first bytes on a phone. */}
      <audio
        ref={audioRef}
        src={THEME_SRC}
        preload="none"
        onEnded={() => setPlaying(false)}
      />

      {/* A real <button>, so Enter and Space open the page and the gate is
          reachable by keyboard. Those are activation-triggering events too,
          so the audio unlocks the same way a tap would. */}
      <button
        type="button"
        className="ozk-gate"
        data-open={open}
        aria-hidden={open}
        tabIndex={open ? -1 : 0}
        onClick={enter}
      >
        <span>
          <span className="ozk-eyebrow">5th Annual</span>
          <span className="ozk-display ozk-wordmark" aria-hidden>
            <span className="ozk-word">Ozark</span>
            <span className="ozk-word">Open</span>
          </span>
          <span className="ozk-gate-knock">Tap to enter</span>
        </span>
      </button>

      {open ? (
        <button
          type="button"
          className="ozk-sound"
          data-playing={playing}
          onClick={toggle}
          aria-pressed={playing}
          aria-label={playing ? "Turn the theme off" : "Turn the theme on"}
        >
          <span />
          <span />
          <span />
        </button>
      ) : null}

      {children}
    </>
  )
}
