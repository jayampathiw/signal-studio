# /wild-status

Show the current state of the Wild Capture production queue.

**Displays:**
1. **Queue summary** — count by status (brief, storyboard, generating, rendered, posted)
2. **In-flight reels** — any item currently `generating`, with which scene is active
3. **Open threads** — all items with a non-null `status_note` (blocked on a decision)
4. **Scheduled this week** — items with `scheduled_for` in the next 7 days, with slot validation (flags any Tue/Wed/Thu slots)
5. **Recently rendered** — items `rendered` but not yet `posted`
6. **Credit balance** — quick check via Higgsfield `show_plans_and_credits`

**Query:**
```sql
SELECT id, format, status, slot, scheduled_for, status_note, title, created_at
FROM content_items
WHERE channel_key = 'wildlife/intimacy/EN'
ORDER BY created_at DESC
LIMIT 30;
```

**Usage:** `/wild-status` — no arguments needed

**Common follow-up commands:**
- `/new-wild-reel [id]` to resume a stalled generation
- `/wild-seo [id]` to add SEO to a rendered reel
- `/log-reel [id]` to log a posted reel's performance
