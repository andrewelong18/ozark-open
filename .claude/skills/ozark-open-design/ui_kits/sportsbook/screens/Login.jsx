/* Login — the one "brand moment" page. Warm, single field + button. */
function Login({ onLogin }) {
  const { Button, Input } = window.DesignSystem_d43214;
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);

  return (
    <div style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
      background: "linear-gradient(0deg, var(--ink-100), var(--ink-50))" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <img src="../../assets/logos/ozark-mark.svg" alt="" style={{ height: 108, width: "auto" }} />
          <div style={{ fontFamily: "var(--font-display)", fontSize: 34, color: "var(--indigo-700)", lineHeight: 1.05, marginTop: 8 }}>Ozark Open</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 20, color: "var(--gold-600)", lineHeight: 1 }}>Sportsbook</div>
        </div>

        <div style={{ background: "var(--surface-card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ height: 10, backgroundColor: "var(--accent)",
            backgroundImage: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--accent) 82%, #000) 0 7px, var(--accent) 7px 14px)",
            borderBottom: "1px solid color-mix(in srgb, var(--accent) 70%, #000)", boxShadow: "inset 0 -3px 5px -3px rgba(0,0,0,0.35)" }} />
          <div style={{ padding: 24 }}>
          {sent ? (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-strong)", marginBottom: 8 }}>Check your email</div>
              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 20px" }}>
                We sent a magic link to <b style={{ color: "var(--text-body)" }}>{email || "your address"}</b>. Click it to sign in.
              </p>
              <Button variant="secondary" fullWidth onClick={onLogin}>Continue (demo)</Button>
            </div>
          ) : (
            <React.Fragment>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text-strong)", marginBottom: 4 }}>Welcome back</div>
              <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.5, margin: "0 0 18px" }}>
                Enter your email to get a magic link. No passwords, no house.
              </p>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text-body)", display: "block", marginBottom: 6 }}>Email</label>
              <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 16 }} />
              <Button variant="primary" fullWidth size="lg" onClick={() => setSent(true)}>Send magic link</Button>
            </React.Fragment>
          )}
          </div>
        </div>
        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)", marginTop: 16 }}>
          Private pool · invite only · 24 players
        </p>
      </div>
    </div>
  );
}
window.Login = Login;
