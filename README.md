# 🐾 Flea & Tick Tracker

A tiny web app to track when and what flea/tick treatment each dog took, and what's
due next. Static site on **GitHub Pages**, data in **Supabase**.

## The pack
Midnight ♂, Major ♂, Meadow ♀, Scout ♀, Moonshine ♀ (German Shorthaired Pointers)
and Dori ♀ (Doberman Pinscher).

## How it works
- **Dashboard** — one card per dog with last treatment and next-due date, color-coded:
  🟢 Protected · 🟠 Due soon (≤7 days) · 🔴 Overdue · ⚪ No record.
- **Log a treatment** — pick the dog, product (auto-fills the typical re-dose interval),
  date, optional dose/notes. Next-due is computed automatically.
- **History** — full log, filterable by dog, with delete.

## Data
Three tables live in the shared Supabase project (prefixed so they don't collide with
other apps):
- `flea_dogs` — the roster
- `flea_products` — common products + default re-dose interval (days)
- `flea_treatments` — every dose given (with a generated `next_due` column)

Access is open (no login) per setup choice. The publishable key in `config.js` is safe
to expose; row-level security limits it to the `flea_*` tables only.

## Editing the roster or products
Add/edit dogs or products directly in the Supabase table editor, or ask Claude to run a
quick SQL update. The app picks up changes on next load.

## Local preview
```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

## Files
| File | Purpose |
|------|---------|
| `index.html` | Page structure |
| `styles.css` | Styling (mobile-first) |
| `app.js` | All logic + Supabase calls |
| `config.js` | Supabase URL + publishable key |
