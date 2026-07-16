The workhorse bet-menu row (mobile-first). Number + description on top, odds/status cluster below, and a right action zone that adapts to state: `StakeInput` when open, placed amount when closed-and-placed, `OutcomeBadge` when resolved.

```jsx
<BetRow number={3} description="Dan Mercer to finish top 4 + ties"
  odds={150} status="open" stake={stake} placed={placed}
  onStakeChange={setStake} onPlace={place} />
<BetRow number={7} description="Field to win" odds={-200}
  status="resolved" outcome="miss" />
```

Composes OddsChip, StatusBadge, OutcomeBadge, StakeInput, MoneyDisplay — don't rebuild those inline.
