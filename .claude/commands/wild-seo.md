# /wild-seo [id]

Generate the SEO package (title, description, hashtags, copy-ready block) for a Wild Capture content item.

**IMPORTANT:** This command refuses to run if scenes are not yet approved. SEO is NEVER speculative — it's generated only after all scenes are `video_done`.

**Usage:**

- `/wild-seo 42` — generate SEO for content_item id 42
- `/wild-seo` — generate SEO for the most recently rendered reel

**What it produces:**

1. **Title** — 1 emoji, <10 words, curiosity-gap hook
2. **Description** — 2–4 sentences for Reels (ending exactly "Follow for more hidden moments from the wild."); 2–3 sentences for portraits (ending with a question)
3. **Hashtags** — 15 for Reels, 6–8 for portraits
4. **Copy-ready block** — title + description + hashtags in one code block, ready to paste into Facebook

**Stores result** in `content_items.seo` jsonb for the given id.

**What to do with the result:**
Copy the copy-ready block and paste directly into the Facebook post caption when publishing.
