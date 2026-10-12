# نِعمة — Ne'ma

> فائض النهار، رزق لغيرك

Ne'ma is a food rescue platform that connects restaurants and bakeries with
surplus food to verified charities that need food for distribution.

This repository contains **Phases 1 through 5**: the project scaffold, the
PostgreSQL database, JWT authentication with roles and organization
verification, the food listing API, the full request → approval → collection
workflow, and a React frontend wired to those endpoints. Every page reads and
writes the real REST API — there is no mock layer.

## Tech stack

| Layer      | Choice                          |
| ---------- | ------------------------------- |
| Frontend   | React + Vite                    |
| Backend    | Node.js + Express               |
| Database   | PostgreSQL + `pg`               |
| API        | REST                            |

## Project structure

```
nema/
├── backend/                     # Express REST API
│   ├── .env.example             # copy to .env and edit
│   ├── db/
│   │   └── schema.sql           # the whole database schema (single source of truth)
│   ├── package.json
│   ├── src/
│   │   ├── server.js            # entry point — starts the HTTP server
│   │   ├── app.js               # builds the Express app (testable, no port)
│   │   ├── config/              # env + database configuration
│   │   ├── database/            # pg pool, query helper, schema setup, seed data
│   │   ├── routes/              # URL → controller wiring, all under /api
│   │   ├── controllers/         # HTTP concerns only
│   │   ├── services/            # business logic
│   │   ├── middleware/          # auth guards, 404, centralized error handler
│   │   └── utils/               # request validation and error helpers
│   └── tests/
│       └── api.test.mjs         # end-to-end API checks (see "Testing the API")
│
├── docs/
│   └── database.md              # schema, relationships, and seed data explained
│
└── frontend/                    # React + Vite (Arabic-first, RTL)
    ├── .env.example
    ├── index.html               # lang="ar" dir="rtl", Arabic web fonts
    ├── vite.config.js           # dev server + /api proxy
    └── src/
        ├── main.jsx             # entry point (router + auth provider)
        ├── App.jsx              # route definitions + role guards
        ├── assets/styles.css    # the entire design system (no CSS framework)
        ├── context/             # AuthContext — session, role, login/logout
        ├── hooks/               # useAsync — loading / error / data cycle
        ├── layouts/             # MainLayout (public), AppLayout (signed in)
        ├── pages/               # one file per route
        ├── components/          # reusable UI (ui/ primitives + domain cards)
        ├── services/api.js      # the only module that calls fetch
        └── utils/               # Arabic formatting, labels, statistics helpers
```

### Why this layout

- **routes / controllers / services** are split so each layer has one job.
  A route maps a URL to a controller, a controller handles `req`/`res`, and a
  service holds the business logic. Adding a resource means touching all three
  without rewriting any of them.
- **config** is the only place that reads `process.env`, so settings are not
  scattered across the codebase.
- **database** isolates everything that talks to PostgreSQL: the connection
  pool and query helper, plus the schema setup and seed scripts.
- **db/schema.sql** holds the entire schema in one reviewable file. It is
  applied by `npm run db:setup` rather than by hand, so the schema in git and
  the schema in the database cannot drift.
- **middleware** centralizes cross-cutting concerns instead of repeating
  them in every controller: authentication and role checks run before a
  handler, and 404s and error handling are caught in one place.
- **utils** holds the request validator and the error helpers. The validator
  rejects any body field the endpoint did not declare, which is what stops a
  client from smuggling `role` or `verificationStatus` through registration.
- **services/api.js** is the single module that performs network I/O. It
  attaches the bearer token, parses the response, and converts a failure into
  a typed `ApiError` carrying the backend's own `code`/`message`/`details`.
  No component calls `fetch`, and no component invents data — the app has no
  mock layer at all.
- **context + hooks** keep pages free of plumbing: `AuthProvider` owns the
  session (re-read from `/auth/me` on boot), and `useAsync` standardises the
  loading / error / data cycle so every screen can offer the same three states.

## Prerequisites

- Node.js 22.11 or newer
- npm 10+

## Getting started

Install dependencies for both apps:

```bash
cd backend && npm install
cd ../frontend && npm install
```

Create your environment files from the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

> `.env` files are gitignored. Never commit real secrets.

## Running the apps

You need **two terminals** — one per app.

Terminal 1 — backend (Express, port 3001):

```bash
cd backend
npm run dev
```

Terminal 2 — frontend (Vite, port 5173):

```bash
cd frontend
npm run dev
```

Then open <http://localhost:5173>. The home page shows the API status, which
confirms the frontend reaches the backend through the dev proxy.

### Available scripts

| App      | Script         | What it does                                     |
| -------- | -------------- | ------------------------------------------------ |
| backend  | `npm run dev`  | Starts Express with `--watch` auto-reload        |
| backend  | `npm start`    | Starts Express without auto-reload               |
| backend  | `npm run db:setup` | Applies `db/schema.sql` (schema only)        |
| backend  | `npm run db:seed`  | Loads development seed data                  |
| backend  | `npm run db:reset` | Applies the schema **and** seeds the data   |
| backend  | `npm run test:api` | Runs the end-to-end API checks (server must be running) |
| frontend | `npm run dev` | Starts the Vite dev server                  |
| frontend | `npm run build` | Builds the frontend for production        |
| frontend | `npm run preview` | Serves the production build locally       |

## Database

Create the database, then load the schema and development seed data:

```bash
createdb nema                  # or via your SQL client
cd backend
npm run db:reset
```

```
Connected to postgres://localhost:5432/nema
Applied schema from db\schema.sql
Seed complete.
Admin login:        nema.admin@example.com
Development login password (four non-admin users): DevPassword123!

Final state:
  donations        1 row(s)
  food_listings    3 row(s)
  food_requests    3 row(s)
  organizations    4 row(s)
  users            5 row(s)
```

`db/schema.sql` is idempotent — it drops and recreates every object — so
`npm run db:reset` is safe to re-run and always yields a known-clean database.
It covers five tables: `users`, `organizations`, `food_listings`,
`food_requests`, and `donations`, with enum types, foreign keys, CHECK
constraints, and indexes.

See [docs/database.md](docs/database.md) for the entity relationships and the
reasoning behind each constraint.

> **Seeded passwords are bcrypt hashes, never plain text.** The schema itself
> refuses to store anything that does not look like a bcrypt hash.

## API

All routes are under `/api`. Every response is JSON.

### Authentication

Send the token from `POST /auth/login` on every private request:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/auth/me
```

The token proves identity only. Role, active status, organization and
verification status are re-read from the database on each request, so an
account that was deactivated or an organization that was just rejected takes
effect immediately — a stale token cannot keep acting with old privileges.

### `GET /api/health`

Health check for the backend.

```json
{
  "status": "ok",
  "message": "Ne'ma API is running",
  "timestamp": "2026-10-09T17:46:01.795Z",
  "uptime": 63.66
}
```

Unknown routes return `404` with a JSON error body.

```bash
curl http://localhost:3001/api/health
```

### Auth

| Method | Path                | Auth   | Notes                                      |
| ------ | ------------------- | ------ | ------------------------------------------ |
| POST   | `/auth/register`    | public | Creates a user **and** its organization. Accepts `role` of `RESTAURANT` or `CHARITY` only — `ADMIN` accounts are not self-service. New organizations always start `PENDING`. |
| POST   | `/auth/login`       | public | Returns `{ token, user }`.                 |
| GET    | `/auth/me`          | token  | Current profile.                           |
| PATCH  | `/auth/me`          | token  | Updates `firstName`, `lastName`, `phone`, or password via `currentPassword` + `newPassword`. |

```bash
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "role": "RESTAURANT",
    "email": "owner@bakery.example.com",
    "password": "SomeLongPassword1!",
    "firstName": "Sara",
    "lastName": "Al-Tamimi",
    "organization": { "type": "RESTAURANT", "name": "Golden Oven", "city": "Riyadh" }
  }'

curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "nema.admin@example.com", "password": "<ADMIN_PASSWORD from backend/.env>"}'
```

Unknown body fields are **rejected**, not ignored, so a privilege field
cannot slip through on a typo.

### The administrator account

There is exactly **one admin**, and there is no self-service route to it —
registration only offers `RESTAURANT` and `CHARITY`, so the role cannot be
registered into or escalated to. It is created by `npm run db:reset` from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` in `backend/.env`.

Those two values are deliberately not committed. The admin is the only
account that can verify organizations and read every tenant's listings, so
its password comes from the environment rather than the repository. In
development a missing `ADMIN_PASSWORD` seeds a well-known throwaway value
and warns; production refuses to seed at all.

The admin **oversees** the platform rather than operating in it. It can read
every organization, every listing, and every listing's incoming requests —
but it belongs to no organization, so it cannot publish, edit, or cancel a
listing. Those stay with the restaurant that owns it.

### Organizations

| Method | Path                          | Auth    | Notes                                        |
| ------ | ----------------------------- | ------- | -------------------------------------------- |
| GET    | `/organizations`              | token   | Admins see every organization; other roles see only verified ones plus their own. Filter with `?status=PENDING`. |
| GET    | `/organizations/:id`          | token   | Same visibility rules.                       |
| PATCH  | `/organizations/:id/verify`   | **ADMIN** | Body `{ "decision": "VERIFIED" \| "REJECTED", "note": "..." }`. The only endpoint that can change verification status. |

### Food listings — restaurant side

Requires the `RESTAURANT` role. Publishing additionally requires a verified
organization.

| Method | Path                              | Notes                                          |
| ------ | --------------------------------- | ---------------------------------------------- |
| POST   | `/food-listings`                  | Requires `VERIFIED`. Body: `foodName`, `category`, `totalQuantity`, `unit`, `pickupLocation`, `pickupDeadline`, plus optional `description`, `safetyInfo`, `useByDeadline`. |
| GET    | `/food-listings`                  | Your organization's listings. `?status=ACTIVE`. `ADMIN` sees **every** organization's listings instead. |
| GET    | `/food-listings/:id`              | One of your own. `ADMIN` may read any.         |
| PATCH  | `/food-listings/:id`              | Partial update. `availableQuantity` and `status` cannot be set directly. Restaurant only — `ADMIN` gets `403`. |
| PATCH  | `/food-listings/:id/cancel`       | Body `{ "reason": "..." }`. Restaurant only — `ADMIN` gets `403`. |
| GET    | `/food-listings/:id/requests`     | Incoming requests for that listing. `ADMIN` may read any listing's. |

The `ADMIN` role reads everything but writes nothing here. It belongs to no
organization, so letting it publish or edit would mean acting on a tenant's
behalf; disputes are resolved by inspecting the data, not by editing it.

Categories: `BAKERY`, `PREPARED_MEALS`, `PRODUCE`, `DAIRY`, `MEAT`,
`PACKAGED`, `OTHER`. Units: `PORTIONS`, `KILOGRAMS`, `LITRES`, `ITEMS`,
`BOXES`.

`availableQuantity` is excluded from updates on purpose: it only moves as
requests are accepted, so a restaurant cannot silently un-promise food.
Reducing `totalQuantity` below what is already reserved is refused with
`400 TOTAL_BELOW_AVAILABLE`.

### Listings — charity side

Requires the `CHARITY` role **and** a verified organization.

| Method | Path                        | Notes                                          |
| ------ | --------------------------- | ---------------------------------------------- |
| GET    | `/browse/listings`          | Active, available, unexpired listings from verified organizations. Filter with `?category=BAKERY` or `?pickupBefore=2026-10-12T18:00:00Z`. |
| GET    | `/browse/listings/:id`      | Full details for one listing.                  |

### Food requests — the reservation workflow

This is the heart of the platform: a charity asks for part of a listing, the
restaurant answers, and only a confirmed collection creates a donation.

| Method | Path                                       | Auth    | Notes |
| ------ | ------------------------------------------ | ------- | ----- |
| POST   | `/requests`                                | **CHARITY**, verified | Body `{ foodListingId, requestedQuantity, message? }`. The charity comes from the token, never from the body. `400` if the listing is expired/unavailable/over-asked, `409` if this charity already has an open request for it. |
| GET    | `/requests`                                | **CHARITY** (admin sees all) | Your own requests, newest first. `?status=PENDING`, `?limit`, `?offset`. |
| GET    | `/requests/:id`                            | owner (admin) | One request **plus its `events` array** — the append-only audit trail, oldest first. |
| PATCH  | `/requests/:id/cancel`                     | charity owner | Body `{ reason? }`. A `PENDING` cancel releases nothing; cancelling an `ACCEPTED` request returns its quantity to `availableQuantity`. |
| POST   | `/requests/:id/collect`                    | charity owner | Body `{ handoverNotes? }`. **The only call that creates a donation**, and its quantity is the approved quantity — the client never supplies one. |
| PATCH  | `/food-listings/:id/requests/:requestId`   | **RESTAURANT** owner | Body `{ decision: "ACCEPTED" \| "REJECTED", responseNote? }`. `responseNote` is required for `REJECTED`. |

Statuses: `PENDING → ACCEPTED | REJECTED | CANCELLED`, `ACCEPTED → COMPLETED |
CANCELLED`. The service validates every transition against that table, so a
client cannot skip approval or complete an unapproved request.

```bash
curl -X POST http://localhost:3001/api/requests \
  -H "Authorization: Bearer <charity token>" \
  -H "Content-Type: application/json" \
  -d '{"foodListingId": 1, "requestedQuantity": 10, "message": "For 40 families"}'

curl -X PATCH http://localhost:3001/api/food-listings/1/requests/7 \
  -H "Authorization: Bearer <restaurant token>" \
  -H "Content-Type: application/json" \
  -d '{"decision": "ACCEPTED"}'
```

#### How the database prevents over-booking

Two charities asking for the last 10 portions must not be able to take 15.
Every reservation runs in **one transaction** that does three things:

1. **`SELECT … FOR UPDATE` on the listing row.** The second transaction blocks
   until the first commits, so they never read the same `available_quantity`
   at the same time. The lock order is always **listing → request**, which is
   what makes deadlock impossible.
2. **A guarded atomic update** — `UPDATE food_listings SET available_quantity
   = available_quantity - $qty WHERE id = $id AND available_quantity >= $qty`.
   The condition is evaluated against the locked row, so an approval that no
   longer fits affects zero rows and is rejected with `400
   INSUFFICIENT_QUANTITY` rather than driving the count negative.
3. **`CHECK (available_quantity >= 0)`** on the table, plus a partial unique
   index preventing two open requests from the same charity on one listing.
   These are the last line of defence: even a bug in application code cannot
   commit a negative balance or a duplicate claim.

Availability therefore moves exactly once per transition — approval
subtracts, cancelling an accepted request adds back, and everything else
leaves it alone. The `food_request_events` table records the resulting
balance on every change (`listingAvailableAfter`), so the arithmetic can be
replayed from the audit trail.

### Deadlines and safety

`pickupDeadline` and `useByDeadline` are separate fields and neither implies
the other. `pickupDeadline` is a logistics deadline — after it the restaurant
is no longer there to hand food over. `useByDeadline` is the restaurant's own
estimate of how long the food stays fit to eat.

**An unexpired listing is not a safe listing.** Nothing in the API derives
food safety from a deadline being in the future; charities are shown
`safetyInfo` and `useByDeadline` and decide for themselves. Expiry is computed
at read time rather than stored, so a listing stops being collectable the
moment its pickup deadline passes, with no background job required.

### Errors

Every failure returns the same shape:

```json
{
  "error": "ApiError",
  "code": "ORGANIZATION_NOT_VERIFIED",
  "message": "Your organization is PENDING. An administrator must verify it before you can participate in donations."
}
```

`code` is stable and safe to switch on; `message` is human-readable. Validation
failures include a `details` array of `{ field, message }`.

| Status | Meaning                                             |
| ------ | --------------------------------------------------- |
| 400    | Malformed input, failed validation, invalid state   |
| 401    | Missing, invalid, or expired token                  |
| 403    | Authenticated but not permitted — wrong role, unverified organization |
| 404    | Not found, or not yours to see                      |
| 409    | Conflicts with existing data, e.g. duplicate email   |
| 500    | Unexpected server failure                           |

## Frontend

The React app is Arabic-first and right-to-left (`lang="ar" dir="rtl"`), with a
warm cream surface, deep green primary, and neutral earthy accents defined as
tokens at the top of `frontend/src/assets/styles.css`.

### Routes

| Route                                | Role        | Page |
| ------------------------------------ | ----------- | ---- |
| `/`                                  | public      | Home — mission, tagline **فائض النهار، رزق لغيرك**, and a live preview of available food |
| `/about`                             | public      | About |
| `/login`, `/register`                | public      | Sign in / create an organization |
| `/browse`, `/browse/:id`             | `CHARITY`   | Available listings, listing details, request form |
| `/charity`                           | `CHARITY`   | Charity dashboard — statistics and requests awaiting action |
| `/charity/requests`                  | `CHARITY`   | Request management, status tracking, audit timeline |
| `/restaurant`                        | `RESTAURANT`| Restaurant dashboard — listings, incoming requests, donation statistics |
| `/restaurant/listings/new`           | `RESTAURANT`| Create a listing |
| `/restaurant/listings/:id/edit`      | `RESTAURANT`| Edit a listing |
| `/restaurant/listings/:id/requests`  | `RESTAURANT`| Inbox for one listing — approve / reject |
| `/admin`                             | `ADMIN`     | Organization verification queue |

### How the frontend talks to the API

- **`services/api.js`** holds every endpoint, grouped by resource
  (`authApi`, `browseApi`, `listingsApi`, `requestsApi`, `organizationsApi`,
  `healthApi`). The token is read from storage at call time and attached as
  `Authorization: Bearer …`.
- **`context/AuthContext.jsx`** stores the session. On boot it calls
  `GET /auth/me`, so the role, active flag and verification status on screen
  always come from the database rather than from anything cached in the
  browser.
- **`components/ProtectedRoute.jsx`** renders a wrong-role visit as an
  explanation instead of a blank page. It is navigation only: every endpoint
  behind it re-checks the token, the role and the organization, and the
  backend remains the sole authority.
- **`hooks/useAsync.js`** gives every screen the same three states, so the UI
  can render a spinner, an error with the backend's message and a retry, or an
  empty state that explains what is missing. None of these fall back to sample
  data.
- Quantities, pickup deadlines, locations and statuses are shown on cards as
  well as on detail pages; donation statistics are counted from completed
  requests returned by the API, grouped by unit rather than summed across
  incompatible units.

### Design system

`assets/styles.css` is the whole stylesheet — there is no CSS framework
beside it. It is organised as design tokens (colour, type, radius, elevation,
motion), base and accessibility rules, the marketing shell, and one section
per application concern (buttons, cards, forms, status, lists, dashboards,
async states, responsive rules). Components reuse `.btn`, `.card`, `.badge`,
`.chip`, `.field`/`.input`, `.state`, `.alert` and `.stat`, so a PENDING badge
or an error state looks identical wherever it appears.

Responsive breakpoints stack the navigation behind a menu button at 900px and
collapse grids, forms and action rows to a single column at 620px. Every
colour pair used for text clears WCAG AA against its background.

## Testing the API

`backend/tests/api.test.mjs` is an end-to-end suite covering login,
registration, privilege-escalation attempts, role and verification gates,
cross-organization isolation, listing edit/cancel rules, expiry, and the
administrator's read-across-every-tenant access. It expects a seeded
database and a running server.
```bash
cd backend
npm run db:reset     # schema + seed
npm run dev          # in a second terminal
npm run test:api
```

It runs against whatever `DATABASE_URL` and `PORT` are configured, and exits
non-zero if any check fails. It reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from
`backend/.env` so it can act as the administrator, matching whatever the seed
provisioned.

```
Browser  →  Vite dev server (:5173)  →  /api/* proxied  →  Express (:3001)
```

The Vite dev server forwards any `/api` request to the backend, so the browser
only talks to one origin. This avoids CORS configuration during development.


