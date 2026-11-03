# Sellix (Bytewave POS)

Sellix is a multi-business management platform. One app runs several kinds of business; each business (a **tenant**) gets its own dashboard, staff, permissions and data, and a **super admin** manages all of them.

## Modules

Each tenant has a business type (`appType`) that decides which module it gets.

| Module          | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retail**      | POS with camera product recognition (barcode and on-device text reading), products, inventory, warehouses, orders, customers, analytics.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Eatery**      | **Customers** (public site at `/eat`): a directory and a branded storefront per restaurant; order for pickup, delivery or dine-in (table QR codes); pay by cash, MoMo or at the table; live order tracking. **Owners**: overview with profit, live order board, counter POS with receipts, menu (options, combos, timed availability, deals), ingredients with pack sizes, recipes and packaging, stock and waste, expenses, sales history with daily totals, CSV export and end-of-day reports, brand and theme editor (18 design styles, contrast checks), settings. |
| **Real estate** | Properties and land, configurable room types, tenants, leases, rent and arrears, short-stay bookings, maintenance, building projects with phase costs, documents shareable on WhatsApp.                                                                                                                                                                                                                                                                                                                                                                                |
| **Amusement**   | Attractions, tickets, bookings, and a public leaderboard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Super admin** | Register businesses and choose their type and plan, suspend or delete them, platform stats. **Billing**: recurring revenue, payments collected, overdue businesses and plan requests. **Plans**: prices, staff limits and a feature matrix across every module.                                                                                                                                                                                                                                                                                                        |

Across all modules:

- **Login and permissions:** an owner can run several businesses and picks one at sign-in. Staff permissions control both the menu and which routes they can open.
- **Subscriptions:** each business is on a plan (trial, paid, payment due, expired). The plan decides how many staff accounts it gets and which extra pages it unlocks. Locked pages stay in the menu with a lock and show an upgrade screen. Owners see **Plan & billing** (`/billing`): their plan, seats used, payments, how to pay, and a button to ask for a change. An expired business is locked out of the dashboard but keeps its data. If billing can't be loaded, nothing is locked.
- **Errors and loading:** errors are handled one way everywhere (no retry loops), and the dashboard shows a loading placeholder rather than the wrong module's menu.
- **Customer site:** mobile-first, with readable contrast enforced in every theme.
- **Ghana defaults:** cedis (₵), MoMo, GhanaPost GPS addresses, WhatsApp sharing.

## Status

| Module              | Data                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Retail, Amusement   | Live Sellix backend                                                                                                                                        |
| Real estate, Eatery | Complete in the frontend, saved in the browser until their backend endpoints exist ([BACKEND_REQUIREMENTS.md](BACKEND_REQUIREMENTS.md) §6 and §7)          |
| Billing             | Complete in the frontend, saved in a JSON file on the Next.js server until the backend endpoints exist (§8). Access is enforced in the UI only until then. |

Browser mode keeps data in one browser only. For the eatery, that includes customers' orders, so to try ordering, open the storefront and the dashboard in two tabs of the same browser.

## Tech

- Next.js 14 (App Router) and TypeScript
- next-auth: tenant-bound tokens with refresh
- React Query and axios (`src/lib/axios-client.ts`, with 401 refresh and tenant headers)
- Tailwind CSS, Radix UI, lucide icons
- Vitest and Testing Library
- Self-hosted fonts (`@fontsource`), so builds never depend on Google Fonts

## Getting started

Use Node 18 or newer.

```bash
npm install --include=dev
npm run dev
```

Then open http://localhost:3000.

> If your shell has `NODE_ENV=production` set, a plain `npm install` skips dev dependencies (TypeScript, Vitest, Husky) and can remove them. Use `--include=dev`, and run the tests with `NODE_ENV=test`.

### Environment (`.env.local`)

| Variable                              | Purpose                                                                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`                 | Sellix backend base URL, e.g. `https://apis.sellix.example.com/api`                                         |
| `NEXT_PUBLIC_ROOT_DOMAIN`             | Optional. On the root domain only the app picker is reachable; tenants use subdomains.                      |
| `NEXT_PUBLIC_REAL_ESTATE_DATA_SOURCE` | `local` (browser) or `api` (default)                                                                        |
| `NEXT_PUBLIC_EATERY_DATA_SOURCE`      | `local` (browser) or `api` (default)                                                                        |
| `BILLING_STORE`                       | `file` (JSON on this server) or `api` (default). Server-only.                                               |
| `BILLING_FILE`                        | Optional. Where `file` keeps billing; default `.data/billing.json`. Needs a writable disk (not serverless). |

Other auth settings are in `.env.local`. `NEXT_PUBLIC_*` values are read when the server starts, so restart `npm run dev` after changing them.

### Scripts

| Command                                | Does                                                                       |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                          | Development server                                                         |
| `npm run build` / `npm start`          | Production build and server                                                |
| `npm test`                             | Unit and UI tests (`NODE_ENV=test npm test` if your shell sets production) |
| `npx tsc --noEmit -p .` and `-p tests` | Type-check the app and the tests                                           |
| `npm run format`                       | Prettier                                                                   |

A pre-commit hook (Husky) runs lint-staged, formatting and `npm run build`.

## Project layout

```
src/
  app/[locale]/
    (auth)/              sign-in (owners, staff), business picker
    (stores)/            retail
    (eatery)/eatery/     eatery owner dashboard
    (eatery-public)/eat/ eatery customer site (public)
    (real-estate)/       real estate
    (amusement)/         amusement (+ (amusement-public) leaderboard)
    (super-admin)/       platform admin (apps, billing, plans)
    (account)/billing/   an owner's plan & billing page (every module)
  components/
    kit/                 shared design kit (cards, buttons, drawers, forms, charts)
    eatery/              themed storefront components
    billing/             subscription gate, lock/upgrade screens, banners
    generals/layouts/    dashboard shell (sidebar, top bar)
  lib/
    eatery/              eatery model, themes, pricing, costing, sales, data source
    subscription/        plans, gated features, access rules, billing actions, store
    app-type.ts          business types and which menu a page gets
    axios-client.ts      API client (auth, refresh, tenant headers)
  middleware.ts          sign-in and per-permission route guard
tests/                   Vitest suites
docs/EATERY_PLATFORM.md  eatery design notes: theming, data model, costing, sales
BACKEND_REQUIREMENTS.md  API contract for the backend team
```

Each module keeps its rules (pricing, rent, stock, profit) in pure, tested functions, and reads and writes through a data source that targets either the API or the browser. Switching a module to the backend is a configuration change, not a rewrite.

## Further reading

- [BACKEND_REQUIREMENTS.md](BACKEND_REQUIREMENTS.md): endpoints, objects, validation and the error contract the frontend expects.
- [docs/EATERY_PLATFORM.md](docs/EATERY_PLATFORM.md): eatery design rationale, theme format, data model, costing and sales.
