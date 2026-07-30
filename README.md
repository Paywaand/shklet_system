# Shklet — Kiosk Sales & Management System

A bilingual (English / Kurdish Sorani) web-based sales and management system
for **Shklet**, a counter-service kiosk brand with three physical branches
across two cities — Sulaymaniyah (2 branches) and Erbil (1 branch).

---

## Why this stack

- **Next.js 14+ App Router + TypeScript** — one codebase for the UI and the
  API routes, deploys as a single service, works well for a mobile/tablet-
  first POS screen plus an admin back office.
- **PostgreSQL via Prisma** — real relational persistence with transactional
  writes (needed for stock movements, order placement with pager-conflict
  checks, cash tracking balances) and safe for a handful of concurrent staff
  devices per branch.
- **Cookie session + `jose` (HS256 JWT) + bcrypt** — no email anywhere in the
  system, per the brief. Sessions are **DB-backed**: the JWT only carries a
  session ID, and every request re-checks that the session row exists, is not
  revoked, and has not expired — so deleting a session row (or deactivating a
  staff account) logs that device out immediately, without waiting for the
  JWT's own expiry.
- **Tailwind CSS v4** with the exact brand hex values encoded as named tokens
  (`shklet-red`, `shklet-cream`, `shklet-green`, `shklet-yellow`,
  `shklet-brown`, `shklet-purple`) in `src/app/globals.css` — never raw hex
  scattered through components.
- **Recharts** for the Sales Overview charts (revenue by day, top items,
  orders by hour, payment split).
- **lucide-react** for icons.

---

## Internationalization architecture

This was built first, not retrofitted:

- `src/i18n/dict.ts` defines a single `Dict` TypeScript interface.
- `src/i18n/en.ts` and `src/i18n/ku.ts` each declare `satisfies Dict` — a key
  present in one language but missing (or misspelled) in the other is a
  **compile-time TypeScript error**, not a silent runtime fallback.
- `src/i18n/index.tsx` exports a `LanguageProvider` (React Context) with
  `t()`, `lang`, `setLang()`, `toggleLang()`. The choice persists in
  `localStorage` and a small inline script in `layout.tsx`
  (`src/lib/no-flash-script.ts`) applies `lang`/`dir`/theme to `<html>`
  **before** React hydrates, so there's no flash of the wrong language or
  direction on reload.
- **RTL handling**: when Kurdish is active, `dir="rtl"` is set on `<html>`.
  Prices/numbers are wrapped in the `.ltr-nums` CSS utility class (see
  `globals.css`) so they never visually reverse inside RTL text.
- **Pluralization**: `src/i18n/plural.ts` centralizes the English `s`-suffix
  rule vs. Kurdish's non-suffix pluralization, so no component hardcodes
  `count > 1 ? "s" : ""`.
- Real menu item names (from `shklet_menu_seed.md`) are stored as data
  (`name` / `nameKu` columns), not UI-chrome translation keys — they were
  already provided by the business and don't need re-translation.

---

## Cities, Branches, and role scoping (the core architectural decision)

- `City` (Sulaymaniyah, Erbil) owns: menu pricing/availability, Warehouse,
  Daily Needs, Expenses, Cash Tracking.
- `Branch` (Sulaymaniyah ×2, Erbil ×1) belongs to exactly one `City` and owns:
  the Cashier/POS session, its own pager pool, its own active-orders queue.
- **Role scoping is enforced server-side on every relevant API route**, not
  just hidden in the UI:
  - `admin` — global, unrestricted.
  - `manager` — locked to one assigned `City` (`user.cityId`); every
    Sales/Expenses/Warehouse/Menu/Daily Needs query is filtered through
    `scopeCityFilter()` in `src/lib/auth.ts`.
  - `cashier` — locked to one assigned `Branch` (`user.branchId`); the
    Cashier screen loads that branch's own menu/pager queue automatically,
    with no branch selector in the UI at all (there is nothing to pick).
- Recipe/batch costs and per-item margins are redacted server-side for
  non-admin roles (Production, Ingredient Usage, and Estimated Profit API
  routes all `requireRole("ADMIN")`).

See `prisma/schema.prisma` for the full data model and `src/lib/auth.ts` for
the scoping helpers (`scopeCityFilter`, `scopeBranchFilter`, `requireRole`).

---

## What's implemented

All 15 modules from the spec, each bilingual from the start:

0. Cities & Branches (schema + role scoping — no dedicated UI page, it's the
   substrate every other module reads through)
1. Cashier / POS + Active Orders (walk-in + delivery, modifiers, pager
   conflict handling, receipt-ready order codes)
2. Menu Management (categories, items, per-city price + availability
   overrides, modifier groups editor)
3. Warehouse / Inventory (categories, stock movements with cost derivation,
   low-stock badges, editable/deletable movement log with reversal)
4. Daily Needs (checklist grouped by inventory category, print-to-image)
5. Ingredient Usage (theoretical vs. actual usage, wastage %)
6. Production (recipes/BOM, batch costing, dispatch to a city)
7. Estimated Profit (recipe-derived, clearly labeled, isolated from real
   financials)
8. Expenses (category, date range filters, running total)
9. Events (create/close pop-ups, frozen evaluation on close)
10. Sales Overview / Analytics (date presets, Recharts charts, CSV export,
    searchable order history, Expected Cash on Hand)
11. Profit Overview (admin only)
12. Cash Tracking (safe deposits, withdrawals capped at source balance,
    per-person totals)
13. Staff Management (role-based city/branch assignment, salary admin-only,
    password reset, business-hours setting for the business-day boundary)
14. Roles & Permissions (module access matrix + last-50 audit log)
15. Reports (branded HTML → print-to-PDF monthly report)

### Deliberately out of scope for this pass

- **Offline mode for the Cashier screen** — the spec calls this a
  "nice-to-have," and it was explicitly descoped for this build to keep the
  system simple; the Cashier screen requires connectivity. Revisit if the
  kiosk's internet reliability becomes a real problem.
- **Mascot art** — per instruction, no mascot characters are used anywhere
  in this build (login screen, empty states, etc. use plain text/icons
  instead). The brand color palette is fully applied throughout.
- **AMSI PRO font** — not licensed/sourced. The app falls back to
  `system-ui` for English headings (see `src/app/globals.css`, the
  `--font-amsi` token). Swap in the real `.otf`/`.ttf` files under
  `public/brand/` and update the `@font-face`/`--font-amsi` declaration when
  available.
- **UniSIRWAN Ping font** — same situation; Kurdish text currently renders
  with a system Arabic-script fallback. Drop the four weights (Regular,
  Medium, Bold, Heavy) into `public/brand/` and wire them up via
  `next/font/local` when the files are available.
- **Logo/brand imagery** — no real logo files were supplied, only a written
  spec. Placeholder SVG/PNG assets (abstract heart-and-leaf mark in brand
  colors, no character/mascot) were generated into `public/brand/` and
  `public/icons/` so the app has *something* to render immediately; swap
  them for the real files using the same filenames.

---

## Getting started (local development)

### 1. Prerequisites
- Node.js 20+
- A PostgreSQL 14+ database

### 2. Install
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
# edit .env: DATABASE_URL, AUTH_SECRET (openssl rand -base64 48), SESSION_DAYS
```

### 4. Database
```bash
npm run db:migrate    # applies prisma/migrations
npm run db:seed       # idempotent — safe to re-run; seeds cities, branches,
                       # the real menu from shklet_menu_seed.md, and 3 demo accounts
```

### 5. Run
```bash
npm run dev
# open http://localhost:3000
```

### Seeded accounts (change these passwords after first login)
| Username | Password | Role | Scope |
|---|---|---|---|
| `admin` | `Shklet@2026` | Admin | Global |
| `suly.manager` | `Manager@2026` | Manager | Sulaymaniyah (both branches) |
| `suly.cashier1` | `Cashier@2026` | Cashier | Sulaymaniyah — Branch 1 |

---

## Deployment (Railway)

1. Push this repo to GitHub, create a new Railway project from it, and add a
   managed **PostgreSQL** plugin — Railway will inject `DATABASE_URL`
   automatically.
2. Set the remaining environment variables on the service: `AUTH_SECRET`
   (generate with `openssl rand -base64 48`), `SESSION_DAYS`.
3. Railway builds and runs the included `Dockerfile`. On container start,
   `npx prisma migrate deploy` applies any pending migrations before the
   server starts (see the Dockerfile `CMD`).
4. Seed once, manually, after the first successful deploy:
   ```bash
   railway run npm run db:seed
   ```
   The seed script is idempotent (uses `upsert`), so re-running it later is
   safe and won't duplicate data.
5. Point your domain's DNS at Railway (ALIAS/CNAME on the apex, CNAME on
   `www`) — Railway issues SSL automatically.

---

## Project structure

```
src/
├─ app/
│  ├─ (app)/              # authenticated pages behind the sidebar shell
│  │  ├─ cashier/          # module 1
│  │  ├─ menu/             # module 2
│  │  ├─ warehouse/        # module 3
│  │  ├─ daily-needs/      # module 4
│  │  ├─ ingredient-usage/ # module 5
│  │  ├─ production/       # module 6
│  │  ├─ estimated-profit/ # module 7
│  │  ├─ expenses/         # module 8
│  │  ├─ events/           # module 9
│  │  ├─ sales/            # module 10
│  │  ├─ profit/           # module 11
│  │  ├─ cash-tracking/    # module 12
│  │  ├─ staff/            # module 13
│  │  ├─ roles/            # module 14
│  │  └─ reports/          # module 15
│  ├─ api/                 # route handlers, one folder per resource
│  └─ login/
├─ i18n/                   # dict.ts, en.ts, ku.ts, LanguageProvider
├─ lib/                    # auth.ts, prisma.ts, permissions.ts, datetime.ts, money.ts, ...
└─ components/             # sidebar, theme provider, toaster, ui primitives

prisma/
├─ schema.prisma
└─ seed.ts                 # idempotent — seeds cities/branches/menu/staff
```

---

## Printing receipts (module 1)

No physical POS printer is required by default — the on-screen receipt uses
printer-friendly CSS (`.no-print` utility already wired into `globals.css`)
sized for an 80mm thermal strip. For a real kiosk deployment with a silent
(no-dialog) print flow, launch Chrome/Chromium with the `--kiosk-printing`
flag pointed at a default printer, or use [QZ Tray](https://qz.io/) for more
control over printer selection from the browser.

---

## Known follow-ups for a production launch

- Confirm the real pager range per branch (seeded as 1–30) with the business
  owner and adjust `Branch.pagerRangeStart` / `pagerRangeEnd`.
- Wire up a real delivery-platform integration (e.g. Toters) if/when Shklet
  formalizes one — the `Order` model already has `deliveryReference`,
  `deliveryCommissionPct`, `deliveryGross`, and `deliveryNet` fields kept
  fully separate from walk-in sales aggregates.
- Source and drop in the real AMSI PRO and UniSIRWAN Ping font files, and the
  real logo artwork, per the notes above.
- Add Sentry (optional, recommended per the brief) once a DSN is available.
