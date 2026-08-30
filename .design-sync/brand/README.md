# Brand assets

`logo-data.ts` is **generated** — do not hand-edit it. It inlines the repo's own
artwork as data URIs, because rendered designs receive only the bundle and the
`styles.css` import closure: a `/logo-master.svg` path resolves inside the Next
app and nowhere else.

| Export | Source | Notes |
| --- | --- | --- |
| `WORDMARK` | `public/logo-master.svg` | Full lockup, glyph + "WatchThis" |
| `ICON` | derived from `logo-master.svg` | The `layer1` glyph alone, tight-cropped |
| `APP_ICON` | `src/app/icon192.png` | Home-screen artwork, glyph on its dark circle |
| `TMDB` | `public/tmdb.svg` | Third-party attribution mark |
| `JUSTWATCH` | `public/justwatch.svg` | Third-party attribution mark |

`mark.svg` is likewise generated: the glyph group lifted out of the wordmark
with the `<defs>` it references, then tight-cropped by **rasterising it and
scanning the alpha channel**. That measurement step matters — the glyph carries
a drop-shadow filter whose margins are asymmetric, so computing the viewBox
arithmetically leaves the mark floating in dead space.

## Regenerating

Run this whenever `public/*.svg` or `src/app/icon192.png` changes:

```bash
ln -sfn ../.ds-sync/node_modules .design-sync/node_modules
node .design-sync/brand/regenerate.mjs
```

The symlink is how the bare `playwright` import resolves from this directory. It
is gitignored, so recreating it is part of fresh-clone setup. `.ds-sync/` comes
from staging the design-sync scripts (see `.design-sync/NOTES.md`).

Afterwards rebuild and re-verify, since the aspect ratios are baked into the
component:

```bash
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules --entry .design-sync/entry.tsx --out ./ds-bundle
node .ds-sync/package-capture.mjs --out ./ds-bundle --components BrandLogo
```
