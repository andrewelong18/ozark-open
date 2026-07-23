import { chartBars, type StatPoint } from "@/lib/player-profile"
import { cn } from "@/lib/utils"

// The 4-year Ozark Open stats chart inside a player's profile modal (Sprint 18).
// A single-series magnitude-over-time bar chart, so no legend — the heading
// names it. Indigo bars, the member's best year accented in brand gold, values
// labeled in text tokens (never on the mark), a recessive baseline. Hand-rolled
// SVG — no chart dependency. Geometry comes from the tested chartBars() helper.

const VIEW_W = 320
const PLOT_H = 116 // bar area height
const PAD_TOP = 22 // room for the value label above the tallest bar
const PAD_BOTTOM = 22 // room for the year label
const BAR_W = 34
const RADIUS = 4

export function PlayerStatsChart({
  data,
  className,
}: {
  data: StatPoint[]
  className?: string
}) {
  if (data.length === 0) {
    return (
      <div
        className={cn(
          "flex h-32 items-center justify-center rounded-xl border border-dashed border-border text-sm text-text-muted",
          className
        )}
      >
        No history yet.
      </div>
    )
  }

  const bars = chartBars(data, PLOT_H)
  const baselineY = PAD_TOP + PLOT_H
  const totalH = PAD_TOP + PLOT_H + PAD_BOTTOM
  // Even column layout across the fixed viewBox width.
  const step = VIEW_W / bars.length
  const summary = `Ozark Open results by year: ${data
    .map((d) => `${d.year}, ${d.value}`)
    .join("; ")}.`

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${totalH}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={summary}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Recessive baseline */}
      <line
        x1={0}
        y1={baselineY}
        x2={VIEW_W}
        y2={baselineY}
        stroke="var(--border)"
        strokeWidth={1}
      />
      {bars.map((bar) => {
        const cx = step * bars.indexOf(bar) + step / 2
        const x = cx - BAR_W / 2
        const y = baselineY - bar.barHeight
        return (
          <g key={bar.year}>
            <title>{`${bar.year}: ${bar.value}`}</title>
            {/* Rounded top, squared base (anchored to the baseline). */}
            <path
              d={roundedTopBar(x, y, BAR_W, bar.barHeight, RADIUS)}
              fill={bar.best ? "var(--gold-400)" : "var(--indigo-700)"}
            />
            {/* Value label — text token, above the bar, never on the mark. */}
            <text
              x={cx}
              y={y - 7}
              textAnchor="middle"
              className="tabular"
              fontSize={13}
              fontWeight={700}
              fill="var(--text-strong)"
            >
              {bar.value}
            </text>
            {/* Year label */}
            <text
              x={cx}
              y={baselineY + 15}
              textAnchor="middle"
              className="tabular"
              fontSize={11}
              fontWeight={600}
              fill="var(--text-muted)"
            >
              {bar.year}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** SVG path for a bar with rounded top corners and a flat base on the
 * baseline. Collapses to a plain rect-ish path when shorter than the radius. */
function roundedTopBar(
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): string {
  const radius = Math.min(r, w / 2, h)
  const bottom = y + h
  return [
    `M ${x} ${bottom}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + w - radius} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + radius}`,
    `L ${x + w} ${bottom}`,
    "Z",
  ].join(" ")
}
