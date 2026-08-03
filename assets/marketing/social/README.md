# Instagram feed media sources

These SVGs are deterministic 1080x1350 (4:5) re-layouts of the rights-cleared
Snapcase 1080x1920 masters registered in
`ethtri/Snapcase_Autonomous_MarketingAgency` at commit
`e7a4d2f4c305fc1590162fa5dc33e9ece8e88799`.

The re-layouts preserve the original concepts, buyer guidance, disclosures,
palette, and first-party vector artwork. They do not crop a 9:16 raster into a
feed frame, fabricate product photography, or add a new marketing claim.

## Sources and outputs

| SVG source | Public PNG |
| --- | --- |
| `camera-roll-case-instagram-1080x1350.svg` | `public/marketing/social/camera-roll-case-instagram-1080x1350.png` |
| `photo-fit-check-instagram-1080x1350.svg` | `public/marketing/social/photo-fit-check-instagram-1080x1350.png` |
| `crop-rescue-instagram-1080x1350.svg` | `public/marketing/social/crop-rescue-instagram-1080x1350.png` |

## Deterministic render

The committed PNGs were rendered on Windows with ImageMagick
`7.1.2-19 Q16-HDRI` and the following command shape:

```powershell
magick -background none -density 96 <source.svg> -alpha remove -alpha off -colorspace sRGB -strip -define png:compression-level=9 -define png:compression-filter=5 -define png:compression-strategy=1 <output.png>
```

The SVGs use the same Georgia/Arial font stacks as the registered 9:16 masters.
Reproduction of the exact committed raster hash requires the same ImageMagick
build and compatible installed fonts; the SVG geometry, copy, and color values
remain the portable source of truth.
