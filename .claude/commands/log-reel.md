# /log-reel [id] [views] [watch_through_pct] [follows] [distribution]

Log performance data for a posted Wild Capture reel.

**Usage:**

- `/log-reel 42 8200 47.3 11 +0.5` — log reel id 42: 8,200 views, 47.3% watch-through, 11 follows, +0.5x distribution
- `/log-reel` — interactive mode: asks for id and metrics one by one

**What it does:**

1. Updates `content_items` row: `status='posted'`, stores raw metrics in a `metrics` jsonb field
2. Appends a row to `data/reels.csv` (create if not exists):
   ```
   id,title,format,slot,posted_at,views,watch_through_pct,follows,follows_per_1k,distribution
   42,"What She Does Before...",11s,Fri 23:00,2026-06-21,8200,47.3,11,1.34,+0.5
   ```
3. Reports: "Logged C-42. follows/1k: {calc}. Distribution: {dist}."

**Fields:**

- `views`: total video views
- `watch_through_pct`: % viewers who watched to the end (from Facebook Insights)
- `follows`: follows gained from this reel
- `distribution`: Facebook distribution multiplier (+0.3x, +1x, 0x, negative)

**Note on distribution:** If Facebook doesn't show a numeric multiplier, use: positive = "+", neutral = "0", negative = "-". Distribution is the primary success signal on this channel, not views.

**Why this matters:**
The performance analyst and house-style recommendations are only as good as the data logged here. Update after each post.
