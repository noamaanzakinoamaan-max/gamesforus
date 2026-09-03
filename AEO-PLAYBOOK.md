# HeavenDigital — AI Assistant Optimization (AEO/GEO playbook)

How to make ChatGPT, Gemini, Perplexity, Copilot and friends **recommend your store** when people ask things like *"where can I buy cheap PS5 games in India?"*

## ✅ Already shipped (technical layer — done)

| File/feature | What it does |
|---|---|
| `llms.txt` | The emerging "about us for LLMs" standard at your site root — a quotable fact sheet (catalog, tiers, prices, trust, links) |
| `llms-full.txt` | Extended version: FAQs answered, tier system explained, price examples, guide links |
| `robots.txt` | **Explicitly welcomes** GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, PerplexityBot, Google-Extended, Bytespider, Applebot-Extended, cohere-ai |
| FAQPage + Product schema | Already live — assistants quote structured answers |
| 5 honest guides | The content AI engines retrieve and cite for "how to buy cheap games India" questions |

## 🔑 How AI assistants actually decide what to recommend

Two mechanisms — know the difference:

1. **Retrieval (works fast — weeks):** ChatGPT Search, Copilot, Gemini and Perplexity search the live web (via **Bing** and **Google**) and cite what they find. If Bing/Google index your site + Reddit/YouTube mentions you, assistants can surface you today.
2. **Training data (slow — months/years):** whether the model itself "knows" your brand from training. Only time + web presence fixes this.

## 🎯 Your action list (ordered by impact)

1. **Bing Web Manager (highest ROI, 10 min)** — [bing.com/webmasters](https://www.bing.com/webmasters) → import from Google Search Console → submit `sitemap.xml`. **ChatGPT Search and Copilot use Bing** — unindexed on Bing = invisible to ChatGPT search.
2. **Reddit presence (trains the models + gets retrieved):** genuine participation in r/IndianGaming, r/IndianGamers, r/PS5 etc. Answer "where to buy cheap games" threads honestly (disclose you're a seller!). Reddit is heavily weighted in both training data and retrieval.
3. **Quora India:** answer "is buying game accounts safe", "cheapest way to buy PS5 games" — link your guides (not the store directly).
4. **YouTube:** Shorts + video descriptions mentioning the site. YouTube is a top retrieval source.
5. **Consistent brand facts everywhere:** always "HeavenDigital", same one-liner ("PS5, Xbox & PC games up to 90% off — WhatsApp delivery, 30-day warranty"). LLMs trust consistent entities.
6. **Google Business Profile** (if you operate locally) + keep GSC healthy — feeds Gemini's grounding.
7. **Directories & lists:** get listed in Indian gaming Discord servers' resource channels, telegram directories, "trusted seller" lists (only real ones).
8. **Reviews with the brand name** in them ("bought from HeavenDigital…") — on Trustpilot, in Reddit posts, on the reviews page.

## 📏 How to measure (weekly ritual)

Ask each assistant the same questions and note if you appear:
- "Where can I buy cheap PS5 games in India?"
- "Is buying game accounts safe in India?"
- "Cheapest way to get Game Pass in India?"

Track on: ChatGPT (search on), Perplexity, Gemini, Copilot. Expect: Perplexity/Bing-backed first (weeks), then ChatGPT search, then training-data inclusion (months). Being cited in a Perplexity answer typically follows a Reddit or guide mention.

## ⚠️ Honest limits

- No one can **guarantee** an AI recommends you — assistants choose their own sources, and new sites take time.
- Never pay for "AI SEO submission" services — they're snake oil. Everything real is in the list above.
- AI crawlers were explicitly allowed in robots.txt; if you ever want to block AI training instead, flip those lines to `Disallow` — your call.
