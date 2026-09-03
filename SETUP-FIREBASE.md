# HeavenDigital — Firebase setup (10 minutes, one time)


> ✅ **DONE ALREADY:** `firebase-config.js` is filled with your project (games-bd87d). Remaining: create your owner user, put its UID in `firestore.rules`, create the Firestore DB, deploy.
Goal: only **you** can log into the admin panel and manage products, prices and offers.

---

## Part 1 — Create the project (3 min)

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. **Create a project** → name: `heavendigital` → disable Google Analytics (not needed) → Create.
3. Enable **2-Step Verification on your Google account now** (myaccount.google.com → Security).
   Your whole business sits behind this login.

## Part 2 — Create your admin login (2 min)

1. Left menu → **Build → Authentication** → **Get started**.
2. Sign-in method tab → **Email/Password** → Enable → Save.
3. **Users** tab → **Add user** → your email + a STRONG password (this is your owner login) → Add user.
4. The new user row shows a **UID** — copy it. You'll paste it in Part 4.

## Part 3 — Create the database (2 min)

1. Left menu → **Build → Firestore Database** → **Create database**.
2. Location: `asia-south1 (Mumbai)` → Next.
3. Start in **production mode** → Create.

## Part 4 — Security rules: THE ACTUAL LOCK (2 min)

1. Firestore → **Rules** tab.
2. Open `firestore.rules` from this folder, **replace `PASTE_YOUR_ADMIN_UID_HERE`
   with the UID you copied in Part 2**, paste everything into the console → **Publish**.
3. Test later: the storefront must load products; nobody without your UID can write.

## Part 5 — Connect the website (1 min)

1. Project Home (⚙️) → **Project settings** → General → Your apps → **</>** (Web).
2. Nickname `heavendigital-web` → Register (skip hosting for now).
3. Copy the `firebaseConfig` values and paste them into `firebase-config.js`
   (replace every `PASTE_...` field).

## Part 6 — Deploy (2 min)

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your heavendigital project
firebase deploy               # hosting + firestore rules together
```

Live at `https://YOUR_PROJECT.web.app`. Add your custom domain:
Firebase console → Hosting → **Add custom domain** → follow the DNS instructions.

## Part 7 — First login + starter data

1. Open `https://YOUR_PROJECT.web.app/#/admin` → log in with your Part-2 email/password.
2. The seeded catalog uploads to Firestore the first time the site loads **only if the
   collection is empty** — or just start adding your real products from the dashboard.
3. Set your **announcement bar + coupon code** in "Offers & announcement" → Save.
   It's live on the storefront instantly.

---

## Hardening checklist (do once, sleep well)

- [ ] Google account has 2-Step Verification (authenticator app, not SMS).
- [ ] Firebase project has exactly ONE owner: you. Settings → Users & permissions.
- [ ] `firestore.rules` published with YOUR UID (store loads in read-only for everyone else).
- [ ] Never create/download a **service account key** for this project (a common leak).
- [ ] Admin password is unique (use a password manager).
- [ ] Firestore free tier (Spark) covers small stores: 1 GiB storage, 50k reads/day.
      If you ever exceed it, the console will email you — nothing auto-bills.
- [ ] Weekly backup: Firestore → Import/Export, or just note prices in a sheet.

## Daily ops flow

1. Stock arrives → Admin → Add product (games included, region, price, MRP, stock).
2. Sale happens → verify payment in your **bank app** → hand over on WhatsApp →
   click **−1** stock on the product row.
3. Want a weekend offer? Dashboard → Offers → edit announcement + coupon % → Save.
4. Account sold out? It stays visible but "Sold out" — or click **Hide**.
