# HeavenDigital search-discovery checklist

Technical work in this repository is only the first half. Search engines decide whether and where to index a site; rankings and AI recommendations cannot be guaranteed.

## Shipped in the site

- Canonical domain: `https://heavendigital.store/`
- Google Analytics 4: `G-EG9CFD4R0Q`
- Crawlable, clean landing pages: `/psn/`, `/pc/`, `/xbox/`, `/how-it-works/`, `/guides/`, `/about/`, `/policies/`
- Valid Article, Organization/OnlineStore, WebSite, WebPage, Breadcrumb and FAQ JSON-LD where applicable
- XML sitemap containing only clean, indexable URLs (no `#/hash` URLs)
- Search and AI crawler rules in `robots.txt`
- `llms.txt` and `llms-full.txt` factual site summaries
- Canonical, Open Graph and Twitter metadata
- Correct internal links on the custom domain

## 1. Merge/deploy first

Confirm all of these load publicly and return HTTP 200:

- `https://heavendigital.store/`
- `https://heavendigital.store/psn/`
- `https://heavendigital.store/pc/`
- `https://heavendigital.store/xbox/`
- `https://heavendigital.store/sitemap.xml`
- `https://heavendigital.store/robots.txt`

Do not submit the sitemap before the clean pages are deployed.

## 2. Google Search Console

1. Sign in at <https://search.google.com/search-console/>.
2. Add `https://heavendigital.store/` as a **URL-prefix property**, or add `heavendigital.store` as a **Domain property**.
3. URL-prefix verification may work through the installed Google Analytics tag when the same Google account has the required Analytics permission. A Domain property requires the DNS TXT record Google provides.
4. Open **Sitemaps** and submit `https://heavendigital.store/sitemap.xml`.
5. Use **URL inspection** and request indexing for the homepage, `/psn/`, `/pc/`, `/xbox/` and `/guides/`.
6. Check **Pages**, **Core Web Vitals**, **HTTPS** and **Enhancements** weekly. Fix errors rather than repeatedly requesting indexing.

## 3. Bing Webmaster Tools

1. Sign in at <https://www.bing.com/webmasters/>.
2. Import the verified site from Google Search Console or complete Bing's verification.
3. Submit the same sitemap.
4. Inspect the homepage and clean platform URLs.

Bing visibility can also affect search-backed experiences from Microsoft and other answer engines.

## 4. Confirm Analytics

After deployment:

1. Open Google Analytics → **Reports → Realtime**.
2. Visit the website in a normal browser window.
3. Navigate between Home, PC, PSN and Xbox.
4. Confirm one page-view event per route. The SPA code de-duplicates rerenders while recording hash-route navigation.
5. Exclude owner/developer traffic with an Analytics data filter if needed.

## 5. Build real authority

Technical SEO makes pages eligible; it does not create reputation. Publish original, accurate guides and earn genuine references from relevant communities, videos, social profiles and press. Disclose the seller relationship when discussing the store. Never buy links, post fake reviews, manufacture forum recommendations or ask users to generate artificial search clicks.

Keep business name, domain, contact details, policies and platform-risk disclosure consistent everywhere. If using a Google Business Profile, create one only when the business satisfies Google's eligibility rules and use truthful location/service-area information.

## 6. Content maintenance

- Review prices and platform-plan claims before publishing them in guides.
- Use exact written subscription durations; do not use “lifetime” for indefinite or revocable account access.
- Keep the platform-terms/access-loss warning visible.
- Update `lastmod` only when a page receives a meaningful change.
- Add genuinely useful guides instead of near-duplicate keyword pages.
- Keep public claims and reviews verifiable.

## Expected timing

Discovery can take days or weeks; stable rankings often take months. New domains with few independent references may take longer. Google, Bing, ChatGPT, Gemini, Claude and other systems independently choose what they crawl, index, cite or recommend.
