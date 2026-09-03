# HeavenDigital — Marketing Playbook (India, 2026)

Zero-budget-first plan to get your first 50 orders, then scale. Built around how Indian gamers actually buy: **Instagram/YouTube discovery → WhatsApp trust → UPI payment.**

---

## 0. Positioning (decide this once, use everywhere)

- **One-liner:** "Any game you want — PS5, Xbox or PC — at up to 90% off. Delivered on WhatsApp in 10 minutes, guided setup till you're playing, 30-day warranty."
- **Three trust pillars** (repeat these in every bio, ad and reply): **Tested before delivery · Live guided setup on WhatsApp · 30-day replacement warranty**
- **Price anchor content:** official PS Store price vs your price, side by side. This is your single most viral format.
- **Wording safety:** say "digital delivery", "game access", "guided download". Avoid the word "account" in *paid ads* (see §4).

---

## 1. Instagram (your #1 channel)

**Profile setup (once):**
- Username clean: `@heavendigital.in` (or your domain name)
- Name field (searchable!): `HeavenDigital | PS5 & PC Games — 90% Off`
- Bio: `🎮 PS5 · Xbox · PC games at up to 90% off\n⚡ WhatsApp delivery in 10 min\n🛡️ 30-day warranty · 4,200+ buyers\n👇 Order now`
- Link: your site (or a free linktr.ee with: Website / WhatsApp / Reviews)
- **Highlights:** "Reviews" (screenshot your WhatsApp thank-yous), "How to order", "FAQ", "Proof" (delivery screenshots with names hidden)

**Content plan (3–5 Reels/week, 15–30s each):**
| Format | Example |
|---|---|
| Price shock | "PS Store: ₹4,999. Us: ₹499." — screen-record both, trending audio |
| Delivery proof | Blur the chat, show "credentials delivered in 8 min" |
| Setup guide | 30-sec "how you play on your own profile after buying" — builds trust AND pre-empts fear |
| Game hype | New drops (GTA VI, FC 27…) + "we have it at ₹X" |
| Review recaps | 3 screenshots of happy buyers → slide show |
| Quiz/poll Stories | "Guess the PS Store price of Spider-Man 2" → answer = your price |

**Hashtags (mix 8–12):** #ps5india #gameaccounts #cheapgames #ps5games #pcgamingindia #gamerindia #gamesonps5 #playstationindia #steamindia #xboxindia #gta6 #fifa26 #fc26 #indiagamers

**DM funnel (this is where sales close):**
1. Save these as **Instagram saved replies**: price list, "how it works", payment steps
2. Script: `Hey! 👊 Which game are you looking for?` → send price + warranty line → `Pay via any UPI app, credentials on WhatsApp in under 10 min, and I stay on chat till your game is running.`
3. **Never negotiate below your floor** — offer a bundle ("take 2, 10% off with coupon HEAVEN10")
4. After delivery: ask for a screenshot review + "can I put this on our page? (name hidden)" → that's your next content + reviews.js entry

**⚠️ Instagram risk rules:** don't put "game accounts for sale" in your bio *text* on a fresh account (get ~10 posts first), never DM-spam strangers (reports → ban), and do NOT use unofficial auto-DM bots (instagrapi-type tools get accounts banned). Manual replies + Instagram's built-in saved replies are free and safe. Scheduling via **Postiz** (free, open-source, self-hosted — github.com/gitroomhq/postiz-app) when volume grows.

---

## 2. WhatsApp Business (your closing machine)

Download **WhatsApp Business** (free) and set up:
- **Catalog:** add your top 15 games as products (photo, price, description) — buyers browse without you typing
- **Quick replies:** `/price` `/how` `/warranty` `/pay` — one tap answers
- **Labels:** new → paid → delivered → repeat (color-coded pipeline)
- **Broadcast lists:** every buyer who opts in goes here — blast offers before weekends/festivals. (Broadcasts only reach people who saved your number — ask them to save you at delivery: "Save this number to get offer alerts 🎮")
- **Status:** post the daily deal as a Status — this converts shockingly well in India

---

## 3. Facebook & Telegram

- **Facebook Page:** same content as Instagram (cross-post Reels). Join 5–10 Indian gaming buy/sell groups; post value first (game news, deals news), your offer in comments when allowed by group rules. Hard-selling in groups = bans.
- **Telegram channel:** `t.me/heavendigital` — post every new listing + price drops. Telegram buyers are gamers and they forward links. Link it from your site footer later.
- **YouTube Shorts:** repost the same Reels (add captions). "Spider-Man 2 price in India" type searches bring buyers for years.

---

## 4. Paid ads — read this carefully

**Reality:** Meta and Google both restrict ads for account resale. Expect rejections if you say "buy game accounts".

**What works instead:**
- **Objective:** **Messages** (WhatsApp) — not conversions
- **Creative:** price-comparison Reel or image ("PS Store ₹4,999 → Here ₹499 ✅ Warranty ✅ Guided setup") — advertise the *deal*, deliver in chat
- **Copy:** "Digital games at up to 90% off — instant delivery, warranty included. Chat to order." (no "accounts")
- **Targeting:** India, 16–30, interests: PlayStation, Steam, GTA, EA FC, Free Fire parents excluded; start broad, Meta optimizes to chatters
- **Budget:** ₹150–300/day for 5 days → kill anything above ₹80 per conversation → scale winners to ₹500/day
- **Alternative:** **boost** your best-performing organic Reel (cheaper, looks native, fewer rejections)
- **Google Ads:** skip — gaming-resale keywords get disapproved; organic + GSC (already set up) is your Google channel

---

## 5. First 30 days plan

| Week | Actions |
|---|---|
| 1 | Set up IG + WA Business + Telegram. Post 4 Reels (price shocks). Get 5 real reviews into reviews.js. Tell friends to save your number. |
| 2 | Post daily Stories. 3 Reels. Ask every buyer for a review screenshot. Join FB groups. Start Telegram channel. |
| 3 | Boost your best Reel (₹300/day × 4 days). Post a "how it works" explainer. Run a weekend offer (coupon in admin!). Broadcast to your list. |
| 4 | Review numbers (below). Double down on the 2 best formats. Consider ₹150/day always-on messages campaign. |

**Metrics that matter:** DMs/day → close rate → avg order value → repeat buyers. Track in the admin Orders panel; compare with Instagram insights.

---

## 6. Fraud & safety playbook (protect the business)

- **Fake payment screenshots:** use the unique-paise trick (₹1,499.72 → order HD-7GK2Q). Never deliver on a screenshot — only on money visible in YOUR bank app.
- **Refund abuse:** warranty is replacement-first, refund-second. "Problem? I'll replace it right now" filters 95% of frauds.
- **Buyer scams ("my friend will pay you later"):** no payment = no credentials, no exceptions, politely.
- **Platform risk:** never promise "officially approved by Sony/Microsoft" in writing — it's false endorsement and ad-ban bait. Your warranty framing is your shield.
- **Scale rule:** when you cross ~20 orders/day, revisit PAYMENTS-GATEWAY.md Phase 2 (Razorpay webhook auto-verification) so money-checking stops eating your day.

---

## 7. Free/open-source stack recap (₹0)

| Need | Tool | Status |
|---|---|---|
| Social scheduling | **Postiz** (self-host, AGPL) | github.com/gitroomhq/postiz-app — verified |
| Chat widget | Built into your site (Heaven Assist, editable in admin) | ✅ live |
| Broadcasts | WhatsApp Business lists (free) + Telegram channel | free |
| Link-in-bio | your site / linktr.ee | free |
| Analytics | GA4 or Cloudflare — paste ID in admin panel | ✅ built |
| Design | Canva free tier for Reels covers | free |

**Automation warning:** anything that auto-DMs strangers on Instagram via unofficial APIs will get your account banned — it's the #1 killer of reseller pages. Keep DMs human until Meta's official API (needs a verified business, later).
