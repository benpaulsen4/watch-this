## Building with WatchThis

WatchThis is a **dark-only** design system built on Tailwind v4 utilities. There
is no theme provider and no CSS custom-property token layer — the design
language lives in a constrained set of Tailwind palette classes, applied
directly. Match them and your screens look native; invent your own and they
won't.

### Every screen needs the app root

Components assume the app's root element. Without it they render dark text on a
white page, and any component that mutates data throws for want of a query
client.

```jsx
const { Button, Card, CardHeader, CardTitle, ReactQueryProvider } = window.WatchThis;

<ReactQueryProvider>
  <div className="dark antialiased bg-gray-950 text-gray-100 min-h-screen">
    {/* screens go here */}
  </div>
</ReactQueryProvider>
```

`ContentCard` additionally reads auth context — wrap it in `AuthProvider`
(inside `ReactQueryProvider`) if you use it.

### The palette, precisely

Surfaces step **darkest → lightest**: `bg-gray-950` (page) → `bg-gray-900`
(header, modal) → `bg-gray-800` (card, raised) → `bg-gray-700` (input, track).
Borders are `border-gray-800` (subtle) and `border-gray-700`/`border-gray-600`
(control edges).

Text steps `text-white` (headings) → `text-gray-100` (body) → `text-gray-300`
(secondary) → `text-gray-400` (meta) → `text-gray-500` (placeholder).

**Red is the brand accent** — `bg-red-600` for primary actions, `text-red-400`
for links and inline emphasis, `ring-red-500` for focus. Semantic colours:
green = success/watching, blue = completed/info, yellow = planning/warning,
orange = paused, red = dropped/destructive. Purple + orange appear only in the
two gradient treatments (`Button variant="gradient"` and `"entertainment"`).

Available utility families are the seven brand palettes — gray, red, purple,
orange, green, blue, yellow — across the full 50–950 scale, plus the standard
spacing, flex/grid, sizing, radius, shadow and type scales. Colours **outside**
those seven (emerald, teal, indigo, …) are not compiled and will render as
nothing, so stay inside the palette above.

### Reach for a component before styling a div

Use `Card` (+ `CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`)
for any panel, `Button` for any action, `Badge` for any chip, `Input`/`Textarea`/
`Switch`/`Dropdown` for any form control, `Modal` for any dialog, and
`PageHeader` for the top bar. Domain screens compose `ContentCard`,
`ContentCardSkeleton`, `StatusBadge`, `StatusSegmentedSelector`, `ListCard`,
`ActivityEntry`, `SearchInput` and `Markdown`. Use utilities for **layout glue
between** components, not to re-style them — variants already cover the looks
(`Button` alone has 8 variants × 7 sizes; `Badge` has 15).

### Where the truth lives

Read `_ds/<folder>/styles.css` and the files it imports for the compiled
utilities and the Geist `@font-face` rules. Each component's real API is its
`<Name>.d.ts`, and `<Name>.prompt.md` carries its props and usage. Prefer those
over guessing — every variant name above is enumerated there.

### A typical screen

```jsx
const { Button, Card, CardContent, CardHeader, CardTitle, Badge, StatusBadge } = window.WatchThis;

<div className="dark antialiased bg-gray-950 text-gray-100 min-h-screen p-8">
  <div className="mx-auto max-w-5xl">
    <h1 className="text-3xl font-bold text-white">Weekend Watchlist</h1>
    <p className="mt-2 text-gray-400">Shared with Ana and Marcus · 12 titles</p>

    <div className="mt-8 grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Severance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status="watching" />
            <Badge variant="genre">Sci-Fi</Badge>
            <Badge variant="rating">★ 8.4</Badge>
          </div>
        </CardContent>
      </Card>
    </div>

    <div className="mt-6 flex gap-3">
      <Button>Add a title</Button>
      <Button variant="outline">Share</Button>
    </div>
  </div>
</div>
```
