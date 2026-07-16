Consistent money treatment across the app. Whole dollars for stakes/entries, cents for computed payouts; `pl` mode signs and colors profit/loss.

```jsx
<MoneyDisplay value={40} />                 // $40
<MoneyDisplay value={21.87} cents />        // $21.87
<MoneyDisplay value={-6.5} cents pl />      // −$6.50 in red
```

Always tabular figures so columns align. Sizes `xs|sm|md|lg|xl`.
