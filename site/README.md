# Cenro marketing site

This is Cenro’s dependency-light, static Vite site. It is deliberately separate from the Electron app so the marketing deployment can move independently.

## Local preview

```powershell
npm install
npm run dev
```

## Production on Vercel

Set the Vercel project **Root Directory** to `site`. Vercel will run `npm run build` and publish `dist` using `vercel.json`.

Before deploying under a real domain, replace all `https://cenro.dev` values in `index.html`, `public/robots.txt`, and `public/sitemap.xml` with the verified production URL. Do not ship the placeholder GitHub organization URLs until the public repository exists.

## Launch imagery

Generated image paths are documented in [`public/assets/README.md`](public/assets/README.md). The hero route is wired to `/assets/cenro-hero.png`, with a CSS mock as a graceful local fallback. The PNG social card is also wired into Open Graph, Twitter, and JSON-LD metadata.
