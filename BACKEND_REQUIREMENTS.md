# Backend work needed: multi-tenant SaaS support for Bytewave POS

## Context

Bytewave POS is being turned into a multi-tenant SaaS platform: one Next.js frontend serves many businesses ("tenants"), each on its own subdomain (e.g. `acme-diner.bytewave.app`), each running one of several verticals (retail/POS, eatery, amusement park, more later). A visitor picks a business by name on a marketing page, gets sent to that business's subdomain, and logs in there.

Every API call already carries an `X-Tenant-Domain` header identifying which tenant it's for — this part already works, since every existing endpoint is scoped by it. What's missing is backend support for the platform-level pieces: creating/managing tenants themselves, and giving a "super admin" (platform operator, not a tenant user) visibility and control across all of them.

Until these exist, the frontend has a **self-contained, local-only placeholder** for all of this (a JSON file, hashed passwords via Node's `crypto`, a bootstrap env-var super-admin login) so the feature is fully clickable today. That placeholder needs to be replaced by real backend endpoints — this doc specs exactly what's needed, matching the contracts the frontend already assumes.

## 1. Tenant management (new)

A tenant record needs at least:

```
{
  id: string
  name: string            // business display name, e.g. "Acme Diner"
  slug: string            // subdomain label, unique, e.g. "acme-diner" — this is the X-Tenant-Domain value
  appType: string          // "retail" | "eatery" | "amusement" | ... (which vertical/feature set)
  status: "active" | "suspended"
  ownerName: string
  ownerEmail: string
  createdAt: string
}
```

Needed endpoints (platform-scoped — see auth section below for how these should be protected):

- `GET /api/platform/tenants` — list all tenants
- `POST /api/platform/tenants` — create a tenant AND its first owner/admin account in one call:
  ```
  { name, slug, appType, ownerName, ownerEmail, password }
  ```
  Should validate `slug` is unique (409 if taken), hash the password, and make the resulting account immediately usable via the existing `/auth/admin-login` endpoint scoped to `X-Tenant-Domain: slug`.
- `PATCH /api/platform/tenants/:id` — update `name` / `slug` / `appType` / `status`. Setting `status: "suspended"` must cause that tenant's `/auth/admin-login` (and ideally all API calls scoped to it) to be rejected — suspension needs real teeth, not just a cosmetic flag.
- `DELETE /api/platform/tenants/:id` — remove a tenant. Confirm with product/legal whether this should cascade-delete tenant data or just deactivate; the frontend currently treats it as a hard delete.
- `GET /api/platform/tenants/lookup?slug=acme-diner` — lightweight, used by the public "find your business" picker page _before_ any login exists. Should return just enough to confirm existence (e.g. `{ exists: true }`), not full tenant details — this one is effectively public-facing (called from an unauthenticated page), so don't leak sensitive info through it.

## 2. `appType` on existing login/refresh responses

`POST /auth/admin-login`, `POST /employees/login`, and `POST /auth/refresh` currently return a user object without an `appType` field. Please add it (sourced from the tenant record's `appType`) so the frontend can route a logged-in user to the correct vertical's UI (`/stores/...` for retail, `/eatery`, `/amusement`, etc.) instead of defaulting everyone to retail. Everything else about these response shapes can stay as-is:

```
{
  data: {
    accessToken: string
    refreshToken: string
    accessTokenExpiry: number
    refreshTokenExpiry: number
    user: {
      id: number
      username: string
      accountType: string
      avatar: string
      phone: string
      email: string
      createdAt: string
      updatedAt: string
      appType: string   // <-- new
    }
  }
  status: boolean
}
```

## 3. Platform-level visibility into a tenant (for the super admin dashboard)

Right now the super admin's per-tenant "View" panel shows fabricated numbers (employee count, product count, sales volume, last activity) and a fake staff list, clearly labeled as mock data pending this work. To make it real:

- `GET /api/platform/tenants/:id/stats` — something like:
  ```
  { employeeCount, productCount, salesVolume, lastActivityAt }
  ```
- `GET /api/platform/tenants/:id/employees` — list of that tenant's employee accounts (name, email, role/permissions, active/suspended)
- `PATCH /api/platform/tenants/:id/employees/:employeeId` — at minimum, ability to suspend/reactivate one employee from the platform level (this was explicitly requested; scope was intentionally limited to _view + suspend_, not full employee CRUD, from the platform view)

These need to work **without** the caller having a normal per-tenant admin/employee bearer token — see below.

## Auth: how should "platform-level" calls authenticate?

This is the one open design question. Everything above needs to be callable by a platform operator who is not logged into any specific tenant and has no per-tenant `X-Tenant-Domain`-scoped bearer token. Options, roughly in order of how much backend work they imply:

1. **A platform/service API key** — a single secret the frontend's server-side code sends (e.g. `X-Platform-Key` header), checked against an env var on your side. Simplest, fine for an internal admin surface not exposed to end users.
2. **A real super-admin account type** in your existing auth system, whose bearer token is allowed to call the `/platform/*` routes and pass an explicit tenant id/slug per request instead of relying on `X-Tenant-Domain`.
3. Something else you already have conventions for — happy to adapt the frontend to whatever's least friction on your side.

Whichever you pick, let us know the exact header/token mechanism and we'll wire the frontend's existing super-admin login (currently a bootstrap-only env-var credential, `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD`) to call it.

## 4. Amusement park vertical (new) — ✅ DONE, live on the backend

All four endpoint groups below (Attractions, Tickets, Bookings, Leaderboard, including the public `GET /leaderboard/public`) are implemented and deployed. The frontend (`/amusement/attractions`, `/amusement/tickets`, `/amusement/bookings`, `/amusement/board`) has been checked against the real contract field-by-field and matches exactly — no frontend changes were needed. Kept below for reference. Same request-shape conventions as the rest of the API (trailing-slash collection routes, `X-Tenant-Domain`-scoped, `{ data: ... }` envelope).

**Attractions** — rides/attractions with capacity and ticket pricing. This park's attractions are arena-style venues (skating rink, go-karting track, arcade room, trampoline arena) plus activities matching Bambo's Adventure Park's (Accra) lineup (paintball, bubble soccer, foot dart, sumo wrestling, human foosball), so `type` is a fixed category rather than free text:

```
{
  id, name,
  type: "skating" | "go-karting" | "arcade" | "trampoline"
      | "paintball" | "bubble-soccer" | "foot-dart" | "sumo-wrestling" | "human-foosball" | "other",
  capacity, ticketPrice,
  status: "active" | "maintenance" | "closed"
}
```

- `GET /attractions/` — list
- `POST /attractions/` — create, body `{ name, type, capacity, ticketPrice, status }`
- `PUT /attractions/:id` — update, same body
- `DELETE /attractions/:id`

**Tickets** — entry/ride ticket sales, optionally tied to an attraction (`attractionId: null` = general admission):

```
{ id, attractionId: number | null, buyerName: string | null, quantity, status: "valid" | "redeemed", createdAt }
```

- `GET /tickets/` — list
- `POST /tickets/` — create, body `{ attractionId, buyerName, quantity }`
- `PATCH /tickets/:id/redeem` — mark a ticket redeemed
- `DELETE /tickets/:id` — void a ticket

**Bookings** — group bookings/reservations, optionally tied to an attraction:

```
{ id, customerName, phone, date, partySize, attractionId: number | null, status: "pending" | "confirmed" | "cancelled", notes }
```

- `GET /bookings/` — list
- `POST /bookings/` — create
- `PUT /bookings/:id` — update (also used for status changes — confirm/cancel)
- `DELETE /bookings/:id`

**Leaderboard** — recorded scores/times per attraction, so parks can run a "top scores" board. What counts as a good score is direction-dependent per attraction type on the frontend (e.g. go-karting is fastest-lap/lower-is-better, arcade is high-score/higher-is-better) — the backend doesn't need to know this, it just stores and returns raw entries:

```
{ id, attractionId, participantName, teamName: string | null, score: number, achievedAt: string }
```

- `GET /leaderboard/` — list, normal tenant-scoped auth (bearer token + `X-Tenant-Domain`) — used by the staff management page where entries get recorded
- `POST /leaderboard/` — create
- `PUT /leaderboard/:id` — update
- `DELETE /leaderboard/:id`
- `GET /leaderboard/public` — **genuinely public, no bearer token at all** — scoped **only** by `X-Tenant-Domain` (same precedent as the existing public `GET /platform/tenants/lookup`). This powers a no-login display board (`/amusement/board`, meant for a lobby screen or a shared link) — the frontend resolves the tenant from the subdomain itself since there's no session to read it from. Response should include the attraction's name and type **denormalized onto each entry** so the frontend doesn't need a second public endpoint just to label rows:
  ```
  { data: [ { id, attractionId, attractionName, attractionType, participantName, teamName, score, achievedAt }, ... ] }
  ```
  Please double-check this route is excluded from whatever auth middleware normally requires a bearer token — it's the one endpoint in this doc that's intentionally callable by a completely anonymous visitor.

## 5. Camera product recognition, tenant-bound tokens, base quantities — ✅ DONE, live on the backend

Implemented per `sellixtracker/sellix-api.yaml` (tag **Recognition**, updated **Products**/**Sales**) and wired into the frontend: POS scanner (`POST /pos/products/recognize`, `GET /pos/products/barcode/:code`, `POST /pos/products/recognitions/:id/confirm`), product aliases / alias suggestions / barcodes management, `baseQuantity` on units, server-priced checkout with 409/422 handling, and logout on tenant-unbound (401) / tenant-mismatch (403) tokens. `recognize/batch` is not used yet.

Open points from the integration — resolved:

- **`pricingRule`** — the server's enum is `flat | half-box | bulk-wholesale` (the YAML's `standard | box | bulk` was a doc error, now fixed). The frontend uses only those three values, including on recognition units.
- **Product/unit request fields** — now documented in the YAML and matching what the frontend sends. `PUT /products/:id` sends `brand`/`sku`/`imageUrl` only when changed; `sku: ""` clears it.
- **Duplicate SKU** — frontend shows "SKU already in use" on the SKU field for a **409** (planned) and, until that ships, for a **500** whose message mentions the SKU/unique constraint. _Backend: tell us when the 409 is live so the 500 branch can be removed._
- **Embedded `aliases`/`barcodes` on `GET /products/:id`** — not used; the dedicated endpoints are the source.
- **`employeeId` on `POST /sales`** — the server doesn't derive it from the token, so the POS now sends the signed-in employee's id (admins send none). Interim; built in one place (`saleAttribution` in `pos/_logics/checkout.ts`) so it's easy to drop if the backend moves to token-based attribution.
- **`appType`** — admins are routed by `user.appType` from admin-login/refresh (fallback `retail` + warning); employees by the tenant lookup's `appType`, since `/employees/login` doesn't return it.

## 6. Real estate vertical (new) — frontend built, backend needed

A new `appType: "real-estate"` for landlords and property managers: compound houses (rooms around a shared yard), apartment blocks, single-family homes, commercial units, and short-stay / Airbnb units. The frontend lives under `/real-estate` and is fully built. Until these endpoints exist it runs on browser-only storage (`NEXT_PUBLIC_REAL_ESTATE_DATA_SOURCE=local`); switching that to `api` points every screen at the contract below with no other changes.

Conventions match the rest of the API: tenant-scoped (bearer + `X-Tenant-Domain`, tenant taken from the token like `/pos/*`), trailing-slash collection routes, `{ status, data }` envelope, numeric ids, dates as `YYYY-MM-DD` strings, money as numbers in GHS.

### 6.1 `appType`

Add `real-estate` to the `appType` enum everywhere it appears: tenant records, `POST/PATCH /platform/tenants`, `GET /platform/tenants/lookup`, and `user.appType` on admin-login / refresh. The super-admin "register app" form already offers it.

### 6.2 Endpoints

Twelve resources, each with the same four routes:

| Resource                            | Base path                                     |
| ----------------------------------- | --------------------------------------------- |
| Room types                          | `/real-estate/unit-types/`                    |
| Properties                          | `/real-estate/properties/`                    |
| Units                               | `/real-estate/units/`                         |
| Tenants (renters, not SaaS tenants) | `/real-estate/tenants/`                       |
| Leases                              | `/real-estate/leases/`                        |
| Rent payments                       | `/real-estate/payments/`                      |
| Short-stay bookings                 | `/real-estate/bookings/`                      |
| Maintenance requests                | `/real-estate/maintenance/`                   |
| Building projects                   | `/real-estate/projects/`                      |
| Project phases                      | `/real-estate/project-phases/`                |
| Expenses                            | `/real-estate/expenses/`                      |
| Documents (metadata)                | `/real-estate/documents/` (see 6.6 for files) |

- `GET <base>` → all records for the tenant (`data: [...]`). Portfolios are small; no pagination needed for v1.
- `POST <base>` → create; body = the object without `id`; returns the created object.
- `PUT <base>:id` → partial update (omitted fields unchanged); returns the updated object.
- `DELETE <base>:id`.

### 6.3 Objects

```
Property    { id, name, type, address, city, region?, description?, coverImageUrl?,
              purchasePrice?, purchaseDate?, seller?, land?, createdAt? }
            type: "compound-house" | "apartment-building" | "short-stay" | "single-family" | "commercial"
                | "mixed-use" | "land"
            purchasePrice / purchaseDate / seller: what it cost to acquire (any type) — counts towards
                "total invested"
            land (type "land" only): { size, sizeUnit, stage, titleStatus, gpsAddress? }
                sizeUnit: "plots" | "acres" | "hectares" | "sqm" | "sqft"
                stage: "bare" | "fenced" | "under-construction" | "completed"
                titleStatus: "none" | "allocation-note" | "indenture" | "site-plan" | "registered" | "title-certificate"
                gpsAddress: GhanaPost GPS, e.g. "AK-485-9323"

UnitType    { id, name, description?, bedrooms, livingRooms, facilities, amenities,
              rentalMode, defaultMonthlyRent, defaultNightlyRate, maxGuests }
            Owner-defined room types, shared by all the tenant's properties — e.g.
            "Single room (shared facilities)", "Chamber & hall (self-contained)".
            facilities: { bathroom, toilet, kitchen, electricity, water }
                        each one of "private" | "shared" | "none"
                        (electricity / water = own vs shared meter)
            amenities: string[]  free-form extras ("Porch", "Wardrobe", "Ceiling fan"…)
            livingRooms: halls / sitting rooms (chamber & hall = 1 bedroom + 1 livingRoom)
            defaultMonthlyRent / defaultNightlyRate / maxGuests: pre-fill new units only

Unit        { id, propertyId, unitTypeId, name, rentalMode, monthlyRent, nightlyRate,
              maxGuests, availability, notes? }
            unitTypeId: UnitType.id (nullable only if a type is ever force-removed)
            monthlyRent / nightlyRate: this unit's own listed price (may differ from its type's default;
                        a lease carries the agreed rent separately)
            rentalMode: "long-term" | "short-stay"
            availability: "available" | "maintenance" | "unlisted"
            Layout and facilities come from the unit's type — not stored on the unit.

Tenant      { id, fullName, phone, email?, idType?, idNumber?, occupation?,
              emergencyContactName?, emergencyContactPhone?, notes? }
            idType: "ghana-card" | "passport" | "voter-id" | "drivers-license" | "other"

Lease       { id, unitId, tenantId, startDate, endDate?, monthlyRent, billingCycleMonths,
              securityDeposit, terminatedOn?, notes? }
            billingCycleMonths: months paid at a time — 1, 3, 6, 12 or 24 (Ghana: often 1–2 years advance)
            terminatedOn: set on move-out

RentPayment { id, leaseId, amount, paidOn, method, reference?, note? }
            method: "cash" | "momo" | "bank"

Booking     { id, unitId, guestName, guestPhone?, guests, checkIn, checkOut, nightlyRate,
              cleaningFee, amountPaid, channel, status, notes? }
            checkOut is the departure day (exclusive night)
            channel: "direct" | "airbnb" | "booking-com" | "other"
            status: "inquiry" | "confirmed" | "checked-in" | "checked-out" | "cancelled"

MaintenanceRequest { id, propertyId, unitId?, title, description?, priority, status, cost,
                     reportedOn, resolvedOn? }
            priority: "low" | "medium" | "high" | "urgent"
            status: "open" | "in-progress" | "resolved"

Project     { id, propertyId, name, description?, status, startDate?, targetEndDate?, budget }
            A building / renovation project on any property (typically land).
            status: "planning" | "in-progress" | "on-hold" | "completed"

ProjectPhase { id, projectId, name, position, status, startDate?, endDate?, budget, notes? }
            position: display order (1, 2, 3…). The frontend creates phases in bulk from a
                standard Ghanaian build list (fencing, foundation, blocks to lintel, roofing…).
            status: "not-started" | "in-progress" | "done"

Expense     { id, propertyId, projectId?, phaseId?, category, description, quantity?, unit?,
              unitCost?, amount, date, supplier?, documentId? }
            category: "land" | "materials" | "labour" | "equipment" | "transport" | "permits"
                    | "professional" | "other"
            quantity × unitCost should equal amount when both are sent (e.g. 200 bags × ₵95);
                the frontend sends all three. Store amount as given.
            documentId: receipt in Documents

DocumentRecord { id, title, category, fileName, mimeType, size, uploadedAt,
                 propertyId?, unitId?, tenantId?, leaseId?, projectId?, notes? }
            category: "indenture" | "site-plan" | "land-title" | "building-permit" | "tenancy-agreement"
                    | "receipt" | "id-document" | "photo" | "other"
```

**Not stored, derived by the frontend:** occupancy (from leases and bookings, so it can never disagree with them), rent status / arrears / paid-through date (from the lease plus its payments), and booking totals (nights × rate + cleaning fee). Please don't add stored copies of these. If you later want them server-side, e.g. for SMS reminders, compute them the same way. The frontend's rules are in `src/app/[locale]/(real-estate)/real-estate/_logics/calc.ts`, with tests.

### 6.4 Validation the server should enforce

- **One live lease per unit:** creating or updating a lease that overlaps another non-terminated lease on the same unit → `409`.
- **No double-booking:** a booking that overlaps another booking on the same unit whose status is not `cancelled` or `checked-out` → `409`. Back-to-back stays (one guest's `checkOut` = the next guest's `checkIn`) are allowed. The frontend checks this too, but the server is the authority.
- **Projects, phases and expenses:**
  - `budget`, `amount`, `quantity` and `unitCost` must be ≥ 0.
  - An expense's `phaseId` must belong to its `projectId`, and its `projectId` to its `propertyId` → `422` otherwise.
- **Room types:**
  - `name` is unique per tenant, compared case-insensitively → `409`.
  - Every key in `facilities` must be present, with one of the three values → `422` otherwise.
  - Deleting a room type that units still use → `409`, with a message like "This room type is used by 7 units". Don't cascade: units must be moved to another type first. The frontend disables delete in that case and mirrors the 409 in local mode.
  - Updating a type never changes its units' prices. The frontend sends separate unit updates when the owner opts in.
- **Field rules:**
  - Leases need `monthlyRent > 0` and `billingCycleMonths ≥ 1`.
  - Bookings need `checkOut > checkIn`.
  - All money values must be ≥ 0.
  - Foreign keys (`propertyId`, `unitId`, `unitTypeId`, `tenantId`, `leaseId`) must belong to the same tenant → `422` otherwise.
- **Deletes cascade:**

  - property → its units, maintenance, projects, expenses and documents (with their files);
  - unit → its leases and bookings;
  - lease → its payments;
  - project → its phases and expenses;
  - phase → nothing is deleted: its expenses keep `projectId`, and `phaseId` becomes null;
  - document → its file (expenses pointing at it get `documentId: null`).

  Documents linked to a deleted unit, tenant, lease or project are kept and that link is set to null. They are papers the owner still needs.

  The local mode already behaves this way, and the frontend warns before deleting.

### 6.5 Permissions (employees)

Reuse the existing flags. The frontend only asks for what a user may read and hides what they may not write (`_logics/access.ts`):

| Area                                     | Read                                      | Write                 |
| ---------------------------------------- | ----------------------------------------- | --------------------- |
| Room types, properties and units         | everyone signed in                        | `canManageProducts`   |
| Tenants, leases, payments, bookings      | `canManageSales` or `canViewReports`      | `canManageSales`      |
| Maintenance                              | `canManageOperations` or `canViewReports` | `canManageOperations` |
| Projects, phases, expenses and documents | `canManageProducts` or `canViewReports`   | `canManageProducts`   |
| Portfolio dashboard                      | `canViewReports`                          | (none)                |

The projects/documents row is a frontend proposal (the backend's table doesn't cover these yet). Until those four endpoints exist, a 404 on their list is read as "none".

Admins have all of them.

### 6.6 Document files

Files are stored by the backend, for example in object storage, and served only to the owning tenant. Up to 15 MB each. Accepted types are PDF, JPEG/PNG/WebP/HEIC images and Word (.doc/.docx) → `415` otherwise, `413` when too large.

- **`POST /real-estate/documents/`:** `multipart/form-data` with a `file` field plus the metadata fields (`title`, `category`, `propertyId`, `unitId`, `tenantId`, `leaseId`, `projectId`, `notes`; ids as decimal strings, omitted when not linked). The server sets `fileName`, `mimeType`, `size` and `uploadedAt` from the upload and returns the `DocumentRecord`.
- **`GET /real-estate/documents/:id/file`:** streams the file with its `Content-Type` and `Content-Disposition: inline; filename="…"`. The frontend uses this for previews and downloads.
- **`POST /real-estate/documents/:id/share-link`** → `{ data: { url, expiresAt } }`: a public, unguessable, **expiring** link (e.g. 7 days) to that one file. The frontend puts it in a WhatsApp message (`https://wa.me/<tenant phone>?text=…`) so it can be shared from any device. The link must work without signing in, must not reveal other files, and should stop working when it expires or the document is deleted.
- **`PUT` / `DELETE /real-estate/documents/:id`:** as for other resources. PUT changes metadata only; the file can't be replaced.

Until this exists, local mode stores the files in the browser's IndexedDB. On phones, sharing sends the actual file through the system share sheet; on desktops it downloads the file and opens WhatsApp Web with the message.

## 7. Eatery platform (new) — frontend built, backend needed

Owners run restaurants from the dashboard (`/eatery/*`). Each restaurant also has a public storefront for customers at `/eat/<slug>`, with no sign-in. A business (tenant, `appType: "eatery"`) may own **several** restaurants. The public directory lists restaurants from **all** eatery tenants. Data model, theme format and design notes: `docs/EATERY_PLATFORM.md`. Types: `src/lib/eatery/types.ts`.

The frontend runs today on browser storage (`NEXT_PUBLIC_EATERY_DATA_SOURCE=local`). These endpoints make it real. Errors use the same envelope and contract as §6: `{ status: false, error }`; 409 for a conflict, 422 for validation, 404 for not found.

### 7.1 Owner endpoints (signed in, scoped to the token's tenant)

Same four routes per resource as §6.2 (`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`), under `/eatery/`:

| Resource        | Path                       |
| --------------- | -------------------------- |
| Restaurants     | `/eatery/restaurants/`     |
| Menu categories | `/eatery/menu-categories/` |
| Menu items      | `/eatery/menu-items/`      |
| Promotions      | `/eatery/promotions/`      |
| Orders          | `/eatery/orders/`          |

- Lists return only this tenant's rows: restaurants they own, and everything belonging to those restaurants. `ownerScope` is set by the server from the token and never taken from the body.
- `slug` is unique **across the platform** → `409` "The address /eat/<slug> is taken".
- Orders are never created here (customers create them, §7.2). `PUT` changes `status` and `payment.status` only. On every status change the server appends `{ status, at }` to `history` and sets `updatedAt`.
- Deletes:
  - restaurant → its categories, items, promotions and orders;
  - category → its items;
  - item → it is removed from promotions' `itemIds` and from combo slots that offered it.
- Permissions:
  - orders: `canManageSales`;
  - menu, promotions and theme: `canManageProducts`;
  - restaurant settings: `canManageOperations`;
  - dashboard: `canViewReports`;
  - admins have all of them.

### 7.2 Public endpoints (no sign-in; never return `ownerScope`)

- **`GET /public/eatery/restaurants`:** every restaurant on the platform (the directory), including `theme`, hours and fulfilment settings. Each entry also carries what the directory needs for deal badges and dish search:
  - `promotions`: the active ones, as `{ name, percentOff, schedule, active, description }`;
  - `menu`: the names of its sections and non-hidden items.
- **`GET /public/eatery/restaurants/:slug`** → `{ restaurant, categories, items, promotions }`: the storefront bundle. Hidden items and inactive promotions are left out. Returns `404` for an unknown slug.
- **`POST /public/eatery/restaurants/:slug/orders`:** the body is a `CheckoutInput` and carries **no prices**:

  ```
  { lines: [{ itemId, quantity, choices: { [groupId]: [choiceId] }, comboPicks?: { [slotId]: itemId }, note? }],
    customer: { name, phone },
    fulfilment: { type: "pickup" | "delivery" | "dine-in", table?, address?, landmark?, pickupAt?: "asap" | "HH:mm" },
    payment: { method: "cash" | "momo" | "pay-at-table", reference? },
    notes? }
  ```

  The server prices every line from the current menu, in the restaurant's local time:

  - Unit price = item price + each chosen option's `priceDelta` + each combo pick's `upcharge`.
  - Then the single best **live** promotion covering the item (by item or category, or the whole menu when both lists are empty) takes `percentOff`.
  - Delivery adds `fulfilment.delivery.fee`.
  - It returns the `Order` plus a one-time `accessKey`, which is a random secret of at least 16 characters.

  Reject with:

  - `409` when `acceptingOrders` is false, or the restaurant is closed now per `hours` (overnight periods belong to the day they start).
  - `422` with a readable `error`:
    - an item is unknown, hidden or sold out, or outside its own or its category's `schedule`;
    - an option group's choices fall outside `min..max`, or a chosen option is sold out;
    - a combo slot has no valid pick;
    - delivery is below `minOrder`, or has no address;
    - the table isn't in `dineIn.tables`;
    - the fulfilment type or payment method isn't enabled (`pay-at-table` is dine-in only);
    - a phone is given but has fewer than 9 digits, or a delivery order has no phone (the rider must be able to call).

  Name and phone are otherwise **optional**: store an empty name as `"Guest"` and an empty phone as `""`.

  `payment.status` is `pending` for MoMo with a reference, otherwise `unpaid`. `code` is 4 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, unique per restaurant.

- **`GET /public/eatery/restaurants/:slug/orders/:code`** with header `X-Order-Key: <accessKey>`: that order without `accessKey`. It returns `404` when the key doesn't match, so a guessed code reveals nothing. The customer's page polls this every 10 s until the order is `completed` or `cancelled`.
- Rate-limit order creation per IP and phone. The endpoints are public.

### 7.3 Objects

As in `src/lib/eatery/types.ts`: `Restaurant` (with `theme: ThemeConfig`, `hours`, `fulfilment`, `payments`), `MenuCategory`, `MenuItem` (with `optionGroups`, optional `combo.slots`, `status`, optional `schedule`), `Promotion` and `Order`. Store `theme`, `hours`, `fulfilment`, `payments`, `optionGroups`, `combo`, `schedule` and order `lines` as JSON. The frontend owns their shape, and the server only needs the fields used in the pricing and validation rules above. Validate `theme.version === 1` and that colours are `#rrggbb`. The frontend fixes contrast itself.

### 7.4a Image uploads (logo, cover and menu items)

`POST /eatery/uploads`: `multipart/form-data` with `file`, `kind` (`logo` | `cover` | `item`) and `restaurantId`. Signed in, `canManageProducts`, and the restaurant must belong to the tenant.

- The frontend has already prepared the file:
  - a logo is a 512 px square in WebP (PNG where WebP isn't supported);
  - a cover is at most 1600 px and 600 KB, in JPEG;
  - a menu-item photo is a 720 px square in WebP (usually under 150 KB);
  - metadata is stripped.
- Accept `image/webp`, `image/png` and `image/jpeg`, up to 2 MB → otherwise `415` / `413`.
- Store it publicly readable (object storage or CDN) under an unguessable name. Return `{ data: { url } }`.
- The URL goes into `theme.imagery.logoUrl` / `coverUrl` when the owner saves the theme, or into the item's `imageUrl` when they save the item. Files that never end up in a saved theme can be cleaned up after 24 h.

In local mode the image is kept inline as a `data:` URL instead.

### 7.5 Counter POS, ingredients and profit

**Counter orders (POS):** `POST /eatery/orders/counter`, signed in, `canManageSales`.

```
{ restaurantId, lines: OrderLineInput[], fulfilment: { type: "dine-in" | "pickup", table? },
  customer?: { name?, phone? }, payment: { method: "cash" | "momo" | "card", paid, reference?, tendered? }, notes? }
```

- Priced exactly like §7.2. Opening hours and `acceptingOrders` are **not** checked, because staff are there. Items that are sold out, hidden or outside their schedule are still refused with `422`.
- The created order has:
  - `channel: "counter"` and `status: "accepted"` (history: placed, then accepted);
  - `customer.name` of "Walk-in" when none is given;
  - `payment.status` of `paid` or `unpaid`;
  - `tendered` stored for cash.
- Returns the `Order` plus `accessKey`. The printed receipt has a QR code to `/eat/<slug>/order/<code>?k=<accessKey>`, so a take-away customer can follow the order on their phone.
- Online orders get `channel: "online"`.

**Owner-only resources** (same four routes, `canManageStock`; never exposed by public endpoints):

| Resource    | Path                       |
| ----------- | -------------------------- |
| Ingredients | `/eatery/ingredients/`     |
| Recipes     | `/eatery/recipes/`         |
| Stock moves | `/eatery/stock-moves/`     |
| Expenses    | `/eatery/expenses/`        |
| Packaging   | `/eatery/packaging-rules/` |

```
Ingredient { id, restaurantId, name, unit, costPerUnit, stock, lowStockAt, supplier?, purchaseUnit?, perPurchase? }
            unit: the unit recipes use and stock is counted in:
                  "g" | "kg" | "ml" | "l" | "pcs" | "bottle" | "tin" | "cup" | "sachet" | "bag" | "crate" | "pack"
            purchaseUnit / perPurchase: how it's bought when that differs ("pack" of 50 "pcs",
                  "crate" of 24 "bottle", "bag" of 25 "kg"). Free text, plus a number > 0.
                  Display only: costPerUnit, stock and lowStockAt are always per `unit`.
            name unique per restaurant → 409; delete while used in a recipe or packaging rule → 409
            PUT may carry `rescale` (number, not stored): the counting unit changed (packs → pieces,
                  kg → g). Multiply stock, and the quantity of every recipe and packaging line using
                  this ingredient, by it — in the same transaction.
Recipe     { id, restaurantId, itemId, ingredients: [RecipeLine], choices: { [choiceId]: [RecipeLine] } }
            RecipeLine { ingredientId, quantity, unit? }: quantity is always in the ingredient's own
                  `unit`; `unit` ("g", "purchase"…) is only how the owner typed it — store, don't use.
            one per item → 409; quantities per serving; a negative quantity under a choice swaps an
                  ingredient (Beef: chicken −150 g, beef +150 g)
PackagingRule { id, restaurantId, name, when, per, ingredients: [RecipeLine], active }
            when: "all" | "takeaway" (pickup + delivery, incl. counter take-away) | "dine-in"
            per: "order" | "item" — once per order, or × the total item quantity
StockMove  { id, restaurantId, ingredientId, type, quantity, totalCost, date, orderId?, supplier?, note?, entered? }
            quantity in the ingredient's unit; `entered` is how the owner typed it ("3 packs") — store as given
            type: "purchase" | "usage" | "return" | "waste" | "count"; never edited or deleted (422)
Expense    { id, restaurantId, category, amount, date, note? }
            category: "rent" | "staff" | "utilities" | "gas" | "transport" | "packaging" | "marketing" | "repairs" | "other"
```

**Stock effects.** Apply each one in the same transaction as the change that causes it.

- **`POST /stock-moves/` with `purchase`** (`quantity` > 0, `totalCost` = what was paid):
  - `costPerUnit` becomes the weighted average `(max(stock, 0) × costPerUnit + totalCost) / (max(stock, 0) + quantity)`;
  - `stock += quantity`.
- **`POST /stock-moves/` with `waste`** (`quantity` > 0): `stock −= quantity`. The server stores the move with `quantity: −q` and `totalCost: q × costPerUnit`.
- **`POST /stock-moves/` with `count`** (`quantity` = what was counted): `stock` is set to that amount. The server stores the difference and its cost.
- **When an order first reaches an active status** (`accepted`, `preparing`, `ready`, `out-for-delivery`, `completed`), or when a counter order is created:
  - For each line, work out usage = item recipe + recipes of the chosen options + recipes of combo picks, times quantity.
  - Add each active packaging rule whose `when` matches the order's fulfilment: its lines once (`per: "order"`) or × the order's total item quantity (`per: "item"`).
  - Write one `usage` move per ingredient: `quantity: −q`, `totalCost: q × costPerUnit`, `orderId`.
  - Decrease `stock`, and allow it to go negative.
  - Set `order.lines[].unitCost` (recipes only), `order.costOfGoods` (recipes + packaging) and `order.stockDeducted = true`.
  - Do this only once per order.
- **When a deducted order is cancelled:** write a `return` move for each usage move and give the stock back. Set `stockDeducted` to false.

**Sales history** (the Sales page, CSV export and the printed day report). Computed in the frontend from the order list today. With real volumes, the server should help:

- `GET /eatery/orders/?restaurantId&from&to&channel&method&payment&status&fulfilment&q&page&pageSize`: `from` and `to` are ISO datetimes (to is exclusive); `q` matches code, customer name, phone or item name; newest first. Return `{ data: Order[], total, page }`.
- `GET /eatery/reports/daily?restaurantId&from&to` → `{ data: [{ day, orders, cancelled, items, gross, discounts, delivery, net, average, byMethod: { cash, momo, card, "pay-at-table" }, byChannel: { counter, online }, byFulfilment: { pickup, delivery, "dine-in" }, unpaid, unpaidCount, costOfGoods }] }`, with days in the restaurant's local time zone. Cancelled orders are counted only in `cancelled`, never in money. Definitions: `src/lib/eatery/sales.ts`.

**Profit** (computed in the frontend today; a `GET /eatery/reports/profit?from&to` endpoint later would be welcome):

- Sales: non-cancelled order totals.
- Cost of goods: the sum of `costOfGoods`.
- Gross profit: sales − cost of goods.
- Net profit: gross profit − waste moves' cost − expenses.

Purchases are money out, not a cost, until the stock is used or wasted.

### 7.4 Later

- Real-time order push (SSE or WebSocket) instead of polling.
- MoMo collection through a payment gateway, with a webhook marking orders `paid`.
- Per-restaurant staff assignment.

## 8. Subscriptions and billing (new) — frontend built, backend needed

Every business (tenant) is on a **plan**. A plan sets the price, how many staff accounts the business can have, and which extra features it unlocks in its module. The super admin manages plans and each business's subscription. That includes recording payments by hand: MoMo, bank, cash. There's no payment gateway yet. Owners see their plan, payments and how to pay, and can ask for a plan change. Types: `src/lib/subscription/types.ts`. Rules: `src/lib/subscription/access.ts` and `billing.ts` (pure and tested; please match them).

Until this ships, the Next.js server keeps billing in a JSON file (`BILLING_STORE=file`, `.data/billing.json`). Setting `BILLING_STORE=api` switches to the endpoints below with no other frontend change.

### 8.1 Objects

- **Plan**: `{ id, name, tagline, monthlyPrice, yearlyPrice, limits: { staff: number | null }, features: string[], trialDays, highlighted?, archived? }`. Prices are whole cedis. `staff: null` = unlimited. `features` holds keys from `src/lib/subscription/features.ts` (e.g. `retail.analytics`, `eatery.costing`). Pages not listed there are on every plan.
- **Catalog**: `{ plans: Plan[], settings: { currency: "GHS", graceDays, paymentInstructions, supportContact } }`. One per platform.
- **Subscription**: one per tenant. `{ tenantId, planId, cycle: "monthly"|"yearly", status: "trialing"|"active"|"canceled", trialEndsAt?, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, canceledAt?, request?, payments: Payment[], events: BillingEvent[], updatedAt }`.
- **Payment**: `{ id, amount, method: "momo"|"bank"|"cash"|"card"|"other", reference?, paidAt, periodStart, periodEnd, planId, cycle }`.
- **BillingEvent**: `{ at, type, summary, actor: "platform"|"owner" }`. This is the audit trail shown in the console. Keep the latest 200.

**Only intent is stored.** "Past due" and "expired" are **derived** from dates, never stored, so nothing needs a scheduled job:

| Derived state | When                                                                    | Access |
| ------------- | ----------------------------------------------------------------------- | ------ |
| `none`        | no subscription record (registered before billing)                     | full   |
| `trialing`    | `status: trialing` and now < `trialEndsAt`                              | full   |
| `active`      | `status: active` and now < `currentPeriodEnd`                           | full   |
| `past_due`    | period over, now < end + `graceDays`, not canceling                     | full   |
| `canceled`    | `status: canceled`, or `cancelAtPeriodEnd` and the period is over      | none   |
| `expired`     | period over and grace used up                                           | none   |

### 8.2 Platform endpoints (`X-Platform-Key`, like §1/§3)

- `GET /platform/billing/catalog` → `{ data: Catalog }`. Seed with `src/lib/subscription/plans.ts` when empty.
- `PUT /platform/billing/catalog`: replaces the catalog. Validate as `parseCatalog` does: unique plan ids, at least one plan not archived, only known feature keys. Return **409** if a plan that subscriptions use is missing (archive it instead).
- `GET /platform/subscriptions` → `{ data: Subscription[] }` (all tenants).
- `GET /platform/tenants/:id/subscription` → `{ data: Subscription | null }`.
- `POST /platform/tenants/:id/subscription/actions` takes one action and returns the updated `Subscription`.

| Action                                                                                    | Effect                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ type: "assign", planId, cycle, trialDays }`                                            | Start or restart. `trialDays > 0` → trialing to now + days. `0` → active with the period ending now (payment due). Keeps earlier payments and events.                                                                     |
| `{ type: "change-plan", planId, cycle? }`                                                 | Switch plan; dates unchanged; clears any request. 409 if nothing changes.                                                                                                                                                  |
| `{ type: "record-payment", amount, method, reference?, periods (1–24), paidAt? }`         | Paid time continues from the current end when trialing, active or past due. After a lapse or a cancellation it starts now. Adds `periods` × cycle. Sets `active`, clears trial and cancellation, appends a Payment. |
| `{ type: "extend", days }`                                                                | Adds days to the later of the current end and now (the trial end while trialing).                                                                                                                                          |
| `{ type: "cancel", atPeriodEnd }`                                                         | `true` → `cancelAtPeriodEnd`. `false` → `status: canceled` now. 409 if already canceled.                                                                                                                                   |
| `{ type: "resume" }`                                                                      | Undo either kind of cancellation. 409 if there's nothing to undo.                                                                                                                                                          |
| `{ type: "approve-request" }` / `{ type: "clear-request" }`                               | Apply or decline the owner's request. 409 if there's none.                                                                                                                                                                 |

Errors: 400 for a malformed action, 404 for an unknown plan or a tenant with no subscription, 409 as above. The frontend shows `error` verbatim, so write it for an operator. Archived plans can't be assigned or requested, but a business already on one can stay on it.

Deleting a tenant (§1) should delete its subscription.

### 8.3 Tenant endpoints (owner or staff token + `X-Tenant-Domain`)

- `GET /billing` → `{ data: { subscription: Subscription | null, catalog: Catalog } }`. Staff can read it too, because the dashboard gates pages on it.
- `POST /billing/actions`: owners only (**403** for employees), and only `request-plan` (`{ type, planId, cycle, note? }`) or `clear-request`. Log the event with `actor: "owner"`.

### 8.4 Enforcement (the important part)

The frontend gates the dashboard. If billing can't be loaded it **fails open**, so an outage never locks out a paying business. Real enforcement has to be on the server:

- **No access** (`canceled` / `expired`): return **402** `{ status: false, error: "subscription_inactive" }` on every tenant-scoped endpoint except `/auth/*` and `/billing*`. Keep all data. Logins should still succeed, so the owner can reach the billing page.
- **Feature not on the plan**: 402 `"feature_not_in_plan"` on that feature's endpoints. For example, `retail.analytics` → the analytics/report endpoints, and `real-estate.short-stays` → `/real-estate/bookings`. Map them from `features.ts`.
- **Staff limit**: `POST /employees/` returns 402 `"staff_limit"` once the tenant has `limits.staff` employees. Editing and deleting stay allowed.
- Public routes (eatery storefronts, the amusement board) are up to product. We suggest an expired eatery's storefront stops taking orders but keeps showing its menu.

## 9. Store stats: cost of goods, payments and paging (changes to existing endpoints)

The overview and analytics pages now show the backend's numbers as they are: `cogs`, `operationsCost` and `profit` from `GET /stats/overview`, and `cogs`/`profit` per product from `GET /stats/products/top`. Negative values are no longer turned into 0, so a wrong cost of goods now shows up as a loss. The fixes below are in `sellix.apis`. Response shapes stay the same unless a change says otherwise.

### 9.1 Cost of goods per unit sold (`app/application/stats/repository.go`, `unitCost`) — most important

`purchasePrice` is the cost of one **purchase unit**: the largest unit, usually a box. `unitCost` already reads it that way. The product form said "cost per piece", which was wrong, and has been corrected to "cost of one box". Today `unitCost` divides the box cost only when the unit sold has `BoxSize` (half-box pieces). A smaller unit with the `flat` or `bulk-wholesale` rule — e.g. Box `baseQuantity` 20, Piece `baseQuantity` 1 — is costed at a **whole box per piece**. That's why products such as Happy Man show a negative profit.

Cost a unit sold as its share of the box:

```go
// purchasePrice is the cost of one purchase unit (the largest unit, e.g. a box).
func unitCost(pu *ent.ProductUnit, p *ent.Product, units []*ent.ProductUnit) float64 {
	if pu.BoxSize != nil && *pu.BoxSize > 0 { // half-box piece
		return p.PurchasePrice / float64(*pu.BoxSize)
	}
	largest := 1
	for _, u := range units {
		if u.BaseQuantity > largest {
			largest = u.BaseQuantity
		}
	}
	base := pu.BaseQuantity
	if base < 1 {
		base = 1
	}
	return p.PurchasePrice * float64(base) / float64(largest)
}
```

Load the product's units (`WithProductUnit(q.WithProduct(pq.WithUnits()))`, or a per-request cache by product id). Use this everywhere `unitCost` is used: overview COGS for sales **and** paid invoices, and top-products COGS for sales and invoices. The frontend uses the same rule to show "Cost per unit" on the product form and the unit's cost in the inventory list (`unitCosts` in `products/inventory/_logics/product-payload.ts`).

Tests (purchasePrice 200 = one box of 20):
- Box (`baseQuantity` 20) → 200.
- Piece (`baseQuantity` 1, `flat`) → 10.
- Pack (`baseQuantity` 5) → 50.
- Half-box piece (`boxSize` 20) → 10.
- Single-unit product (`baseQuantity` 1) → 200.

Data check: products with several units where every unit has `baseQuantity` 1 and none has `boxSize` can't be split. Every unit is costed at the full box price. Please list them so the owner can set the box's Base quantity. The product form now warns about this, and highlights in red any unit whose cost is above its price.

### 9.2 Optional: say when a product has no cost (`GET /stats/products/top`)

A product with `purchasePrice` 0 now returns `cogs: 0, profit: revenue`, which looks like a 100% margin. The frontend already shows "No cost price" when `cogs` is 0. It would be clearer to also add:

```json
{ "productId": 7, "productName": "Plain rice", "quantitySold": 40, "revenue": 1800, "cogs": 0, "profit": 1800, "costed": false }
```

`costed: false` when the product's `purchasePrice` is 0. This field is additive; nothing breaks without it.

### 9.3 Paging for `GET /stats/products/top`

The handler reads `limit` but ignores `offset`, so page 2 returns the same rows as page 1. The frontend currently loads `limit=1000` and pages locally. Please:

- accept `offset` (default 0) and apply it after sorting;
- return the total as other list endpoints do (`{ data: [...], count: N }`), or keep the plain array and add `count`. **Tell us which you choose before shipping it**, because the frontend reads the plain array today.

### 9.4 Cash vs MoMo per day (`GET /stats/sales`)

The overview has a new **Cash & MoMo** panel for reconciling against the till and the MoMo statement. It calls `GET /stats/overview` once for the chosen day or month. A **day-by-day list for a month** would need one call per day, so please split each time-series point by payment type:

```json
[{ "date": "2026-10-30", "count": 42, "revenue": 3120.5, "cash": 1800, "momo": 1320.5, "cashCount": 25, "momoCount": 17 }]
```

This applies to every `granularity` (`hour`, `day`, `week`, `month`) and is additive to the current fields. Paid invoices count in `cash`/`momo` by their `paymentType`, the same as the overview.

### 9.5 Consistent dates for invoices

`/stats/overview` and `/stats/products/top` include a paid invoice by **`CreateTime`**. `/stats/sales` buckets it by **`PaidAt`** (when set). The same invoice can therefore fall on different days in the overview and in the chart, which breaks daily reconciliation. Please use one date everywhere. We suggest `PaidAt`, falling back to `CreateTime`, because that is when the money arrived. That applies to both the `paidInvoicePreds` filter and the time-series buckets.

### 9.6 Date range bounds (for information; no change needed)

`parseDateRange` reads `to=2026-10-31` as `2026-10-31T00:00:00Z`, which leaves out that whole day. The frontend now sends full RFC 3339 bounds (`from` = local start of day, `to` = local 23:59:59.999), so no change is needed. If you prefer, a bare `YYYY-MM-DD` for `to` could be read as the end of that day. Either way, please keep accepting RFC 3339 with fractional seconds and `Z`.

### 9.7 Eatery: items priced by their options (no change needed)

Menu items can now be priced at 0, with each pick-one choice holding its full price in `priceDelta` (e.g. ice cream flavours ₵15/₵22). `app/application/eatery` already accepts `price` 0 and adds `priceDelta`s in `storefront.go` order pricing, so nothing is needed. Please don't add a "price must be > 0" rule for items.

## 10. Accounts and team: passwords, suspend, forgot password (changes to existing services)

The dashboard now has the same account pages in every module (retail, eatery, real estate, amusement):

- **My account** (`/account`): everyone. Shows your details and what you can do, and lets you change your password.
- **Team** (`/team`): owner and staff with `canManageEmployees`. Add, edit, reset password, suspend or reactivate, and remove staff. It replaces `/stores/users`, which now redirects there.
- **Forgot password** (`/forgot-password`): owners. Staff ask the owner or a manager, who resets the password from Team. That already works through `PUT /employees/:id { password }`.

These pages call the endpoints below. Until each one ships, the page shows a plain message, such as "isn't switched on yet — contact Bytewave support", instead of failing silently.

**Important for every password endpoint:** answer a wrong current password with **400** `{ "error": "invalid_current_password" }`, never 401. A 401 means "session expired" to the dashboard. The change-password calls opt out of the token refresh, but other clients may not.

### 10.1 Staff change their own password (`sellix.apis`, new)

`PUT /employees/me/password`. Any signed-in, active employee (`AnyStaff`), acting on the employee in the token.

```json
{ "currentPassword": "old-pass1", "newPassword": "new-pass22" }
```

- 200 `{ "message": "password updated" }`.
- 400 `invalid_current_password` when the current password doesn't match.
- 422 / 400 `weak_password` when `newPassword` has fewer than 8 characters, or no letter, or no digit. The dashboard checks this too.
- Only for employee tokens. An owner token gets 403 (owners use §10.3).

Today staff without `canManageEmployees` can't change their own password at all.

### 10.2 Staff status, email clashes and self-protection (`sellix.apis`, `PUT/POST/DELETE /employees`)

The `employee` table already has `status` (`active` | `suspended`). Login and every request already refuse a suspended employee. `PUT /employees/:id` can't change it, though, because `UpdateEmployeeRequest` has no `status`.

1. Accept `"status": "active" | "suspended"` in `PUT /employees/:id`, and return the saved employee as today. The dashboard checks the returned `status`. If it doesn't match, it tells the owner the action isn't switched on yet, which is what happens today.
2. An employee can't suspend or delete **themselves**: 400 `cannot_change_own_account`. The dashboard already hides those buttons on your own card.
3. Duplicate email on create or update: return **409** `{ "error": "email_taken" }` instead of the raw unique-constraint 500.
4. Passwords on create and update: same rule as §10.1 (8+ characters, a letter and a digit). The dashboard enforces it already.
5. The dashboard no longer sends `username`; staff sign in by email, and the API never stored it.

### 10.3 Owner passwords (`sellix.account`)

The routes exist, but `UpdatePassword`, `SendPasswordResetCode`, `VerifyOTP`, `ResetPassword` and `ResetUserPassword` in `app/application/auth/service.go` are all `panic("unimplemented")`. Every call ends in a 500.

**Change password** (signed in): `PUT /auth/update-password`

```json
{ "currentPassword": "old-pass1", "newPassword": "new-pass22", "confirmNewPassword": "new-pass22" }
```

- 200 on success.
- 400 `invalid_current_password` on a wrong current password.
- 400 `weak_password` on a weak new one (8+ characters, letter and digit).
- If the owner has the same email on several businesses (the 409 business picker at login), change the password for **this** account only, the one in the token.

**Forgot password** (signed out). Header `X-Tenant-Domain: admin`.

1. `POST /auth/send-otp` `{ "email": "owner@shop.com" }`
   - Always 200 `{ "message": "OTP sent" }`, whether or not the email exists, so the endpoint can't be used to check which emails have accounts.
   - Email a 6-digit code that expires in **15 minutes**. A new request replaces the old code.
   - Rate-limit to 5 requests per email per hour, returning 429.
2. `PUT /auth/reset-password` `{ "email": "...", "otp": "123456", "newPassword": "...", "confirmNewPassword": "..." }`
   - 200 on success.
   - 400 `invalid_code` when the code is wrong or expired. After 5 wrong tries the code is burned.
   - 400 `weak_password` on a weak password.
   - Resets **every** owner account with that email, because the owner proved they own the inbox. Refresh tokens issued before the reset stop working.
   - `ResetPasswordRequest` changes from `{ username, … }` to `{ email, otp, … }`. The separate `POST /auth/verify-otp` step isn't used by the dashboard.

**Remove or lock down `PUT /auth/reset-password/:id`** in both `sellix.account` and `sellix.apis`. It sits **outside** the authentication middleware. Once it's implemented, anyone could set any account's password. Either delete it, or put it behind the platform key (`X-Platform-Key`) for the super-admin console.

## 11. Store (retail) module: orders, customers, settings (additions to `sellix.apis`)

Every page in the store menu now exists:

- **Sales:** All orders, Pending, Completed, Customers.
- **Products:** All products, Inventory, Warehouses.
- **Settings:** Store settings, Payment.

Orders merge counter sales (`GET /sales`) and invoices (`GET /invoices`). "Pending" means unpaid invoices. Customers are grouped from invoices by phone number. Everything works today with the endpoints that exist. The items below make it exact and fast as the data grows.

### 11.1 Store settings (new) — most important

Store settings (business details printed on receipts, the receipt footer, the POS's default warehouse and prices) and Payment settings (accepted methods, MoMo network, number, account name and merchant ID) are kept **in each browser** today. Every till has to be set up separately, and a new device starts blank.

`GET /store/settings` and `PUT /store/settings`, one document per business. Reading needs any signed-in staff, because the POS reads it. Writing needs `canManageOperations`.

```json
{
  "business": { "name": "Adom Mini Mart", "phone": "0241234567", "email": "", "address": "Shop 12, Kaneshie Market", "taxId": "" },
  "receipt": { "footer": "Thank you!", "showCashier": true, "autoPrint": false },
  "pos": { "defaultWarehouseId": 3, "defaultCustomerType": "retail" },
  "payments": { "cash": true, "momo": true, "momoNetwork": "mtn", "momoNumber": "0241234567", "momoName": "Adom Enterprise", "momoMerchantId": "" }
}
```

- Store it as JSON, as with the eatery theme.
- Validate: at least one of `cash`/`momo` is true; `momoNetwork` is one of `mtn | telecel | airteltigo`; `momoNumber` is empty or 10 digits starting with 0; `defaultWarehouseId` is null or a warehouse of this business.
- Missing fields fall back to defaults (`withDefaults` in `src/lib/store/settings.ts`).
- Also enforce `payments`: `POST /sales` with a turned-off `paymentType` returns 422.

### 11.2 Filters on the order lists

The Orders pages load the latest 300 sales and 500 invoices, then filter in the browser. Please add:

- **`GET /sales`**:
  - `from`, `to`: RFC 3339, the same as `/stats` (§9.6).
  - `paymentType`: `cash` | `momo`.
  - `q`: matches the sale id or a product name.
  - `employeeId`.
- **`GET /invoices`**:
  - `status`: `pending` | `paid`. The dashboard already calls it as `FetchByStatus`.
  - `from`, `to`: on the invoice `date`.
  - `q`: matches the customer name, phone, invoice id or a product name.
- Keep `{ data, count }` so the pages can show "x of y" and page through.

### 11.3 Customers (optional, later)

Customers exist only as `customerName`/`customerPhone` on invoices, so one person typed two ways appears twice when one invoice has no phone. A `customer` table would fix that, with the invoice linking to it. So would a `GET /customers` that groups invoices by normalised phone (`0XXXXXXXXX`, with `+233` folded in) and returns name, phone, total paid, total owed and last invoice date. The frontend does the same grouping today (`customersFrom` in `src/lib/store/orders.ts`), so either can replace it later.

### 11.4 Small fixes found on the way

- The dashboard calls `PATCH /invoices/:id/unpay` (Inventory › Invoices, "mark as pending"). That route doesn't exist and returns 404. Either add it (set `payment_status` back to `pending` and clear `paid_at`), or tell us and we'll remove the button.
- Paid invoices count in the stats on `CreateTime` but chart on `PaidAt`. See §9.5.

## Priority

1. Tenant CRUD + owner-account creation (§1) — unblocks the whole "register a new business" flow for real, replaces the local JSON-file placeholder entirely.
2. `appType` on login responses (§2) — small addition, unblocks correct per-vertical routing for every real tenant (currently everyone defaults to "retail").
3. Platform-level stats/employees (§3) — lower priority, purely additive to the super admin dashboard; the mock data is clearly labeled as such and isn't blocking anything else.
4. Real estate vertical (§6) — frontend is live on browser-only storage; these endpoints make it multi-device and durable.
5. Eatery platform (§7) — owner dashboard and public storefronts are live on browser-only storage; customers' orders only reach the owner once these exist.
6. Subscriptions and billing (§8) — plans, payments and gating work today on a server-side JSON file. These endpoints make billing durable, and §8.4 makes access limits enforceable instead of only shown in the UI.
7. Store stats fixes (§9) — §9.1 (cost of goods per unit) first: until then any piece or pack sold under the flat/wholesale rule is costed as a whole box, so those products show a loss. §9.4–9.5 make daily cash/MoMo reconciliation exact.
8. Accounts and team (§10) — §10.3's `PUT /auth/reset-password/:id` lockdown first (security). Then owner change/forgot password (§10.3), staff change password (§10.1) and suspend (§10.2).
9. Store module (§11) — §11.1 store settings first, so every till shares the receipt and payment setup. Then the list filters (§11.2).
10. ~~Camera product recognition (§5)~~ — ✅ done; open points resolved, one pending backend change (SKU 409).
11. ~~Attractions/tickets/bookings/leaderboard (§4)~~ — ✅ done, confirmed live and matching the frontend's contract exactly (2026-08-29).

Happy to hop on a call to go through response shapes/edge cases once you've had a look.
