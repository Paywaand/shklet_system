# Shklet — POS & Management System

A complete, mobile-first web app for the **Shklet** food brand: POS, live order queue with
pager numbers, menu, inventory, sales analytics, staff accounts, and a role/permission
matrix — built for **two fully separated branches** (Sulaymaniyah & Erbil) under one
super admin. On-brand with the Shklet mascot, colours, and font.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | One codebase for UI + API, mobile-first, deploys anywhere |
| Styling | **Tailwind CSS** | Brand palette baked in (`#EC2231` red, `#F2E8DC` cream, `#1A1A1A` ink) |
| Database | **Prisma + PostgreSQL** | Managed Postgres in prod; local Postgres for dev |
| Auth | **Username + password** (bcrypt) with **JWT session cookie** (`jose`) | No email, unlimited staff, role-based — enforced in middleware *and* every API route |
| Charts | **Recharts** | Revenue, top items, hourly load, payment split |

There is **no email** anywhere — login is username + password only.

---

## Branches: Suli & Erbil (fully separated)

Shklet operates in **Sulaymaniyah** and **Erbil**. The two cities are completely
isolated inside one deployment:

- **Every operational table carries a `branch` column** — menu, inventory, orders,
  expenses, events, cash tracking, delivery orders, daily needs. Nothing is ever
  aggregated across cities.
- **Managers & cashiers belong to exactly one branch** (`User.branch`). Every API
  call they make is hard-scoped to their branch server-side — whatever the client
  sends is ignored.
- **One super admin** (`User.branch = null`) oversees both. A branch switcher in the
  sidebar picks which city he is currently viewing (stored in a cookie the server
  reads on every request); he still always views one branch at a time.
- Admin accounts created from the Staff page are super admins; managers/cashiers
  must be assigned to Suli or Erbil.

## Delivery platforms (per branch)

Each branch has its **own delivery app with its own commission**:

| Branch | Platform | Default commission |
|---|---|---|
| Sulaymaniyah | **Toters** | 20% |
| Erbil | **Talabat** | 25% |

- Configured per-branch in `DeliverySettings` (name, %, accent colour) — the super
  admin can change them anytime from the **Delivery** page.
- Every delivery order **snapshots** the platform name + commission at order time,
  so changing the % later never rewrites history.
- Delivery revenue lives in **separate tables** (`DeliveryOrder`) and is never mixed
  into branch sales or profit.

## Modules

1. **Cashier (POS)** — items grouped by category (All tab + per-category tabs). Order types:
   - **Walk-in** — pager 1–30 (per branch), cash/card, printable receipt, Ready button.
     **Offline mode:** menu + active queue cached locally; orders placed while
     disconnected are queued and synced on reconnect. Pager conflicts are flagged
     for the cashier to resolve.
   - **Take Away** — same pager pool, with a paid/unpaid tracker.
   - **Delivery** — the branch's platform (Toters/Talabat); optional driver/order
     reference; payment handled by the platform; tracks
     **placed → ready → driver arrived → collected** with timing; stores **gross**
     and **net** (gross − platform commission).
2. **Menu Management** — per-branch categories + items, price, availability, and a
   reusable **modifiers editor** (option groups, required/optional).
3. **Warehouse / Inventory** — per-branch stock items with units, thresholds &
   low-stock alerts. Adding stock records the **total delivery cost** and derives the
   **unit cost**; deductions require a reason and log the **usage cost**. Full
   movement log with costs (costs redacted for non-admins).
4. **Production** — **Recipes (BOM)** only: one bill of materials per menu item, lines
   linked to warehouse items for live cost-per-gram, with gross profit and GP% per
   serving. *(admin only)*
5. **Expenses** — log operating costs with date, description, amount; filter by date
   range & category; per-branch totals. *(admin + manager)*
6. **Sales Overview** — business-day date presets (17:00–01:00 overnight shift handled
   correctly). Revenue & timing stats, charts, searchable order history, CSV export,
   **Expected Cash on Hand**.
7. **Cash Tracking** *(admin only)* — safe ledger, withdrawals to named people
   (free-text recipients), historical cash adjustments — all per-branch.
8. **Profit Overview** — gross profit for a day/week/month: sales − expenses −
   ingredient usage cost. Delivery revenue shown separately. *(admin only)*
9. **Estimated Profit** — Σ(units sold × BOM gross profit per item). *(admin only)*
10. **Reports** — downloadable branded monthly report per branch: sales, expenses,
    financials, orders-by-hour, prep-time calendar, top items. *(admin only)*
11. **Staff Management** — add/edit/deactivate accounts, roles, **branch assignment**,
    admin password reset, monthly salary + payroll total. *(salary is admin-only)*
12. **Events** — external pop-up events per branch. POS, warehouse usage, and expenses
    can be tagged to an active event; closing produces a read-only evaluation.
13. **Delivery** *(admin only)* — the branch's platform revenue: gross / commission /
    net, monthly breakdown, timing stats, order history, CSV export, and the
    **platform settings** editor (name + commission %).
14. **Roles & Permissions** — per-role grant matrix, enforced client- and server-side.

## Getting started (local)

```bash
npm install
cp .env.example .env   # set DATABASE_URL + AUTH_SECRET
npm run setup          # prisma migrate dev + seed
npm run dev
```

Default login: `admin / admin123` (super admin — change it after first login).

The seed creates:
- the super admin,
- the role-permission matrix,
- delivery settings (Suli → Toters 20%, Erbil → Talabat 25%),
- a small starter menu + warehouse per branch.

## Deployment

Docker-ready (`Dockerfile`, standalone Next.js output). On Railway: add a Postgres
service, set `DATABASE_URL`, `AUTH_SECRET`, `TZ=Asia/Baghdad`. Migrations run on boot
(`npm run start:prod`); optional Cloudflare R2 daily backups via the `R2_*` env vars.
