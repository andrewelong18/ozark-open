Primary action button — indigo by default, with a gold variant reserved for the single marquee action on a screen (e.g. "Place Bets").

```jsx
<Button variant="gold" size="lg" fullWidth>Place Bets</Button>
<Button variant="secondary">Edit</Button>
```

Variants: `primary` (indigo), `gold` (clubhouse accent — one per screen max), `secondary` (outlined), `ghost`, `destructive`. Sizes `sm|md|lg`; `md`/`lg` clear the 44px touch floor. Has built-in hover + press (1px nudge) states.
