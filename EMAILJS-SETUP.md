# Email Receipts — Setup Guide (EmailJS, ~15 minutes, free)

Your website now has the receipt-sending code built in. It sends an automatic
"order received + payment instructions" email to the customer's inbox the moment
they check out (signed-in customers — their email is already stored with every
order). Until the 3 keys below are filled in, the feature stays silently off.

**Free tier: 200 emails/month** — enough for launch (upgrade or move to the bot
server later if you outgrow it).

---

## Step 1 — Create the account (3 min)

1. Go to **emailjs.com** → Sign up (free, no card)
2. Confirm your email

## Step 2 — Connect your email address (3 min)

1. Dashboard → **Email Services** → **Add New Service**
2. Pick **Gmail** (or the provider you use)
3. Connect the mailbox you want receipts sent FROM — ideally the shop's support
   inbox (e.g. `heavendigital.store@gmail.com` or your support@ address)
4. **Create Service** → copy the **Service ID** (looks like `service_xxxxxxx`)

## Step 3 — Create the receipt template (5 min)

1. **Email Templates** → **Create New Template**
2. Set **Subject** to:
```
Order {{order_id}} received — pay via UPI & get it in ~10 min
```
3. Set **Content** to exactly this:
```
Hi {{to_name}},

Your order is confirmed and waiting for payment.

Order ID: {{order_id}}

{{items}}

Total: {{total}}

How to pay:
• UPI ID: {{upi_id}} ({{upi_name}})
• Payment note: {{order_id}}

After paying, confirm on WhatsApp: {{whatsapp}}
We verify and deliver on WhatsApp, usually under 10 minutes during {{hours}}.

Every order carries a 30-day replacement-or-refund warranty.
Track anytime with order ID {{order_id}} on the website.

Game on,
{{brand}}
```
4. **Save** → copy the **Template ID** (looks like `template_xxxxxxx`)

## Step 4 — Get your Public Key (1 min)

1. **Account** → **General** → copy the **Public Key** (looks like `AbC123...`)

## Step 5 — Send me the 3 values

Paste these in chat and I'll push them live (same flow as before):

```
Public Key:
Service ID:
Template ID:
```

Once pushed, every checkout instantly emails the customer. Feature can be
turned off anytime by blanking the keys.

---

## FAQ

**Who receives emails?** Signed-in customers (their account email is already
saved with the order). Guest checkouts don't share an email, so no receipt —
they still get everything on WhatsApp.

**Is the Public Key safe in the page source?** Yes, by design — it can only
send YOUR one template, and EmailJS rate-limits it. Worst case someone abuses
your 200/month quota (they can't read anything or send other content).

**Later upgrade path:** when the WhatsApp bot server goes live, we can move
receipts server-side (Resend — 3,000/month free, custom `@heavendigital.store`
from-address, delivery logs) and also auto-send a "payment verified" email
when you mark orders paid. EmailJS is the perfect launch bridge.

**Test it:** once keys are in, create a test account on your own site with
your own email → add any product → checkout → check your inbox.
