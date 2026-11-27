# Turning on Web Push (optional — the in-app centre already works)

The 🔔 centre, price alerts and release alerts all work **without** this step: they are
stored on the device (and in the buyer's account when signed in) and shown in the drawer.

Web Push adds the part buyers actually notice: a notification that arrives when the tab
is closed. It needs one key pair from Firebase and a re-publish of the security rules.

---

## 1 · Generate the VAPID key pair

1. Firebase console → **Project settings** → **Cloud Messaging** tab.
2. Scroll to **Web configuration → Web Push certificates** → **Generate key pair**.
3. Copy the public key — it looks like `BJ...` and is about 87 characters.

The private key never leaves Google's servers; you only ever handle the public one.

## 2 · Save the key in the store

Two ways, pick one:

- **Through the UI (no code):** sign in at `/#/admin` → **Push** tab → paste the key into
  *VAPID public key* → **Save key**. This writes
  `settings/store.vapidPublicKey` in Firestore.
- **Through the code:** add the same string to `DEFAULT_SETTINGS` in `index.html` as
  `vapidPublicKey: "BJ…"` and redeploy.

The key is a public identifier, like the Firebase config — it is safe to ship.

## 3 · Publish the rules

`firestore.rules` in this repo already allows exactly what push needs:

| Collection | Who writes | Why |
|---|---|---|
| `pushSubscriptions/{uid}` | that buyer only | the browser subscription endpoint |
| `priceAlerts/{uid_alertId}` | that buyer only | target price per product |
| `notifications/{id}` | owner only | broadcasts the owner publishes |

Copy the file into Firebase console → **Firestore → Rules → Publish**. Without this step
subscribers are created on the device but the write is rejected server-side.

## 4 · Deploy

Push only works over HTTPS on the real domain (or `localhost`). Deploy, then open the
site on the phone you want to test with:

```bash
firebase deploy --only hosting   # or: merge to main for the GitHub Pages flow
```

## 5 · Check it works

1. Open the site → tap 🔔 → **Enable push alerts** (or Account → Alerts).
2. Accept the browser permission prompt.
3. Admin → **Push** → **Send test to this device**.
4. The notification should arrive with the tab in the background.

If nothing arrives:

| Symptom | Cause | Fix |
|---|---|---|
| No permission prompt at all | already *blocked* for the domain | site settings → Notifications → Allow |
| `Registration failed - push service error` | key missing or malformed | re-paste the **public** key, no spaces |
| Works on desktop, not on iPhone | iOS < 16.4, or the site is not installed | iOS 16.4+ **and** Add to Home Screen |
| Prompt appears, nothing sent | rules not published | step 3 |

## What buyers get, and what they can turn off

Four categories, each independently switchable in **Account → Alerts**:

- **New releases** — day-one drops and preorders
- **Offers & sales** — automatic discount windows
- **Price drops** — wishlist items below a target price
- **Order updates** — payment verified, order delivered

Consent is recorded before the first message, the prompt is never shown on top of a
checkout or another dialog, and declining costs nothing — the 🔔 centre keeps working.
