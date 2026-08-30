---
category: Brand
---

# BrandLogo

The WatchThis marks and the third-party attribution marks, inlined as data URIs
so they render in any generated design. A `/logo-master.svg` path resolves only
inside the Next app.

| `mark` | What it is | Use it for |
| --- | --- | --- |
| `wordmark` *(default)* | Glyph + "WatchThis" lockup | Anywhere with horizontal room |
| `icon` | The glyph alone, scalable | Compact headers, nav rails, tab bars, avatars — the same mark as the favicon |
| `appIcon` | The shipped `icon192` artwork, glyph on its dark circle | Depicting the installed app only |
| `tmdb` / `justwatch` | Third-party marks | Attribution |

## Rules

- Both WatchThis marks are built for dark surfaces. Place them on
  `bg-gray-950` or `bg-gray-900`. Never on light, never recoloured, never
  stretched — pass `height` and let the width follow.
- Clear space: at least half the mark's height on every side.
- Minimum height — wordmark 24px, icon 16px. Below that the wordmark closes up.
- Don't use `appIcon` as an inline logo; it carries its own background and will
  read as a sticker. Reach for `icon` instead.
- `tmdb` and `justwatch` are **other companies' marks**. Show them wherever
  their data appears — attribution is a condition of using it — and don't
  restyle them.

```jsx
<BrandLogo height={40} />
<BrandLogo mark="icon" height={28} />
<BrandLogo mark="tmdb" height={16} />
```
