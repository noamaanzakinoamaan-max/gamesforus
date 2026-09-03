# HeavenDigital — Payments, Auto-Verification & Owner Notifications

How to go from "customer pays your UPI ID" to "you get notified, you send credentials" — in three phases, from ₹0 setup to a fully automatic pipeline.

---

## Phase 1 — Today, free (already live on the site)

The checkout already: generates an order ID (`HD-XXXXX`) → opens any UPI app with the amount pre-filled → customer taps "I've paid" → WhatsApp opens with order details for you.

**Make manual verification faster:**

1. **Unique-amount trick (recommended, free):** when you send payment details, add the order's last 2–3 digits as paise — e.g. order HD-7GK2Q = ₹1,499.**72**. The paise value maps 1:1 to an order, so a single glance at your bank statement tells you which order the money is for. (Note: some UPI apps strip paise — test once; if they do, use +₹1/₹2/₹3 whole-rupee offsets per order that day instead.)
2. **Instant owner notification via phone automation (free):** install **MacroDroid** (or Tasker) on the phone where your bank SMS arrives:
   - Trigger: notification/SMS from your bank containing "credited"
   - Action: forward the text to your own Telegram (via Telegram Bot — free, 10 min setup) or to "Message yourself" on WhatsApp
   - Result: the moment money lands, you get amount + UTR + sender on your own phone. You match it to the order ID and send credentials. Verification time drops from minutes to seconds.
3. **Rule:** never deliver on screenshots — only on the credit showing in YOUR bank app or the SMS forward. Screenshot fraud is the #1 scam against UPI sellers.

## Phase 2 — Semi-auto: a real payment gateway (small fee, big trust win)

Use **Razorpay** or **Cashfree** (both Indian, UPI-first, no monthly fee):

- **Zero-code option:** Razorpay **Payment Pages / Payment Links** — create a link per order (manually or from your admin panel later), customer pays through a hosted page, money settles to your bank.
- **Proper checkout:** Razorpay Standard Checkout on the site. Needs a tiny serverless function to create orders — Firebase Cloud Functions works (requires the Blaze plan: pay-as-you-go with a free monthly quota; a card must be on file — at your volume the bill stays ₹0 or close to it).
- **Auto-verification:** configure the gateway **webhook** (`payment.captured`) → your Cloud Function:
  1. checks `order_id` + amount against the Firestore order,
  2. marks the order **PAID** automatically,
  3. sends **you** a notification (Telegram bot is free and instant; WhatsApp Cloud API also works),
  4. optionally auto-replies to the customer: "Payment confirmed ✅ — credentials arriving on WhatsApp shortly."
- **Cost:** ~0–2% per transaction depending on method (UPI is typically the cheapest — check current Razorpay/Cashfree pricing). You're paying for: no fake screenshots, no manual matching, instant receipts.
- **KYC needed:** PAN + bank account (individuals can onboard; GST not required to start).

## Phase 3 — Fully automatic delivery (optional)

Once payments are webhook-verified you can automate the handover too:
- For **subscriptions/Game Pass**: auto-send the credentials block from a "stock inventory" Firestore collection when an order flips to PAID (Cloud Function), and decrement stock.
- For **game accounts**: keep a human step (you add personal handover + setup guidance — this is your differentiator, don't robotize it away).
- Customer-side status page: order ID → Firestore read ("PAID — being prepared").

## What is NOT recommended

- Third-party "UPI auto-verify" Android apps that read your SMS and post to unknown servers — that's your bank data leaving your phone.
- Payment via personal QR in a different name than your store — kills buyer trust and invites platform/ads-account reports.
- Holding customer money in wallets/P2P sellers — settlement must go straight to your bank.

## Already built into the site (this update)

- **Heaven Assist** chat widget — answers FAQs (delivery, safety, tiers, warranty, payments) with conversion buttons, escalates to your WhatsApp after two missed questions, and gets a proactive nudge badge after ~15 seconds.
- **Tiered pricing** — PC (Offline / Online +30–45%) and PSN (Secondary ≈ 35–40% of store price / Primary ≈ 70%) with the tier picker on every product page, "From ₹" on cards, and tier-aware cart, checkout and WhatsApp order messages.
- **Admin control** — `/#/admin` → sign in with your owner Firebase Email/Password (no public sign-up anywhere). Every product's price, MRP, **Tier-2 price**, stock, region, poster URL, tag and featured flag is editable; changes sync to the live site instantly once Firebase is connected.
