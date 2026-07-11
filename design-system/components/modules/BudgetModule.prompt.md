"Wagered $X of $Y" progress module with a 5-bet-minimum footer. Bar is indigo while filling, green when exactly balanced, amber when over-committed.

```jsx
<BudgetModule wagered={23} entryFee={40} betCount={3} />
<BudgetModule wagered={40} entryFee={40} betCount={6} compact />
```

`compact` drops the footer for header/dashboard use.
