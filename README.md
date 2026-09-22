# Revision Tracker

A single-page, offline-first **spaced repetition & revision scheduler**.
No build step, no backend, no dependencies to install — just static files.

---

## Quick start

Because this app uses a **service worker**, it must be served over `http://`
(or `https://`). Opening `index.html` directly via `file://` will work for the
core features but won't cache anything for offline use.

From the project root, run any one of:

```bash
# Python 3
python -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080