Card surface — white, soft ring + shadow, 14px radius. The clubhouse reference-card container.

```jsx
<Card accent>
  <CardHeader title="Your Rules" subtitle="Entry $40" action={<Badge tone="indigo">In</Badge>} />
  …
</Card>
```

`elevated` for a focal/lifted card; `accent` adds a textured clubhouse-awning gold stripe band across the top (use once per screen for the brand-moment card — it follows the `--accent` token, so it recolors with a theme tweak). `CardHeader` gives a display-font title + optional subtitle and trailing action slot.
