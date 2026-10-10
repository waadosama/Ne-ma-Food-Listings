# Ne'ma — Database

PostgreSQL schema for the food rescue platform. The authoritative DDL is
[`backend/db/schema.sql`](../backend/db/schema.sql); this document explains
what it models and why.

## Setting up

```bash
cd backend
cp .env.example .env          # then edit DATABASE_URL
npm run db:reset              # create schema + load dev seed data
```

Other scripts:

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm run db:setup`  | Applies `db/schema.sql` only (schema, no seed data) |
| `npm run db:seed`   | Loads development seed data into an existing schema |
| `npm run db:reset`  | Applies the schema **and** seeds — the usual command |

`db/setup.js` reads `db/schema.sql` and runs it against `DATABASE_URL`. The
file is idempotent — it drops and recreates every object — so re-running it
always yields a known-clean database. No manual DDL and no "works on my
machine" drift: the schema in git is the schema in the database.

### Why plain SQL and not an ORM

The backend already uses [`pg`](https://node-postgres.com/) with a shared
connection pool (`src/database/pool.js`) and a parameterized query helper
(`src/database/query.js`). An ORM would replace working code and add a
codegen step, while offering little here: this is straightforward relational
data whose value is in its constraints, which are far more legible as
declarative SQL than as ORM decorators. If type-safe query building is wanted
later, it can sit on top of `pg` without rewriting the schema.

## Entity relationships

```
users 1 ────────< organizations          (users.organization_id)
  │                     │
  │ owner_user_id       │
  └────────>────────────┘                 ← circular; resolved in SQL by
                                             adding the users FK after both
                                             tables exist

organizations 1 ──────< food_listings     (food_listings.organization_id)
organizations 1 ──────< food_requests     (food_requests.charity_organization_id)

food_listings 1 ──────< food_requests     (food_requests.food_listing_id)

food_requests 1 ──────── 1 donations      (donations.food_request_id, UNIQUE)
food_listings 1 ────────< donations       (donations.food_listing_id)
organizations 1 ────────< donations       (donations.charity_organization_id)
```

### users

One row per account. `role` is an enum: `ADMIN`, `RESTAURANT`, or `CHARITY`.

- A `RESTAURANT` or `CHARITY` user belongs to exactly one organization via
  `organization_id`.
- An `ADMIN` belongs to none, which is why that column is nullable.

`password_hash` is `NULL` until authentication is built in a later phase. When
present it must be a bcrypt hash — the `users_password_hashed` CHECK rejects
anything that does not start with `$2a$`, `$2b$`, or `$2y$`. Plain-text
passwords are impossible to store, not merely discouraged.

### organizations

The "who" table. Restaurants, bakeries and grocers donate; charities and NGOs
request. Stores type, name, contact details, a human-readable address plus
optional latitude/longitude, and a `verification_status` of `PENDING`,
`VERIFIED`, `REJECTED`, or `SUSPENDED`.

A charity cannot receive food until an admin has verified it — that rule is
enforced in the service layer, but the schema keeps `verification_status` and
`verified_at` in step via `organizations_verified_pairing`: status `VERIFIED`
and a non-null `verified_at` must agree.

### food_listings

One batch of surplus food offered by a restaurant-type organization.

| Column              | Notes                                                     |
| ------------------- | --------------------------------------------------------- |
| `organization_id`   | The restaurant/bakery/grocery offering the food           |
| `created_by_user_id`| The staff member who posted it                            |
| `food_name`         | Required, non-blank                                       |
| `description`       | Free text                                                 |
| `safety_info`       | Allergens, storage temperature, dietary notes             |
| `total_quantity`    | Never changes once set                                    |
| `available_quantity`| Shrinks as requests are accepted                          |
| `unit`              | `PORTIONS`, `KILOGRAMS`, `LITRES`, `ITEMS`, `BOXES`       |
| `pickup_location`   | Where to collect                                          |
| `pickup_deadline`   | Must be after `created_at`                                |
| `status`            | `ACTIVE`, `RESERVED`, `COMPLETED`, `EXPIRED`, `CANCELLED` |

`food_listings_available_range` guarantees
`0 <= available_quantity <= total_quantity`. The gap between the two is what
has already been allocated to accepted requests.

Both quantities are `NUMERIC`, not floating point — this is inventory, and
float rounding has no place in it.

### food_requests

**Kept deliberately separate from food_listings** so that several charities can
each request a portion of the same listing. A request links one charity
organization to one listing and stores the requested quantity and a status of
`PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, or `COMPLETED`.

The partial unique index `food_requests_open_unique` allows many requests per
listing but only **one open (`PENDING` or `ACCEPTED`) request per charity per
listing**. Once a request is settled, that charity may legitimately ask again
for a later batch.

The rule "a charity cannot request more than the listing has left" spans two
tables, so no CHECK constraint can express it. That belongs in the service
layer, inside the same transaction that accepts the request.

### donations

The receipt for a fulfilled request, recording that food actually changed
hands. One donation per request, enforced by a UNIQUE constraint on
`food_request_id`.

"Where applicable" maps to the nullable delivery columns: a same-day handover
at the restaurant door records a collection and stops there, while a delivered
batch also records `delivered_at`, `delivered_by_user_id`, and
`delivery_address`. `donations_delivered_pairing` requires all of those when
`delivery_status` is `DELIVERED`.

`collected_quantity` may be less than the requested quantity, when part of a
batch turned out not to be fit to move.

## Cross-cutting choices

**Timestamps.** Every table has `created_at` and `updated_at`, both
`TIMESTAMPTZ` — never bare timestamps. The application decides display
timezone; the database stores an absolute instant.

**`updated_at` is maintained by a trigger.** One shared function,
`set_updated_at()`, is attached to all five tables, so no service has to
remember to set it and none can forget.

**Enums over check-constrained text.** Closed value sets (`user_role`,
`organization_type`, `food_unit`, the three status types) are PostgreSQL enum
types, so an invalid value cannot be written even by a buggy service layer.

**Delete rules are chosen per relationship, not defaulted:**

| Rule      | Used for                                                                  |
| --------- | ------------------------------------------------------------------------- |
| `CASCADE` | A listing's requests die with the listing; an org's listings/requests go with it |
| `RESTRICT`| History cannot be deleted out from under you — a donation outlives its request |
| `SET NULL`| Attribution, not record: removing a user does not delete the org or donation they touched |

## Seed data

`npm run db:seed` loads development fixtures and is idempotent — every row
upserts on a fixed id, so re-running changes nothing and never duplicates.

| Table           | Rows | Contents                                                             |
| --------------- | ---- | -------------------------------------------------------------------- |
| `users`         | 5    | 1 admin, 2 restaurant users, 2 charity users                          |
| `organizations` | 4    | 2 verified restaurants, 1 verified charity, 1 pending charity         |
| `food_listings` | 3    | Two from Golden Oven Bakery, one from Date Palm Kitchen               |
| `food_requests` | 3    | **Two different charities requesting from the same listing**          |
| `donations`     | 1    | A delivered 15-portion handover fulfilling the first request          |

The seed deliberately demonstrates the listings/requests split: listing 1 has
one `ACCEPTED` request from Hope Hand Foundation and one `PENDING` request
from Table for All.

> **Development password for every seeded user: `DevPassword123!`**
> This is a dev-only credential. It is stored as a bcrypt hash, never in plain
> text, and the schema refuses to store anything else.

Seed ids are fixed so tests and curl examples can reference them
(`organizations.id = 1` is Golden Oven Bakery, and so on).

## Not in scope yet

Authentication, authorization, and the business workflows (accepting a
request, decrementing `available_quantity`, recording a donation) are later
phases. This phase defines the schema those features will be built on.
