# Integrity Buyers Agent Perth — Video Landing Page

Standalone static landing page for ad traffic (VSL + booking). Matches the main site branding (navy / turquoise, Cormorant + Inter).

## What's included

- `index.html` — full page (video, booking calendar, FAQ, footer). **Source of truth.**
- `builder-embed.html` — generated, self-contained version for website builders
- `build-embed.mjs` / `verify-embed.mjs` — generator and its checks
- `embed-host-test.html` — regression harness that renders the embed inside a
  deliberately hostile host theme
- `images/suz-landing.jpeg` — portrait for the about section
- Video and poster load from the existing GoHighLevel CDN
- Booking calendar via [Vexur](https://embed.vexur.com.au) (same widget as the main site)

## Uploading to a website builder

Paste `builder-embed.html` into the builder's custom HTML / embed / code block.
It is a single fragment with no `<html>`/`<head>`/`<body>`, so it drops straight
into an existing page.

Regenerate it after **any** edit to `index.html`:

```bash
node build-embed.mjs && node verify-embed.mjs
```

The generator makes the page safe to sit inside someone else's theme:

- every CSS rule is scoped under `.ibap`
- every class is renamed `ibap-*` — scoping alone is not enough, because a host
  rule like `.wrap{max-width:220px}` still beats our `width` regardless of
  specificity
- every id is prefixed `ibap-`, so `#top` / `#book` can't collide
- a zero-specificity reset absorbs inherited host styles (letter-spacing,
  heading colours, list bullets) that specificity cannot block
- the Vexur widget subtree is excluded from that reset
- the portrait loads from an absolute URL, so no image upload is needed

Verify against the hostile harness before shipping a change:

```bash
npx serve .          # then open /embed-host-test.html
```

The embed should look identical to `index.html`. Known caveats:

- **Fonts** — if the builder strips `@import`, add the Google Fonts link in the
  builder's own head/custom-code area.
- **Booking calendar** — the builder must allow scripts, and Vexur must permit
  your domain. It is blocked on `localhost`, so always test on a published URL.
- **Wix** — its HTML embed runs in a sandboxed iframe with a fixed height, which
  suits a short widget, not a full-length page. Link to the Vercel URL instead.

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

Never edit `builder-embed.html` by hand — it is overwritten on every build.
Change `index.html`, then rerun `node build-embed.mjs`.
