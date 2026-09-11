# Uprise Land Surveying Company — website

Single-page site for Uprise Land Surveying Company, Vazhithala, Thodupuzha, Idukki, Kerala.

## Contents

```
index.html        the whole site (markup + logic)
terrain-field.js  WebGL2 terrain background (required by index.html)
support.js        runtime required by index.html
image-slot.js     image placeholder component
assets/           logo + 14 photographs
_ds/              design-system stylesheet and bundle
```

## Run locally

Any static server from this folder, e.g.

```
python3 -m http.server 8000
```

then open http://localhost:8000

## Deploy

Static hosting, no build step. Serve this folder as-is.

- **GitHub Pages** — Settings → Pages → Deploy from branch → `main` / root
- **Netlify / Vercel** — no build command, publish directory `.`

## Notes

- All contact details are live: `tel:+919745220712`, `mailto:upriselandsurveying@gmail.com`, WhatsApp `wa.me/919745220712`, Facebook and Instagram.
- The contact form is front-end only — it animates to a success state but does not send. Wire it to Formspree, Netlify Forms or your own endpoint to receive submissions.
- The background is a procedural WebGL2 terrain field that morphs per section as you scroll. It needs `terrain-field.js` served alongside `index.html`; on devices without WebGL2 the page falls back to the flat dark ground with no loss of content.
- Motion respects `prefers-reduced-motion`.
- Images sit in drag-and-drop slots; replacing a file in `assets/` swaps that image.
