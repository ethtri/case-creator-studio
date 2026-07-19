# Snapcase logo assets

Use `*-on-dark` over the Snapcase plum backgrounds (`#120B1A` or darker).
Use `*-on-light` over white and light neutral surfaces. The mark-only files are
preferred for avatars, app icons, and square placements.

## Files

- `snapcase-logo-on-dark.svg` - primary horizontal lockup for dark surfaces
- `snapcase-logo-on-light.svg` - horizontal lockup for light surfaces
- `snapcase-mark-on-dark.svg` - symbol for dark surfaces
- `snapcase-mark-on-light.svg` - symbol for light surfaces
- `snapcase-mark-on-dark-512.png` - transparent raster symbol for dark surfaces
- `snapcase-mark-on-light-512.png` - transparent raster symbol for light surfaces
- `snapcase-mark-monochrome.svg` - one-color symbol with a cutout sparkle
- `snapcase-mark-512.png` - square raster mark for metadata and integrations

The site component is `src/components/SnapcaseLogo.tsx`. It follows the active
theme automatically:

```tsx
import { SnapcaseLogo, SnapcaseMark } from "@/components/SnapcaseLogo";

<SnapcaseLogo className="text-xl" />
<SnapcaseMark className="h-8 text-foreground" />
```

The horizontal SVG lockups use the bundled Space Grotesk font at
`public/fonts/space-grotesk-latin.woff2`. Keep that relative folder structure
when serving the raw SVGs, or use the React component inside the app.

Keep clear space around the logo equal to at least one quarter of the mark's
width. Do not stretch it, add effects, or change the teal sparkle independently.
Use the mark at 24px or larger and the horizontal lockup at 120px or larger.
