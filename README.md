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
  date, the dog's weight, and a **dosage** chosen from the product's standard weight
  bands (auto-suggested from the weight; manual entry available). Next-due is computed
  automatically. Edit or delete any entry.
- **Inventory** — track stock per product + dosage band: units per box, cost per box,
  and boxes bought. **On-hand is computed automatically** as (units bought − doses
  logged for that product/band), so logging a treatment decrements stock and deleting
  it restores it. A "Need more" flag appears when on-hand drops to your alert threshold.
  "+1 box" restocks; cost-per-unit is shown.
- **History** — full log, filterable by dog, with edit/delete.
- **Daily email reminders** — see below.

### Dosage data
Standard weight-band dosing is seeded in `flea_product_doses` from manufacturer/FDA
labeling (NexGard, NexGard Plus, Simparica, Simparica Trio, Bravecto chew/topical,
Credelio, Frontline Plus, K9 Advantix II, Advantage II, Vectra 3D, Sentinel Spectrum,
Seresto). **Always confirm against the product label/your vet** — these are a guide.

### Mobile
Installable as a home-screen app (web manifest), 16px inputs (no iOS zoom), 44px touch
targets, and safe-area aware. Works the same in a desktop browser.

## Data
Tables live in the shared Supabase project (prefixed so they don't collide with
other apps):
- `flea_dogs` — the roster
- `flea_products` — common products + default re-dose interval (days)
- `flea_product_doses` — standard weight-band dosing per product
- `flea_treatments` — every dose given (`weight_lbs`, `dose`, generated `next_due`)
- `flea_inventory` — stock lines (units/box, cost/box, boxes bought, alert threshold)

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
