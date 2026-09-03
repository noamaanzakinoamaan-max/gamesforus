# HeavenDigital — Custom domain setup (~15 min + ₹500–900/year)

## 1. Buy the domain
Pick ONE registrar:
- **Cloudflare Registrar** (at-cost pricing, ~₹850/yr for .in, no upsells — recommended if you'll use Cloudflare anyway)
- **GoDaddy / Namecheap / Hostinger** (.in domains ₹199–599 first year on offer)

Suggested names (check availability): `heavendigital.in`, `heavendigital.store`, `heavendigital.gg`, `playheaven.in`, `heavenhub.in`. Avoid hyphens and numbers.

⚠️ Don't reveal the domain publicly until it's live + owner-claimed in admin.

## 2. Connect it to GitHub Pages (free hosting you already have)
In your registrar's DNS panel add these records (exact values GitHub requires):

| Type | Name/Host | Value |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `noamaanzakinoamaan-max.github.io.` |

DNS spreads in 10 min–24 h.

## 3. Tell GitHub about it
Repo → **Settings → Pages** → **Custom domain** → type `yourdomain.in` → Save → wait for DNS check → tick **Enforce HTTPS** once the certificate is issued (can take up to a day).

## 4. Tell me (or do it yourself) — 3 code-level follow-ups
1. **CNAME file** must exist in the repo root containing your domain (I'll add + push it when you tell me the domain)
2. **Site URL switch** — I'll update the canonical URLs, sitemap, JSON-LD and share-preview links from the `github.io/gamesforus` address to your domain
3. **Firebase → Authentication → Authorized domains** → add `yourdomain.in` and `www.yourdomain.in`

## 5. Submit the new address to Google
Search Console → add property for `https://yourdomain.in` → submit the same `sitemap.xml` → request indexing. Old address keeps redirecting via GitHub while the custom domain is attached.

## Alternative: Cloudflare Pages instead
If you'd rather host on Cloudflare (slightly faster CDN in India): connect the repo once (Workers & Pages → gamesforus → output dir `/`), then add the custom domain in the Pages project — Cloudflare auto-creates the DNS. Only do ONE of GitHub Pages / Cloudflare Pages as the primary.
