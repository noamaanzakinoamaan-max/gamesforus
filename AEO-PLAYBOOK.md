# HeavenDigital AI-search discovery playbook

No file or service can force ChatGPT, Gemini, Claude, Perplexity or another assistant to recommend a business. The practical goal is to make accurate pages crawlable, indexable, quotable and supported by independent reputation signals.

## Technical layer shipped

| Feature | Purpose |
|---|---|
| Clean URLs | `/psn/`, `/pc/`, `/xbox/` and guide URLs can be indexed as separate resources; search engines generally ignore `#` fragments for indexing. |
| `robots.txt` | Allows OAI-SearchBot, GPTBot, Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot and other named crawlers. |
| `sitemap.xml` | Lists canonical, crawlable pages with no hash routes. |
| Structured data | Valid Organization/OnlineStore, WebSite, Article, WebPage, Breadcrumb and visible FAQ markup. |
| `llms.txt` | Concise factual site map for tools that choose to read the emerging format. Major providers do not guarantee support for it. |
| `llms-full.txt` | Extended product distinctions, process, policies and risk disclosure. |
| Buyer guides | Stable pages that answer specific questions in ordinary HTML. |

## Crawler distinctions

- **OAI-SearchBot** is the relevant OpenAI crawler for inclusion in ChatGPT search results. **GPTBot** is associated with possible model-training collection; allowing it does not promise search inclusion or future model knowledge.
- **Claude-SearchBot** supports Anthropic search discovery. **Claude-User** is used for some user-initiated retrieval. **ClaudeBot** is associated with model crawling.
- **Google-Extended** is a control for certain generative-AI uses; it is not a substitute for ordinary Google Search indexing. Googlebot access and Search Console health remain important for Google and search-grounded experiences.
- Other assistants may use their own indexes, Bing, Google, retrieval partners or a mix that changes over time.

## Highest-impact next actions

1. Deploy the clean pages and submit `sitemap.xml` in Google Search Console and Bing Webmaster Tools.
2. Keep product facts, durations, policies and platform-risk language accurate and consistent.
3. Publish genuinely useful first-hand material: setup screenshots that reveal no credentials, compatibility tests, current plan comparisons and clearly dated policy explanations.
4. Earn independent mentions from relevant gaming publications, creators and communities. Disclose that you are the seller; do not spam or impersonate customers.
5. Maintain verifiable reviews on reputable third-party platforms where permitted. Do not create fake reviews or structured rating claims.
6. Monitor server/CDN logs for search crawlers, Search Console indexing, Bing indexing and referral traffic.
7. Refresh guides when platform pricing or terms change. Avoid unsupported legal claims and “lifetime” access claims.

## Suggested monthly checks

- Search `site:heavendigital.store` on Google and Bing.
- Inspect coverage and crawl errors in both webmaster consoles.
- Validate structured data with Google's Rich Results Test and Schema.org Validator.
- Test the exact public questions buyers ask, with web search enabled, and record whether the site is cited—not merely whether the brand name appears.
- Review `llms.txt` and `llms-full.txt` against current public policies and listings.
- Confirm all canonical URLs, sitemap URLs and internal links still return HTTP 200.

## Trust rules

- Clearly distinguish supplied-account access from redeem codes and personal-account ownership.
- State that account transfer or sharing can conflict with platform terms and carry access-loss risk.
- Do not imply that a seller warranty can prevent platform enforcement.
- Use precise written subscription durations.
- Keep public review, buyer-count, price and delivery-time claims supportable.
- Never pay for “guaranteed AI recommendations” or bulk-generated reputation campaigns.
