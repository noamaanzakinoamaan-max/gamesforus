# HeavenDigital — Firebase setup (~10 minutes, one time)

Goal: only **you** can log into the admin panel and manage products, prices, offers — plus optional buyer accounts.

> ✅ **DONE ALREADY:** `firebase-config.js` is filled with your project (games-bd87d).

## 1. Create your owner login
Firebase console → **Build → Authentication → Get started** → enable **Email/Password**.
*(You can also just create your account from the website's Account page — it lands in the same Auth system.)*

## 2. Create the database
**Build → Firestore Database → Create database** → region **asia-south1 (Mumbai)** → **production mode**.

## 3. Publish the security rules (one command)
```bash
npm i -g firebase-tools
firebase login
firebase deploy
```
The included `firestore.rules` make it so:
- **Products & settings**: everyone can read, only the **owner** can write
- **Owner is claimed, not pasted**: the first person to tap **"🔒 Claim owner"** in `#/admin` while logged in becomes the owner — do this immediately after deploying, before you share the site
- **Buyer accounts**: users can create/read only their own profile and orders; you can read all (for the offers list)

## 4. Claim ownership & go live
1. Open your deployed site → `#/admin` → log in with your email
2. Tap **"🔒 Claim owner with this account"** — done, nobody else can ever claim it
3. Tap **"⬆ Upload catalog to Firestore"** — your full catalog is now cloud-synced
4. Set your **brand name, UPI ID, WhatsApp number, email, Instagram, hours** in *Store name & contact* — the whole site updates instantly
5. Write your own **chat replies** in *Chat assistant replies* (one per line: `question | answer`)

## 5. Authorized domains (so admin login works on your domain)
Authentication → Settings → **Authorized domains** → add:
- `noamaanzakinoamaan-max.github.io`
- `gamesforus.pages.dev` (if you add Cloudflare later)
- your custom domain

## Buyer accounts (optional, already built)
Customers can **create an account** from the Account tab (bottom bar on mobile). They see their order history + total spend, and can opt in to your **offers list** — which you export from the admin panel (*Customers & offers list → Copy opted-in emails*) to broadcast offers on WhatsApp.

## Cost
Everything runs on Firebase's **free Spark plan** for a typical store this size (reads/writes scale with traffic — if you outgrow it, Blaze is pay-as-you-go).
