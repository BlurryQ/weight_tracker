# App icon — "W-trend"

The condensed **W** whose final upstroke is the dashed projection: the app's weekly-average line folded into a letterform, echoing the Barlow Condensed numerals in the UI. Pure geometry — two paths on a solid ground, no gradients, no text.

## Spec

- Ground `#0b0c0b`. Mark `oklch(0.82 0.17 128)` — sRGB hex `#c3f53c` for raster output.
- Canvas 512 × 512, corner radius 112 (iOS squircle is applied by the OS; the PNGs carry the radius for platforms that don't mask).
- Stroke width 38, `linecap: round`, `linejoin: round`.
- Solid path `M96 148 L184 364 L256 252 L328 364`, then the dashed upstroke `M328 364 L416 148` with `stroke-dasharray="4 44"` at 72% opacity.
- The dash pattern is the same one the app uses for projections — keep it if you redraw at another size.

## Files

| File | Use |
|---|---|
| `icon.svg` | Master, full-bleed with corner radius |
| `icon-maskable.svg` | Mark at 72% scale on a square ground — for Android adaptive / maskable masking |
| `icon-mono.svg` | Mark only, `currentColor`, no ground — favicon, notification badge, monochrome contexts |
| `icon-1024.png` | App Store / Play listing |
| `icon-512.png`, `icon-192.png` | PWA manifest (`purpose: any`) |
| `icon-maskable-512.png`, `icon-maskable-192.png` | PWA manifest (`purpose: maskable`) |
| `icon-180.png`, `icon-152.png`, `icon-120.png` | `apple-touch-icon` sizes |
| `icon-32.png` | Favicon |
| `manifest.json` | Drop-in manifest with the icon entries wired up |

## HTML head

```html
<link rel="icon" href="/icon/icon-32.png" sizes="32x32">
<link rel="icon" href="/icon/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon/icon-180.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#0b0c0b">
```

For Capacitor, run the PNG set through `@capacitor/assets` (it wants a 1024 source — use `icon-1024.png`) to generate the platform-specific densities.
