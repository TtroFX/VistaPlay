# VistaPlay Branding

## Official app icon

The official VistaPlay app icon is the centered orange-yellow `VP` / play monogram on a fully opaque pure-white (`#FFFFFF`) square canvas. The source artwork itself has no rounded-square/card frame. The monogram keeps its own orange gradient, highlight/bevel treatment, and soft logo shadow; no shadow is applied to the outer square canvas.

### PWA icon rules

- Standard icon artwork is centered on a square canvas and may be masked by the platform.
- The maskable artwork keeps all essential `VP` / play geometry inside the centered maskable safe zone (radius 40% of the icon width, diameter 80%).
- The white background extends to every image edge. There are no transparent edge pixels, rounded outer corners, card borders, or outer-card shadows.
- Platform launchers, including Android, are responsible for applying circle, squircle, rounded-square, or other launcher masks.

### Current production assets (v3)

- `public/vistaplay-icon-192-v3.png` — 192×192 raster icon.
- `public/vistaplay-icon-v3.svg` — scalable standard icon derived from the approved VP artwork.
- `public/vistaplay-maskable-v3.svg` — scalable maskable icon with safe-zone-compliant sizing.
- `public/vistaplay-apple-touch-icon-v3.png` — Apple touch icon.
- `public/vistaplay-icon-512-v2.png` — retained only as a 512×512 raster fallback for clients without SVG manifest-icon support.

The v3 filenames intentionally invalidate stale browser/PWA icon caches. Do not add a rounded-square frame or outer-card shadow to future source artwork unless the branding specification is explicitly changed.
