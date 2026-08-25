/**
 * The awareness ribbon for the Pace of Play sponsor strip.
 *
 * Drawn rather than sourced: the real badge art is not in the repo, and a
 * ribbon is two crossing strokes, which is squarely inside "a single simple
 * geometric mark" rather than an illustration.
 *
 * It is played straight, in the strip's own quiet colour, because the joke is
 * the sponsorship itself. A winking ribbon would step on it.
 */
export function AwarenessRibbon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 30"
      className={className}
      role="img"
      aria-label="Awareness ribbon"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
    >
      {/* The two legs, crossing near the middle and trailing down. */}
      <path d="M9.4 16.6 4.6 28" />
      <path d="M14.6 16.6 19.4 28" />
      {/* The loop: up the left, over the top, down the right, and back across
          so the strands cross where the legs begin. */}
      <path d="M14.6 16.6C14.6 16.6 5.6 9.9 4.9 6.6 4.2 3.2 6.6 1.4 9 1.9c2.4.5 3 3.4 3 5.6" />
      <path d="M9.4 16.6C9.4 16.6 18.4 9.9 19.1 6.6c.7-3.4-1.7-5.2-4.1-4.7-2.4.5-3 3.4-3 5.6" />
    </svg>
  )
}
