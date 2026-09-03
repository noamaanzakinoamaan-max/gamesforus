# HeavenDigital — PSN / Xbox / PC game accounts storefront

A single-file storefront (`index.html`) with a **private owner admin panel** powered by
Firebase Authentication + Firestore. No build tools, no framework, no monthly bills.
Free hosting on Firebase Hosting (or any static host).

## Files

| File | What it is |
|---|---|
| `index.html` | The whole site — storefront **and** your admin panel at `#/admin` |
| `firebase-config.js` | Your Firebase project identifiers (paste from Firebase console) |
| `firestore.rules` | The actual security — publish in Firebase console with your UID |
| `firebase.json` | Hosting config + security headers |
| `SETUP-FIREBASE.md` | Click-by-click setup (do this first) |

## How the site works

- **Storefront:** Home, PC, PSN, Xbox, Subscriptions, product pages, cart, checkout
  (UPI deep-link + WhatsApp order confirmation), FAQ, how-it-works, policies.
- **Products are accounts:** each listing has games included, region, stock counter,
  sale price vs MRP (auto discount %), badges, featured flag.
- **Admin panel** (`yoursite.com/#/admin`): email/password login — only your Firebase
  account works (sign-up is intentionally not offered; your account is created in the
  Firebase console). From the dashboard you can:
  - Add / edit / delete products
  - Change prices, MRP, stock (and click −1 stock after each sale)
  - Run offers: sale price, sitewide announcement bar text, coupon code + % discount
  - Feature products on the homepage, hide/show any listing
  - See stats: product count, low stock, inventory value
- **Live updates:** the catalog lives in Firestore; the storefront updates in real time
  when you change anything.

## Before you go live — replace these

In `index.html`, top of the `<script>` block:

```js
const CONFIG = {
  whatsapp: "919XXXXXXXXX",   // your WhatsApp number
  upiId: "yourname@upi",      // your UPI ID
  email: "support@yourdomain",
  instagram: "https://instagram.com/yourhandle",
};
```

The seeded catalog is **sample data** — replace it with your real stock from the admin
panel. Testimonials are **samples** — replace with real customer feedback (with
permission). Policies are templates — not legal advice; adjust to your reality.

## Running locally

Just open `index.html` in a browser, or:

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

Without a valid `firebase-config.js` the site runs in **demo mode**: storefront fully
works with the local catalog; the admin panel shows setup instructions.

## Deploy (free)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose existing project, public dir: "." , no SPA rewrite
firebase deploy
```

You get `https://PROJECT_ID.web.app` with HTTPS. Attach your custom domain in the
Firebase console → Hosting → Add custom domain.

## Security model (read this)

- The Firebase config in `firebase-config.js` is an **identifier, not a secret** — it's
  safe to be public (same as Firebase's own docs).
- **`firestore.rules` is the real lock**: public can only *read* products/settings;
  only your admin UID can *write*. Publish them before launch.
- No passwords, OTPs, or card data are ever stored or asked for.
- Security headers (nosniff, frame-deny, referrer policy, HSTS) ship via `firebase.json`.
- Hardening checklist in `SETUP-FIREBASE.md` (2FA, single owner, backups).

## Legal note

Selling game accounts violates the terms of service of PSN/Xbox/Steam. The site copy is
written honestly (disclosure on the How-it-works page, no "lifetime guarantee"
promises). You are responsible for operating within your local laws and for customer
support you promise on the site.

---

## 🚀 Deploy (GitHub repo `gamesforus` → Cloudflare Pages)

This folder is a ready git repo. To publish:

```bash
# 1) create an EMPTY repo named gamesforus at github.com/new (no README, no .gitignore)
# 2) then from this folder:
git remote add origin https://github.com/YOUR_USERNAME/gamesforus.git
git push -u origin main
```

**Cloudflare Pages (recommended, free):**
1. dash.cloudflare.com → Workers & Pages → Create → Pages → **Connect to Git** → pick `gamesforus`.
2. Build settings: Framework preset = **None**, Build command = *(leave empty)*, Output dir = **/**
3. Save & Deploy → live at `https://gamesforus.pages.dev` (add your custom domain in Pages → Custom domains).
4. Firebase console → Authentication → Settings → **Authorized domains** → add `gamesforus.pages.dev` (+ your domain) so the admin login works there.

**GitHub Pages (optional alternative):** repo → Settings → Pages → Deploy from branch → `main` / `(root)`. Site: `https://YOUR_USERNAME.github.io/gamesforus/`. Also add that domain to Firebase authorized domains.

> `firebase-config.js` is safe to publish — Firebase web configs are public identifiers. Security comes from `firestore.rules` (owner-UID-only writes).
