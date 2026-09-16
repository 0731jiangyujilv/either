# either-web (React + Vite)

The `web/` Next.js app migrated to a plain React SPA. Same UI, same contracts,
same stylesheet — no server.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # typechecks, then emits dist/
npm run preview    # serve dist/ locally to check the production build
```

## Environment

`.env` carries over from the Next app unchanged — the `NEXT_PUBLIC_` prefix is
still honoured, via `envPrefix` in [vite.config.ts](vite.config.ts). Values are
read through `import.meta.env` instead of `process.env`.

As before, these are **baked into the bundle at build time**, so a change to
`.env` needs a rebuild, not just a restart.

## Deploy

The build is static, so there is no node process and no pm2:

```bash
npm run build
rsync -avz --delete dist/ dmctest:/data/either/dist/
```

nginx needs the SPA fallback, otherwise a hard refresh on `/docs` 404s — the
route only exists in the client router:

```nginx
server {
    root /data/either/dist;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # hashed assets are immutable; index.html must never be cached
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## What changed from `web/`

| | Next.js | here |
|---|---|---|
| routing | file-based `app/` | `react-router-dom` in [src/App.tsx](src/App.tsx) |
| links | `next/link` `href` | `react-router` `Link` `to` |
| metadata | `export const metadata` | [index.html](index.html) + [useTitle](src/lib/useTitle.ts) |
| docs source | `readFile()` at request time | `?raw` import, inlined at build |
| env | `process.env.NEXT_PUBLIC_*` | `import.meta.env.NEXT_PUBLIC_*` |
| wagmi storage | `cookieStorage` + `ssr: true` | default localStorage |
| output | standalone server + pm2 | static `dist/` |

`src/components/*`, `src/lib/*` and the 1065-line stylesheet were carried over
as-is apart from those points.
