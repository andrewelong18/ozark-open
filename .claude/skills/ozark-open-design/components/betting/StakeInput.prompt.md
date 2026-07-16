Inline whole-dollar stake input on an open bet row. States: unplaced (empty), placed (green check + "Bet placed" + gold flash), error (red border + message). Enter or the button confirms.

```jsx
<StakeInput value={stake} max={20} placed={placed}
  error={over ? "Max $20 single bet" : null}
  onChange={setStake} onPlace={place} />
```

Whole dollars only (non-digits stripped). Pair with `BetRow` for the full menu row.
