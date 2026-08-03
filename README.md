# Integrity Buyers Agent Perth — Video Landing Page

Standalone static landing page for ad traffic (VSL + booking). Matches the main site branding (navy / turquoise, Cormorant + Inter).

## What's included

- `index.html` — full page (video, booking calendar, FAQ, footer)
- `images/suz-landing.jpeg` — portrait for the about section
- Video and poster load from the existing GoHighLevel CDN
- Booking calendar via [Vexur](https://embed.vexur.com.au) (same widget as the main site)

## Deploy to Vercel

### Option A — New GitHub repo (recommended)

```bash
cd landing-page
git init
git add .
git commit -m "Initial landing page"
git remote add origin https://github.com/YOUR_USER/integrity-landing.git
git push -u origin main
```

In Vercel: **Add New Project** → import that repo → leave framework preset as **Other** (static). Deploy.

Point your domain (e.g. `video.integritybuyersagentperth.com.au`) at the Vercel project in **Settings → Domains**.

### Option B — Vercel CLI from this folder

```bash
cd landing-page
npx vercel
```

Follow prompts. Use `npx vercel --prod` for production.

### Option C — Drag-and-drop

Zip the contents of `landing-page/` (not the folder itself) and upload at [vercel.com/new](https://vercel.com/new).

## Local preview

Any static server works, e.g.:

```bash
cd landing-page
npx serve .
```

Open `http://localhost:3000` (or whatever port `serve` prints).

## Updating

- **Copy / video:** edit headings and body text in `index.html`
- **Portrait:** replace `images/suz-landing.jpeg`
- **Calendar:** update the `data-*` attributes on the `.vexur-widget` div if the Vexur build changes (see `lib/vexur-embed.ts` in the main Integrity repo)
