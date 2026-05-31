# Colorblindness Simulator

A full-stack app that simulates colorblindness on user-uploaded images,
calibrated from EnChroma test scores. The UI is Vite + React + TypeScript and
all image processing runs client-side; a TypeScript Node/Express backend serves
the built client and exposes an `/api` surface. No UI framework, and no network
requests from the client except the EnChroma test link.

## Layout

```
src/          React client (all image processing happens here, in the browser)
server/       Express server (TypeScript, ESM) — serves the client + /api
dist/         Built client assets (vite build)
dist-server/  Compiled server (tsc -p tsconfig.server.json)
```

## Development

```bash
npm install
npm run dev
```

This runs the Vite dev server (client, HMR) and the Express server (`tsx watch`,
port 3001) concurrently. Open the Vite URL it prints; requests to `/api` are
proxied to Express, so the client uses same-origin `/api` paths in dev and prod
alike.

## Production

```bash
npm run build     # build:client (tsc -b && vite build) + build:server (tsc)
npm start         # node dist-server/index.js
```

The Express server serves the static client from `dist/` with an SPA fallback,
and handles `/api/*` routes. It listens on `PORT` (default `3001`).

## Docker

A multi-stage [Dockerfile](Dockerfile) builds the client and server, then ships
only production deps and the built artifacts on `node:20-slim` (runs as the
non-root `node` user, with a `/api/health` healthcheck).

[docker-compose.yml](docker-compose.yml) runs the `web` service and publishes
its port to the host.

```bash
docker compose up -d --build       # http://localhost:3001

# update later:
git pull && docker compose up -d --build

# different host port:
HOST_PORT=8080 docker compose up -d --build
```

`web` listens on `PORT` (default `3001`); compose maps `HOST_PORT` (default
`3001`) to it. Copy [.env.example](.env.example) to `.env` to override —
`docker compose` reads it automatically.

## Deployment

This runs as a single Node service — e.g. on a homelab box: `git pull`,
`docker compose up -d --build`, done. Front it with whatever exposes it to the
internet; a Cloudflare Tunnel run separately on the host (pointed at
`http://localhost:3001`) needs no open ports and provides HTTPS + the public
`color.maeby.io` hostname.

Without Docker it's just as portable: `npm run build` then `npm start`, with
`PORT` from the environment, on any Node 20+ host. `dist/` and `dist-server/`
are gitignored, so build on the host (or ship them yourself).

## How it works

Upload an image (JPEG/PNG/WebP, plus HEIC where the browser supports it). EXIF
orientation is applied on load via `createImageBitmap(blob, { imageOrientation:
'from-image' })`, so rotated phone photos display correctly.

Take the [EnChroma test](https://enchroma.com/pages/test) first, then enter your
three cone scores (L/red, M/green, S/blue) as percentages. A score of 100 means
full sensitivity; 0 means the cone is absent.

Drag the vertical divider over the image to compare the original (left) against
the simulated result (right). The divider is a 4px white line inside an 8px
black outline. The on-screen split position is for exploration only — exports
ignore it.

### Filter math

Each pixel is processed in linear light:

1. **sRGB → linear** per channel: `c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`
2. **Multiply** the linear RGB by a 3×3 matrix `M_combined`.
3. **linear → sRGB**: `c <= 0.0031308 ? 12.92*c : 1.055*c^(1/2.4) - 0.055`
4. Clip to `[0,1]` and write back as 8-bit.

Both gamma conversions use precomputed lookup tables (256-entry forward, a
quantized 4096-entry reverse) instead of per-pixel `Math.pow`. Pixels are
processed with `getImageData` → typed-array loop → `putImageData`.

`M_combined` is built from the three cone scores. Each score `x` (0–100) becomes
a severity `s = 1 - x/100`. Each cone type has a full-severity simulation matrix
(`M_protan_full`, `M_deutan_full`, `M_tritan_full`); the partial matrix is
`M_partial = (1-s)·I + s·M_full`. They compose as:

```
M_combined = M_tritan_partial @ M_deutan_partial @ M_protan_partial
```

i.e. protan is applied first, then deutan, then tritan (column-vector
convention `v' = M v`, so the leftmost factor is the last transform applied).
Order matters; see the comment in `src/colorMath.ts`. The matrix is recomputed,
debounced to one animation frame, whenever a score changes.

### Rendering and performance

The live preview canvas is downscaled to fit the viewport (capped at ~6MP on
desktop, ~2MP on mobile) so slider drags stay smooth. The original
`ImageBitmap` is kept at full resolution, and both downloads render from it:

- **Download filtered image** — the filter applied to the whole frame, no split,
  no divider, full source resolution.
- **Download comparison** — split exactly down the middle (left original, right
  filtered) with the divider on the centerline, full source resolution.

Both export as JPEG at quality 0.92.

## Mobile

- Responsive layout with a 768px breakpoint; canvas stacks above controls on
  phones. Root uses `min-height: 100dvh` and `env(safe-area-inset-*)` padding
  with `viewport-fit=cover`.
- The split slider uses Pointer Events with pointer capture, so a drag keeps
  tracking even if the finger slides off the divider. The handle has a 44×44px
  hit target.
- "Take photo" uses `<input type="file" accept="image/*" capture>` to open the
  camera. Drag-and-drop still works on desktop.
- Cone number fields use `inputMode="numeric"` for the numeric keypad. Pinch-to-
  zoom is left enabled (no `user-scalable=no`).

### Browser quirks

- **HEIC**: Safari (iOS/macOS) decodes HEIC via `createImageBitmap`. Chrome on
  Android generally does **not** — HEIC uploads there fail with a clear error
  message; use JPEG/PNG/WebP instead.
- `createImageBitmap` with `imageOrientation: 'from-image'` is supported in
  current Safari and Chrome. On very old engines orientation may not be applied;
  the app still loads the image, just without auto-rotation.
