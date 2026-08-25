/**
 * PLACEHOLDER MARK. Swap for the real tournament logo.
 *
 * The real logo is a Missouri silhouette with a flagstick planted at the Lake
 * of the Ozarks, over an engraved small-caps wordmark (Item 3.2). It arrived
 * as a chat attachment and was never written to disk, so this stands in until
 * `public/tournament/ozark-open-mark.svg` exists.
 *
 * Deliberately just a pin, a flag and a cup: three primitives, no attempt to
 * trace the state outline freehand. A badly drawn Missouri would be worse
 * than no Missouri.
 */
export function TournamentMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 80"
      className={className}
      role="img"
      aria-label="Ozark Open"
      fill="none"
    >
      <path d="M26 66V8" stroke="var(--ozk-gold)" strokeWidth="4.5" strokeLinecap="square" />
      <path d="M28 8h22l-4.5 10 4.5 10H28z" fill="#c8102e" />
      <ellipse cx="26" cy="67" rx="12" ry="5" stroke="var(--ozk-gold)" strokeWidth="4.5" />
    </svg>
  )
}
