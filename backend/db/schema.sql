-- =====================================================================
-- Ne'ma — PostgreSQL schema
--
-- One file, applied top-to-bottom by `npm run db:setup`
-- (see src/database/setup.js). It is idempotent: every object is dropped
-- first, so re-running it against an existing database resets it cleanly.
--
-- Conventions used throughout:
--   * BIGINT identity columns for primary keys.
--   * TIMESTAMPTZ everywhere — never bare timestamps; the app decides the
--     display timezone, the database stores an absolute instant.
--   * created_at / updated_at on every table, with updated_at maintained by
--     a trigger so no service has to remember to set it.
--   * ENUM types for closed value sets, so an invalid status cannot be
--     written even by a buggy service layer.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Start clean.
-- users.organization_id -> organizations and organizations.owner_user_id
-- -> users form a cycle, so the drops use CASCADE to break it. Everything
-- else falls in normal reverse dependency order.
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS food_requests CASCADE;
DROP TABLE IF EXISTS food_listings CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP FUNCTION IF EXISTS set_updated_at();

DROP TYPE IF EXISTS donation_status;
DROP TYPE IF EXISTS food_request_status;
DROP TYPE IF EXISTS food_listing_status;
DROP TYPE IF EXISTS food_category;
DROP TYPE IF EXISTS food_unit;
DROP TYPE IF EXISTS verification_status;
DROP TYPE IF EXISTS organization_type;
DROP TYPE IF EXISTS user_role;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('ADMIN', 'RESTAURANT', 'CHARITY');

CREATE TYPE organization_type AS ENUM
  ('RESTAURANT', 'BAKERY', 'GROCERY', 'CHARITY', 'NGO');

CREATE TYPE verification_status AS ENUM
  ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

CREATE TYPE food_unit AS ENUM
  ('PORTIONS', 'KILOGRAMS', 'LITRES', 'ITEMS', 'BOXES');

-- Coarse grouping so charities can browse by what kind of food they need.
-- Deliberately few values: this is a filter, not a taxonomy.
CREATE TYPE food_category AS ENUM
  ('BAKERY', 'PREPARED_MEALS', 'PRODUCE', 'DAIRY', 'MEAT', 'PACKAGED', 'OTHER');

CREATE TYPE food_listing_status AS ENUM
  ('ACTIVE', 'RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED');

CREATE TYPE food_request_status AS ENUM
  ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED');

CREATE TYPE donation_status AS ENUM
  ('COLLECTED', 'IN_TRANSIT', 'DELIVERED');

-- ---------------------------------------------------------------------
-- updated_at trigger
-- One shared function keeps updated_at honest across all five tables.
-- ---------------------------------------------------------------------
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- users
-- One row per account. RESTAURANT and CHARITY users belong to exactly one
-- organization (organization_id); an ADMIN belongs to none, which is why
-- that column is nullable.
-- =====================================================================
CREATE TABLE users (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  role            user_role   NOT NULL,
  -- Emails are stored already-lowercased; the CHECK plus the unique index
  -- make case-insensitive uniqueness a database guarantee.
  email           TEXT        NOT NULL,
  -- NULL until authentication lands in a later phase. When present it must
  -- be a bcrypt hash — never plain text. The CHECK turns that requirement
  -- into a hard database rule rather than a convention someone can forget.
  password_hash   TEXT,
  first_name      TEXT        NOT NULL,
  last_name       TEXT        NOT NULL,
  phone           TEXT,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  -- FK added after organizations exists (circular dependency — see below).
  organization_id BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_email_lowercase CHECK (email = LOWER(email)),
  CONSTRAINT users_email_format
    CHECK (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  -- Requirement: never store plain-text passwords. Only bcrypt hash
  -- prefixes ($2a$ / $2b$ / $2y$) are accepted.
  CONSTRAINT users_password_hashed CHECK (
    password_hash IS NULL
    OR LEFT(password_hash, 4) IN ('$2a$', '$2b$', '$2y$')
  ),
  CONSTRAINT users_names_not_blank
    CHECK (LENGTH(TRIM(first_name)) > 0 AND LENGTH(TRIM(last_name)) > 0)
);

CREATE UNIQUE INDEX users_email_key ON users (email);
CREATE INDEX users_organization_id_idx ON users (organization_id);
CREATE INDEX users_role_idx ON users (role);

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- organizations
-- The "who" table: restaurants and bakeries donate, charities request.
-- =====================================================================
CREATE TABLE organizations (
  id                  BIGINT              GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type                organization_type   NOT NULL,
  name                TEXT                NOT NULL,
  description         TEXT,
  -- Email is the written channel; phone is what a driver actually calls.
  contact_email       TEXT                NOT NULL,
  contact_phone       TEXT,
  contact_name        TEXT,
  -- address/city/country are human-readable and required for a driver;
  -- lat/long are optional but power map views and distance sorting later.
  address_line        TEXT                NOT NULL,
  city                TEXT                NOT NULL,
  region              TEXT,
  postal_code         TEXT,
  country             TEXT                NOT NULL DEFAULT 'Saudi Arabia',
  latitude            NUMERIC(9, 6),
  longitude           NUMERIC(9, 6),
  -- A charity cannot receive food until an admin has verified it.
  verification_status verification_status NOT NULL DEFAULT 'PENDING',
  verified_at         TIMESTAMPTZ,
  verified_by_user_id BIGINT              REFERENCES users (id) ON DELETE SET NULL,
  owner_user_id       BIGINT              NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  is_active           BOOLEAN             NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT organizations_name_not_blank
    CHECK (LENGTH(TRIM(name)) > 0),
  CONSTRAINT organizations_email_lowercase
    CHECK (contact_email = LOWER(contact_email)),
  CONSTRAINT organizations_email_format
    CHECK (contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  CONSTRAINT organizations_latitude_range
    CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT organizations_longitude_range
    CHECK (longitude BETWEEN -180 AND 180),
  -- Verified state must carry a timestamp; the two stay in step.
  CONSTRAINT organizations_verified_pairing
    CHECK (
      (verification_status = 'VERIFIED' AND verified_at IS NOT NULL)
      OR
      (verification_status <> 'VERIFIED' AND verified_at IS NULL)
    )
);

-- Only one organization may own a given name per city.
CREATE UNIQUE INDEX organizations_name_city_key
  ON organizations (LOWER(name), LOWER(city));

CREATE INDEX organizations_type_idx ON organizations (type);
CREATE INDEX organizations_verification_status_idx
  ON organizations (verification_status);
CREATE INDEX organizations_owner_user_id_idx ON organizations (owner_user_id);
CREATE INDEX organizations_location_idx
  ON organizations (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE TRIGGER organizations_set_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Close the loop on the users <-> organizations circular dependency. Both
-- tables exist now, so the constraint can be added.
ALTER TABLE users
  ADD CONSTRAINT users_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL;

-- =====================================================================
-- food_listings
-- One batch of surplus food offered by a restaurant-type organization.
-- Deliberately separate from food_requests so several charities can each
-- request a *portion* of the same listing; the remainder is tracked in
-- available_quantity.
-- =====================================================================
CREATE TABLE food_listings (
  id                 BIGINT              GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The restaurant/bakery/grocery offering the food.
  organization_id    BIGINT              NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- The staff member who posted it: who do we call?
  created_by_user_id BIGINT              NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  food_name          TEXT                NOT NULL,
  description        TEXT,
  -- Coarse grouping used by the charity browse filter. Separate from
  -- safety_info: this says what kind of food it is, not how to handle it.
  category           food_category       NOT NULL DEFAULT 'OTHER',
  -- What it is made of and how it must be handled: allergens, "contains
  -- nuts", "keep chilled", "vegan". Surfaced in the UI so charities can
  -- judge suitability before requesting.
  safety_info        TEXT,

  -- total_quantity never changes; available_quantity shrinks as requests
  -- are accepted. The gap between them is what is already spoken for.
  -- NUMERIC, not float: this is inventory, and float rounding has no place
  -- in it.
  total_quantity     NUMERIC(10, 2)     NOT NULL,
  available_quantity NUMERIC(10, 2)     NOT NULL,
  unit               food_unit          NOT NULL DEFAULT 'PORTIONS',

  -- Where and until when the food can be collected. This is a *logistics*
  -- deadline — after this time the restaurant will not be there to hand the
  -- food over. It is NOT a statement about whether the food is safe to eat.
  pickup_location    TEXT                NOT NULL,
  pickup_deadline    TIMESTAMPTZ         NOT NULL,

  -- The restaurant's own estimate of how long the food stays fit for
  -- consumption, tracked separately from pickup_deadline on purpose. A
  -- batch can be perfectly collectable long after its use-by estimate, and
  -- safe food can become uncollectable because nobody is at the counter.
  -- Nothing in the API treats an unexpired listing as safe: charities are
  -- shown safety_info and use_by_deadline and decide for themselves.
  use_by_deadline    TIMESTAMPTZ,

  status             food_listing_status NOT NULL DEFAULT 'ACTIVE',
  -- Operator note when a listing is cancelled: "spoiled", "collected
  -- early", etc.
  cancellation_reason TEXT,
  created_at         TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT food_listings_total_positive
    CHECK (total_quantity > 0),
  CONSTRAINT food_listings_available_range
    CHECK (available_quantity >= 0 AND available_quantity <= total_quantity),
  CONSTRAINT food_listings_deadline_in_future
    CHECK (pickup_deadline > created_at),
  CONSTRAINT food_listings_food_name_not_blank
    CHECK (LENGTH(TRIM(food_name)) > 0),
  -- Only a cancelled listing may explain itself.
  CONSTRAINT food_listings_cancellation_pairing
    CHECK (
      (status = 'CANCELLED' AND cancellation_reason IS NOT NULL)
      OR
      (status <> 'CANCELLED' AND cancellation_reason IS NULL)
    )
);

CREATE INDEX food_listings_organization_id_idx
  ON food_listings (organization_id);
CREATE INDEX food_listings_created_by_user_id_idx
  ON food_listings (created_by_user_id);
-- The charity browse filter: category, then soonest deadline first.
CREATE INDEX food_listings_browse_category_idx
  ON food_listings (category, pickup_deadline)
  WHERE status = 'ACTIVE' AND available_quantity > 0;
-- The query every charity dashboard runs: "what is still available,
-- soonest deadline first?"
CREATE INDEX food_listings_active_browse_idx
  ON food_listings (pickup_deadline, created_at)
  WHERE status = 'ACTIVE' AND available_quantity > 0;
-- "What is my organization currently offering?" for restaurant dashboards.
CREATE INDEX food_listings_org_status_idx
  ON food_listings (organization_id, status, created_at DESC);

CREATE TRIGGER food_listings_set_updated_at
  BEFORE UPDATE ON food_listings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- food_requests
-- One charity asking for a portion of one listing. Lives in its own table
-- so many charities can ask for the same listing, each tracked and
-- answered independently.
--
-- The rule "a charity cannot ask for more than the listing has left" spans
-- two tables, so no CHECK can express it — that belongs in the service
-- layer, inside the same transaction that accepts the request.
-- =====================================================================
CREATE TABLE food_requests (
  id                      BIGINT              GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  food_listing_id         BIGINT              NOT NULL REFERENCES food_listings (id) ON DELETE CASCADE,
  -- The charity doing the asking (an organization of type CHARITY/NGO).
  charity_organization_id BIGINT              NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
  -- The volunteer/staff member who filed it.
  requested_by_user_id    BIGINT              NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  requested_quantity      NUMERIC(10, 2)      NOT NULL,
  -- Stored on the request too, so a later change to the listing's unit
  -- never rewrites what was actually asked for.
  unit                    food_unit           NOT NULL DEFAULT 'PORTIONS',

  -- Free text from the charity: how many people it feeds, dietary needs,
  -- why this batch matters. Helps the restaurant choose between requests.
  message                 TEXT,
  status                  food_request_status NOT NULL DEFAULT 'PENDING',

  -- Who answered, and when. Both NULL while pending.
  responded_by_user_id    BIGINT              REFERENCES users (id) ON DELETE SET NULL,
  responded_at            TIMESTAMPTZ,
  -- Reason shown to the charity when a request is rejected.
  response_note           TEXT,

  created_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ         NOT NULL DEFAULT now(),

  CONSTRAINT food_requests_quantity_positive
    CHECK (requested_quantity > 0),
  CONSTRAINT food_requests_responded_pairing
    CHECK (
      (responded_at IS NOT NULL AND responded_by_user_id IS NOT NULL)
      OR
      (responded_at IS NULL     AND responded_by_user_id IS NULL)
    ),
  -- A response can never predate the request itself.
  CONSTRAINT food_requests_responded_after_created
    CHECK (responded_at IS NULL OR responded_at >= created_at),
  -- Rejections must explain themselves to the charity; every other status
  -- may leave the note blank.
  CONSTRAINT food_requests_rejection_needs_note
    CHECK (status <> 'REJECTED' OR response_note IS NOT NULL)
);

CREATE INDEX food_requests_listing_id_idx
  ON food_requests (food_listing_id);
CREATE INDEX food_requests_charity_org_id_idx
  ON food_requests (charity_organization_id);
CREATE INDEX food_requests_requested_by_user_id_idx
  ON food_requests (requested_by_user_id);
-- A charity's own dashboard: "what have I asked for, newest first?"
CREATE INDEX food_requests_charity_activity_idx
  ON food_requests (charity_organization_id, created_at DESC);
-- A restaurant's inbox: "requests waiting on me."
CREATE INDEX food_requests_pending_inbox_idx
  ON food_requests (created_at)
  WHERE status = 'PENDING';

-- The constraint that makes "multiple charities, one listing" work: one
-- *open* request per charity per listing. Completed/rejected/cancelled
-- requests are not counted, so a charity may legitimately ask again for a
-- later batch from the same organization.
CREATE UNIQUE INDEX food_requests_open_unique
  ON food_requests (food_listing_id, charity_organization_id)
  WHERE status IN ('PENDING', 'ACCEPTED');

CREATE TRIGGER food_requests_set_updated_at
  BEFORE UPDATE ON food_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- donations
-- The receipt for a fulfilled request: proof that a specific quantity of
-- food actually changed hands, and — when the food travelled — where it
-- ended up. One donation per request, hence the UNIQUE.
--
-- "Where applicable" in the spec maps to the nullable delivery columns: a
-- same-day handover at the restaurant door records a collection and stops
-- there, while a delivered batch also records who received it and where.
-- =====================================================================
CREATE TABLE donations (
  id                      BIGINT          GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- The request this donation fulfils. UNIQUE enforces "one receipt per
  -- request"; a follow-up top-up would be a new request, not a second row.
  food_request_id         BIGINT          NOT NULL UNIQUE REFERENCES food_requests (id) ON DELETE RESTRICT,
  -- Denormalised from the request for cheap listing/history queries. The
  -- service layer always fills it from food_requests, so the two agree.
  food_listing_id         BIGINT          NOT NULL REFERENCES food_listings (id) ON DELETE RESTRICT,
  charity_organization_id BIGINT          NOT NULL REFERENCES organizations (id) ON DELETE RESTRICT,
  recorded_by_user_id     BIGINT          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,

  -- The quantity that actually changed hands, which may be less than
  -- requested if some of the batch was not fit to move.
  collected_quantity      NUMERIC(10, 2)  NOT NULL,
  unit                    food_unit       NOT NULL DEFAULT 'PORTIONS',

  -- Collection is mandatory; delivery is optional (see file header).
  collected_at            TIMESTAMPTZ     NOT NULL DEFAULT now(),
  collected_by_user_id    BIGINT          REFERENCES users (id) ON DELETE SET NULL,
  pickup_location         TEXT,
  delivery_status         donation_status NOT NULL DEFAULT 'COLLECTED',

  -- Present only when the food was carried on to a distribution point.
  delivered_at            TIMESTAMPTZ,
  delivered_by_user_id    BIGINT          REFERENCES users (id) ON DELETE SET NULL,
  delivery_address        TEXT,

  -- Condition on handover: "still chilled", "two crates, one dented".
  -- Evidence if a dispute arises later.
  handover_notes          TEXT,
  created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),

  CONSTRAINT donations_quantity_positive
    CHECK (collected_quantity > 0),
  CONSTRAINT donations_delivered_after_collected
    CHECK (delivered_at IS NULL OR delivered_at >= collected_at),
  -- A delivery must say who received it and where it went.
  CONSTRAINT donations_delivered_pairing
    CHECK (
      (delivery_status = 'DELIVERED' AND delivered_at IS NOT NULL
         AND delivered_by_user_id IS NOT NULL AND delivery_address IS NOT NULL)
      OR
      (delivery_status <> 'DELIVERED')
    ),
  -- In-transit means collected but not yet arrived.
  CONSTRAINT donations_in_transit_pairing
    CHECK (
      delivery_status <> 'IN_TRANSIT'
      OR (delivered_at IS NULL AND delivery_address IS NOT NULL)
    )
);

CREATE INDEX donations_listing_id_idx ON donations (food_listing_id);
CREATE INDEX donations_charity_org_id_idx ON donations (charity_organization_id);
CREATE INDEX donations_recorded_by_user_id_idx ON donations (recorded_by_user_id);
-- A charity's impact history: "everything we have received, newest first."
CREATE INDEX donations_charity_history_idx
  ON donations (charity_organization_id, collected_at DESC);
-- Impact reporting: how much food was rescued in a given period.
CREATE INDEX donations_collected_at_idx ON donations (collected_at DESC);

CREATE TRIGGER donations_set_updated_at
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
