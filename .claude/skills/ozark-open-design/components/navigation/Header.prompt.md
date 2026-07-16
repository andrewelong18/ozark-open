App header — indigo bar with the brand lockup, a user cluster (name + logout), and a page nav rendered as a rounded floating pill (gold active capsule) by default, or a flat underline bar via `navStyle="underline"`. Constrain the bar + nav to your content width with `maxWidth`.

```jsx
<Header brand="Ozark Open Sportsbook" markSrc="assets/logos/ozark-mark.svg"
  active="Bets" user="Jake Kohne" maxWidth={640} onNavigate={(p) => go(p)} />
```

`onNavigate` receives the nav label, or `"__logout"` from the logout button. Omit `user` on the login page. Keep the brand as the full "Ozark Open Sportsbook" lockup.
