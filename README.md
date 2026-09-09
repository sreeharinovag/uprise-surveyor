<<<<<<< HEAD
# Uprise Land Surveying Company — website

Single-page site for Uprise Land Surveying Company, Vazhithala, Thodupuzha, Idukki, Kerala.

## Contents

```
index.html      the whole site (markup + logic)
support.js      runtime required by index.html
image-slot.js   image placeholder component
assets/         logo + 14 photographs
_ds/            design-system stylesheet and bundle
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
- Motion respects `prefers-reduced-motion`.
- Images sit in drag-and-drop slots; replacing a file in `assets/` swaps that image.
=======
# uprise-surveyor
>>>>>>> d7b75b1f0be847db5a675b56ce1cc9c5e9382cf4
