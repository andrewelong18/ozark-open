import React from "react";

/**
 * App header — brand lockup, page nav, and user display name + logout.
 * Mobile-first: nav scrolls horizontally under the brand bar on small screens.
 * Pass `markSrc` to show the golf-flag mark; otherwise the name renders in
 * the Azalea display face.
 */
export function Header({
  brand = "Ozark Open Sportsbook",
  markSrc = null,
  nav = ["Dashboard", "Bets", "My Bets", "All Bets", "Results", "Leaderboard"],
  active = "Bets",
  user = null,
  maxWidth = "var(--container-max)",
  navStyle = "pill",
  onNavigate = () => {},
  style = {},
}) {
  const inner = typeof maxWidth === "number" ? maxWidth + "px" : maxWidth;
  const isPill = navStyle !== "underline";
  const [hovered, setHovered] = React.useState(null);
  return (
    <header style={{
      background: "linear-gradient(180deg, var(--indigo-700) 0%, var(--indigo-800) 100%)",
      color: "var(--text-on-dark)", paddingBottom: 6,
      boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.25)",
      ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        height: "var(--header-h)", padding: "0 16px", maxWidth: inner, margin: "0 auto",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flex: "1 1 auto" }}>
          {markSrc && <img src={markSrc} alt="" style={{ height: 30, width: "auto", display: "block", flexShrink: 0 }} />}
          <span style={{
            fontFamily: "var(--font-display)", fontSize: "clamp(16px, 4.6vw, var(--text-xl))",
            color: "#fff", letterSpacing: "0.01em", whiteSpace: "nowrap",
            minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
          }}>{brand}</span>
        </div>
        {user && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", color: "var(--indigo-200)", whiteSpace: "nowrap" }}>{user}</span>
            <button type="button" onClick={() => onNavigate("__logout")} style={{
              height: 32, padding: "0 12px", border: "1px solid rgba(255,255,255,0.25)",
              background: "transparent", color: "#fff", borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)", fontWeight: "var(--fw-semibold)", cursor: "pointer",
            }}>Log out</button>
          </div>
        )}
      </div>
      <nav style={isPill ? {
        display: "flex", gap: 4, padding: 6, margin: "0 auto 12px", maxWidth: inner,
        width: `calc(100% - 32px)`, boxSizing: "border-box",
        overflowX: "auto",
        backgroundColor: "var(--indigo-950, #14133a)",
        backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.09) 0 2px, rgba(255,255,255,0) 2px 9px)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "var(--radius-pill)",
        boxShadow: "var(--shadow-lg), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -6px 12px -8px rgba(0,0,0,0.6)",
      } : {
        display: "flex", gap: 2, padding: "0 8px", margin: "0 auto", maxWidth: inner,
        overflowX: "auto",
        backgroundColor: "var(--surface-inverse-2)",
        backgroundImage: "repeating-linear-gradient(-45deg, rgba(255,255,255,0.07) 0 2px, rgba(255,255,255,0) 2px 9px)",
      }}>
        {nav.map((item) => {
          const isActive = item === active;
          const isHover = hovered === item && !isActive;
          const pillStyle = {
            position: "relative", flexShrink: 0, height: 40, padding: "0 17px", border: "none",
            backgroundColor: isActive ? "var(--accent)" : isHover ? "rgba(255,255,255,0.08)" : "transparent",
            backgroundImage: "none",
            cursor: "pointer",
            borderRadius: "var(--radius-pill)",
            boxShadow: isActive
              ? "inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -3px 5px -2px rgba(0,0,0,0.45), 0 2px 5px rgba(0,0,0,0.35)"
              : "none",
            fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
            fontWeight: isActive ? "var(--fw-bold)" : "var(--fw-medium)",
            color: isActive ? "var(--accent-foreground)" : isHover ? "#fff" : "var(--indigo-200)",
            textShadow: isActive ? "0 1px 0 rgba(255,255,255,0.35)" : "none",
            transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)",
            whiteSpace: "nowrap",
          };
          const underlineStyle = {
            position: "relative", flexShrink: 0, height: 44, padding: "0 14px", border: "none",
            background: isHover ? "rgba(255,255,255,0.06)" : "transparent", cursor: "pointer",
            fontFamily: "var(--font-sans)", fontSize: "var(--text-sm)",
            fontWeight: isActive ? "var(--fw-bold)" : "var(--fw-medium)",
            color: isActive ? "var(--accent)" : isHover ? "#fff" : "var(--indigo-200)",
            borderBottom: `2.5px solid ${isActive ? "var(--accent)" : "transparent"}`,
            whiteSpace: "nowrap",
          };
          return (
            <button
              key={item}
              type="button"
              onClick={() => onNavigate(item)}
              onMouseEnter={() => setHovered(item)}
              onMouseLeave={() => setHovered(null)}
              style={isPill ? pillStyle : underlineStyle}
            >{item}</button>
          );
        })}
      </nav>
    </header>
  );
}
