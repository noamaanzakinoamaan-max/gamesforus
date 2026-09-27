# Order Email Alerts — Setup Guide (EmailJS, ~15 minutes, free)

The website now saves every checkout into Firebase before the buyer pays. EmailJS is optional, but it gives you inbox alerts when a new website order is created and can also email the buyer a receipt if they enter an email.

**Free tier: 200 emails/month** — enough for launch. If you grow past that, move alerts server-side with Resend, Firebase Functions, or a WhatsApp Business API provider.

---

## Step 1 — Create the account

1. Go to **emailjs.com** → Sign up.
2. Confirm your email.

## Step 2 — Connect your sending email

1. Dashboard → **Email Services** → **Add New Service**.
2. Pick **Gmail** or your provider.
3. Connect the mailbox you want emails sent FROM — ideally your support inbox.
4. Copy the **Service ID**. It looks like `service_xxxxxxx`.

## Step 3 — Create the owner alert template

1. **Email Templates** → **Create New Template**.
2. Name it `HeavenDigital Owner Order Alert`.
3. Set **Subject** to:

```txt
New order {{order_id}} — {{total}}
```

4. Set **Content** to:

```txt
New website order received.

Order ID: {{order_id}}
Total: {{total}}

Customer:
Name: {{customer_name}}
WhatsApp: {{customer_whatsapp}}
Email: {{customer_email}}

Items:
{{items}}

Checkout action: {{checkout_action}}

Open admin dashboard:
{{admin_url}}
```

5. In the template settings, make sure the recipient uses `{{to_email}}`.
6. Save and copy the **Template ID**. It looks like `template_xxxxxxx`.

## Step 4 — Optional buyer receipt template

You can reuse the owner template ID for now, but a separate buyer receipt looks better.

Subject:

```txt
Order {{order_id}} received — pay via UPI & get it in ~10 min
```

Content:

```txt
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

Save and copy this second **Template ID** if you create it.

## Step 5 — Get your Public Key

EmailJS Dashboard → **Account** → **General** → copy the **Public Key**.

## Step 6 — Paste the values into `index.html`

Find this line:

```js
const EMAILJS={publicKey:"", serviceId:"", templateId:"", customerTemplateId:"", ownerTemplateId:""};
```

For owner alerts only:

```js
const EMAILJS={
  publicKey:"YOUR_PUBLIC_KEY",
  serviceId:"service_xxxxxxx",
  templateId:"",
  ownerTemplateId:"template_owner_alert",
  customerTemplateId:""
};
```

For owner alerts plus buyer receipts:

```js
const EMAILJS={
  publicKey:"YOUR_PUBLIC_KEY",
  serviceId:"service_xxxxxxx",
  templateId:"",
  ownerTemplateId:"template_owner_alert",
  customerTemplateId:"template_buyer_receipt"
};
```

`templateId` is kept for older installs. For new setup, prefer `ownerTemplateId` and `customerTemplateId` so the owner and buyer get the correct email copy.

---

## Important notes

- Website orders still save to the admin dashboard even if EmailJS is blank.
- EmailJS can send email alerts, but it cannot send WhatsApp messages automatically.
- Automatic WhatsApp notifications require WhatsApp Business API or a backend service.
- The EmailJS public key is designed to be visible in frontend code; keep service/template permissions limited in EmailJS.

## Test it

1. Deploy the updated website and Firestore rules.
2. Add a product to cart.
3. Proceed to checkout.
4. Enter name + WhatsApp.
5. Click **Save order & pay via UPI**.
6. Check:
   - Admin dashboard → Orders
   - Your owner email inbox
   - Buyer email inbox, if a buyer receipt template is configured
