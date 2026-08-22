---
category: Brand
---

# BrandLogo

The WatchThis wordmark and the third-party attribution marks, inlined as data
URIs so they render in any generated design. A `/logo-master.svg` path resolves
only inside the Next app.

## Rules

- The wordmark is built for dark surfaces. Place it on `bg-gray-950` or
  `bg-gray-900`. Never on light, never recoloured, never stretched — pass
  `height` and let the width follow.
- Leave clear space of at least half the mark's height on every side.
- Minimum legible height is 24px; below that the wordmark closes up.
- `mark="tmdb"` and `mark="justwatch"` are **other companies' marks**. Show them
  wherever their data appears — attribution is a condition of using it — and
  don't restyle them.

```jsx
<BrandLogo height={40} />
<BrandLogo mark="tmdb" height={16} />
```
