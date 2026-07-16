Primary betting token: American odds. Positive (`+150`) reads fairway-green, negative (`-130`) reads ink. Tabular figures.

```jsx
<OddsChip odds={150} />
<OddsChip odds={-130} detail />   // shows fractional + implied alongside
```

`detail` reveals the fractional (3-2) and implied probability (40.0%). Sizes `sm|md|lg`.
