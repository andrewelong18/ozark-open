/* Root app — auth gate + Header + active screen router, with a Tweaks panel. */
function App() {
  const { Header } = window.DesignSystem_d43214;
  const {
    useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakColor, TweakToggle,
  } = window;

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "headerWidth": "content",
    "accent": "#fdda00",
    "navStyle": "pill",
    "denseCards": false
  }/*EDITMODE-END*/;

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [authed, setAuthed] = React.useState(false);
  const [screen, setScreen] = React.useState("Dashboard");

  const nav = ["Dashboard", "Bets", "My Bets", "All Bets", "Results", "Leaderboard"];
  const onNavigate = (p) => {
    if (p === "__logout") { setAuthed(false); setScreen("Dashboard"); return; }
    setScreen(p);
  };

  const screens = {
    Dashboard: <window.Dashboard onNavigate={onNavigate} />,
    Bets: <window.BetMenu />,
    "My Bets": <window.MyBets />,
    "All Bets": <window.MyBets />,
    Results: <window.Results />,
    Leaderboard: <window.Leaderboard />,
  };

  // Accent tweak overrides the gold role tokens app-wide (nav active pill, gold buttons).
  const wrapStyle = {
    minHeight: "100vh",
    background: "var(--background)",
    "--accent": t.accent,
    "--gold-400": t.accent,
  };
  const maxWidth = t.headerWidth === "full" ? 1120 : 640;

  const panel = (
    <TweaksPanel>
      <TweakSection label="Header & nav" />
      <TweakRadio label="Header width" value={t.headerWidth}
        options={["content", "full"]} onChange={(v) => setTweak("headerWidth", v)} />
      <TweakRadio label="Nav style" value={t.navStyle}
        options={["pill", "underline"]} onChange={(v) => setTweak("navStyle", v)} />
      <TweakSection label="Brand" />
      <TweakColor label="Accent" value={t.accent}
        options={["#fdda00", "#e6c200", "#23a566", "#524fc0"]}
        onChange={(v) => setTweak("accent", v)} />
      <TweakSection label="Density" />
      <TweakToggle label="Compact cards" value={t.denseCards}
        onChange={(v) => setTweak("denseCards", v)} />
    </TweaksPanel>
  );

  if (!authed) {
    return (
      <React.Fragment>
        <window.Login onLogin={() => setAuthed(true)} />
        {panel}
      </React.Fragment>
    );
  }

  return (
    <div style={wrapStyle} data-dense={t.denseCards ? "1" : "0"}>
      <Header brand="Ozark Open Sportsbook" markSrc="../../assets/logos/ozark-mark.svg"
        nav={nav} active={screen} user={window.OZ.me.name}
        maxWidth={maxWidth} navStyle={t.navStyle} onNavigate={onNavigate} />
      <div>{screens[screen]}</div>
      {panel}
    </div>
  );
}
window.App = App;
