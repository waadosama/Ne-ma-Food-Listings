import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import config from '../config/index.js';
import { getPool, closePool } from './pool.js';

// Development seed data. Every row is upserted on a natural key (email,
// name, ...) and given a fixed id, so the script is idempotent: running it
// twice does not duplicate anything, and the fixed ids make fixtures easy to
// reference from tests and future API examples.
//
// Passwords are hashed here with bcrypt and stored ONLY as hashes — the
// schema itself refuses anything that does not look like a bcrypt hash.

const SALT_ROUNDS = config.bcryptRounds;

// The password shared by the four non-admin accounts. This is a throwaway
// development fixture, deliberately obvious, and it is fine for it to be in
// the repository because these accounts hold no privileges an attacker could
// not get by registering themselves.
const DEV_PASSWORD = 'DevPassword123!';

// The administrator is different: it is the only account that can verify
// organizations and read every tenant's listings, so its credential comes
// from the environment rather than this file. There is exactly one admin and
// no self-service route to the role — registration only offers RESTAURANT
// and CHARITY.
function resolveAdminPassword() {
  const password = config.admin.password;

  if (password) {
    if (config.env !== 'production' && password === DEV_PASSWORD) {
      console.warn(
        '[seed] ADMIN_PASSWORD is set to the development fixture password. ' +
          'Choose something unique before this database is shared.'
      );
    }
    return password;
  }

  if (config.env === 'production') {
    // Refusing is the right failure mode. Seeding in production without an
    // explicit admin password would either create an account nobody can log
    // into or, worse, one everyone can.
    throw new Error(
      'ADMIN_PASSWORD must be set in production. Set it in backend/.env — ' +
        'the seeded administrator is the only account that can verify organizations.'
    );
  }

  console.warn(
    '[seed] ADMIN_PASSWORD is not set — seeding the administrator with the ' +
      'development fixture password. Set ADMIN_PASSWORD in backend/.env.'
  );
  return DEV_PASSWORD;
}

const ADMIN_PASSWORD = resolveAdminPassword();

// Fixed ids keep downstream fixtures (tests, curl examples) stable. Ids are
// unique within each table; the previous collision between the restaurant
// and charity organization ids silently overwrote the restaurants, because
// the seed upserts on id.
const IDS = {
  users: { admin: 1, restaurant: 2, restaurant2: 3, charity: 4, charity2: 5 },
  organizations: { restaurant: 1, restaurant2: 2, charity: 3, charity2: 4 },
  listings: { bakery: 1, kitchen: 2, grocery: 3 },
  requests: { charityA: 1, charityB: 2, charityC: 3 },
  donations: { one: 1 },
};

async function seedUsers(client) {
  // Two hashes because there are two kinds of account: the administrator,
  // whose credential comes from the environment, and the four development
  // fixtures, which share the throwaway password. Hashing is done once here
  // rather than per row — bcrypt is deliberately slow.
  const adminHash = bcrypt.hashSync(ADMIN_PASSWORD, SALT_ROUNDS);
  const devHash = bcrypt.hashSync(DEV_PASSWORD, SALT_ROUNDS);

  // The last element of each row picks which credential applies. Only the
  // admin row uses the environment-sourced one.
  const rows = [
    [IDS.users.admin, 'ADMIN', config.admin.email, config.admin.firstName, config.admin.lastName, adminHash],
    [
      IDS.users.restaurant,
      'RESTAURANT',
      'sara.tamimi@goldenoven.example.com',
      'Sara',
      'Al-Tamimi',
      devHash,
    ],
    [
      IDS.users.restaurant2,
      'RESTAURANT',
      'omar.haddad@datepalm.example.com',
      'Omar',
      'Al-Haddad',
      devHash,
    ],
    [
      IDS.users.charity,
      'CHARITY',
      'layla.nasser@hopehand.example.com',
      'Layla',
      'Al-Nasser',
      devHash,
    ],
    [
      IDS.users.charity2,
      'CHARITY',
      'yusuf.rahman@tableforall.example.com',
      'Yusuf',
      'Al-Rahman',
      devHash,
    ],
  ];

  for (const [id, role, email, firstName, lastName, passwordHash] of rows) {
    await client.query(
      `INSERT INTO users
         (id, role, email, password_hash, first_name, last_name)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET role            = EXCLUDED.role,
             email           = EXCLUDED.email,
             password_hash   = EXCLUDED.password_hash,
             first_name      = EXCLUDED.first_name,
             last_name       = EXCLUDED.last_name,
             updated_at      = now()`,
      [id, role, email, passwordHash, firstName, lastName]
    );
  }

  // Identity columns are declared GENERATED ALWAYS, so Postgres refuses to
  // accept the explicit ids above unless the sequence is realigned. Bump each
  // sequence past the seeded ids so future inserts do not collide.
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('users', 'id'),
       (SELECT COALESCE(MAX(id), 0) FROM users)
     )`
  );
}

async function seedOrganizations(client) {
  const rows = [
    [
      IDS.organizations.restaurant,
      'RESTAURANT',
      'Golden Oven Bakery',
      'Artisan bakery with daily end-of-day surplus of bread and pastries.',
      'sara.tamimi@goldenoven.example.com',
      '+966 11 555 0142',
      'Sara Al-Tamimi',
      '12 Tahlia Street',
      'Riyadh',
      'Riyadh Province',
      '11564',
      'Saudi Arabia',
      24.69461,
      46.68531,
      'VERIFIED',
      '2026-09-01T09:00:00Z',
      1,
      2,
    ],
    [
      IDS.organizations.restaurant2,
      'RESTAURANT',
      'Date Palm Kitchen',
      'Family restaurant preparing large-batch lunches; regular surplus on weekdays.',
      'omar.haddad@datepalm.example.com',
      '+966 12 555 0198',
      'Omar Al-Haddad',
      '44 King Fahd Road',
      'Jeddah',
      'Makkah Province',
      '23521',
      'Saudi Arabia',
      21.543333,
      39.172778,
      'VERIFIED',
      '2026-09-10T10:30:00Z',
      1,
      3,
    ],
    [
      IDS.organizations.charity,
      'CHARITY',
      'Hope Hand Foundation',
      'Community kitchen and shelter distributing meals across Riyadh.',
      'layla.nasser@hopehand.example.com',
      '+966 11 555 0233',
      'Layla Al-Nasser',
      '7 Al-Malaz District',
      'Riyadh',
      'Riyadh Province',
      '11564',
      'Saudi Arabia',
      24.6645,
      46.7323,
      'VERIFIED',
      '2026-08-20T08:15:00Z',
      1,
      4,
    ],
    [
      IDS.organizations.charity2,
      'CHARITY',
      'Table for All',
      'Volunteer group collecting and delivering meals to families in Jeddah.',
      'yusuf.rahman@tableforall.example.com',
      '+966 12 555 0287',
      'Yusuf Al-Rahman',
      '19 Al-Balad Street',
      'Jeddah',
      'Makkah Province',
      '22232',
      'Saudi Arabia',
      21.4858,
      39.1925,
      'PENDING',
      null,
      1,
      5,
    ],
  ];

  for (const r of rows) {
    await client.query(
      `INSERT INTO organizations
         (id, type, name, description, contact_email, contact_phone, contact_name,
          address_line, city, region, postal_code, country, latitude, longitude,
          verification_status, verified_at, verified_by_user_id, owner_user_id)
       OVERRIDING SYSTEM VALUE
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE
         SET type                = EXCLUDED.type,
             name                = EXCLUDED.name,
             description         = EXCLUDED.description,
             contact_email       = EXCLUDED.contact_email,
             contact_phone       = EXCLUDED.contact_phone,
             contact_name        = EXCLUDED.contact_name,
             address_line        = EXCLUDED.address_line,
             city                = EXCLUDED.city,
             region              = EXCLUDED.region,
             postal_code         = EXCLUDED.postal_code,
             country             = EXCLUDED.country,
             latitude            = EXCLUDED.latitude,
             longitude           = EXCLUDED.longitude,
             verification_status = EXCLUDED.verification_status,
             verified_at         = EXCLUDED.verified_at,
             verified_by_user_id = EXCLUDED.verified_by_user_id,
             owner_user_id       = EXCLUDED.owner_user_id,
             updated_at          = now()`,
      r
    );
  }

  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('organizations', 'id'),
       (SELECT COALESCE(MAX(id), 0) FROM organizations)
     )`
  );
}

// Runs after both users and organizations exist, so the circular link
// between them can be completed. ADMIN accounts belong to no organization
// and are skipped.
async function linkUsersToOrganizations(client) {
  const links = [
    [IDS.users.restaurant, IDS.organizations.restaurant],
    [IDS.users.restaurant2, IDS.organizations.restaurant2],
    [IDS.users.charity, IDS.organizations.charity],
    [IDS.users.charity2, IDS.organizations.charity2],
  ];

  for (const [userId, organizationId] of links) {
    await client.query(
      `UPDATE users
          SET organization_id = $2,
              updated_at      = now()
        WHERE id = $1`,
      [userId, organizationId]
    );
  }
}

async function seedFoodListings(client) {
  // Deadlines are computed relative to the moment the seed runs, not
  // hardcoded. Fixed dates rot: a hardcoded pickup deadline eventually sits
  // in the past, and the schema's food_listings_deadline_in_future CHECK
  // then rejects the seed outright.
  const inHours = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();

  // Row shape: id, org, created_by, name, description, category, safety_info,
  // total_qty, available_qty, unit, pickup_location, pickup_deadline,
  // use_by_deadline, status.
  //
  // pickup_deadline and use_by_deadline are deliberately different values on
  // every row: pickup says when the restaurant stops being there, use_by is
  // the restaurant's own estimate of how long the food stays fit to eat.
  // Neither implies the other, and the API never derives safety from the
  // pickup deadline being in the future.
  const rows = [
    [
      IDS.listings.bakery,
      IDS.organizations.restaurant,
      2,
      'Assorted bread and pastries',
      "Today's unsold bread, croissants, and samoon, bagged and ready for same-day collection.",
      'BAKERY',
      'Contains gluten, dairy, and eggs. Made this morning; keep in a cool place and consume within 24 hours.',
      40,
      25,
      'PORTIONS',
      'Golden Oven Bakery, 12 Tahlia Street, Riyadh — rear service entrance',
      inHours(24),
      inHours(40),
      'ACTIVE',
    ],
    [
      IDS.listings.kitchen,
      IDS.organizations.restaurant2,
      3,
      'Hot lunch trays — mixed rice and grilled chicken',
      'End-of-service hot trays, still safe and above holding temperature.',
      'PREPARED_MEALS',
      'Contains chicken, rice, and dairy. Allergens: milk. Reheat thoroughly before serving.',
      60,
      45,
      'PORTIONS',
      'Date Palm Kitchen, 44 King Fahd Road, Jeddah — kitchen loading bay',
      inHours(6),
      inHours(12),
      'ACTIVE',
    ],
    [
      IDS.listings.grocery,
      IDS.organizations.restaurant,
      2,
      'Surplus fruit boxes',
      'Slightly cosmetic-defect fruit, perfectly edible, from today delivery.',
      'PRODUCE',
      'Wash before eating. Stored at ambient temperature; no refrigeration required.',
      30,
      30,
      'BOXES',
      'Golden Oven Bakery, 12 Tahlia Street, Riyadh — rear service entrance',
      inHours(48),
      inHours(144),
      'ACTIVE',
    ],
  ];

  for (const r of rows) {
    await client.query(
      `INSERT INTO food_listings
         (id, organization_id, created_by_user_id, food_name, description, category,
          safety_info, total_quantity, available_quantity, unit,
          pickup_location, pickup_deadline, use_by_deadline, status)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE
         SET organization_id    = EXCLUDED.organization_id,
             created_by_user_id = EXCLUDED.created_by_user_id,
             food_name          = EXCLUDED.food_name,
             description        = EXCLUDED.description,
             category           = EXCLUDED.category,
             safety_info        = EXCLUDED.safety_info,
             total_quantity     = EXCLUDED.total_quantity,
             available_quantity = EXCLUDED.available_quantity,
             unit               = EXCLUDED.unit,
             pickup_location    = EXCLUDED.pickup_location,
             pickup_deadline    = EXCLUDED.pickup_deadline,
             use_by_deadline    = EXCLUDED.use_by_deadline,
             status             = EXCLUDED.status,
             updated_at         = now()`,
      r
    );
  }

  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('food_listings', 'id'),
       (SELECT COALESCE(MAX(id), 0) FROM food_listings)
     )`
  );
}

async function seedFoodRequests(client) {
  // Timestamps are relative to the seed run for the same reason as the
  // listings: a hardcoded responded_at eventually predates created_at (which
  // defaults to now()) and trips food_requests_responded_after_created.
  const inHours = (hours) => new Date(Date.now() + hours * 3600_000).toISOString();

  // Note that two different charities are requesting from the SAME listing
  // (listing 1) — the core requirement that listings and requests stay
  // separate so several charities can claim portions of one batch.
  const rows = [
    [
      IDS.requests.charityA,
      IDS.listings.bakery,
      IDS.organizations.charity,
      4,
      15,
      'PORTIONS',
      'We can collect by van this evening and distribute at tonight shelter service.',
      // COMPLETED, not ACCEPTED: the seed also writes the donation receipt
      // for this request below, and the workflow only ever creates a
      // donation when the charity confirms collection — which is exactly
      // the transition that completes a request. Keeping the two in step
      // means the fixture obeys the same rule the API enforces.
      'COMPLETED',
      2,
      inHours(-1),
      'Collected 15 of 40 portions; remainder still available.',
      // created_at must precede responded_at (food_requests_responded_after_-
      // created), and both must be explicit or created_at defaults to now()
      // and lands after the response.
      inHours(-4),
    ],
    [
      IDS.requests.charityB,
      IDS.listings.bakery,
      IDS.organizations.charity2,
      5,
      10,
      'PORTIONS',
      'Feeding 10 families in Al-Balad; we can send two volunteers at pickup time.',
      'PENDING',
      null,
      null,
      null,
      inHours(-3),
    ],
    [
      IDS.requests.charityC,
      IDS.listings.kitchen,
      IDS.organizations.charity,
      4,
      45,
      'PORTIONS',
      'This covers our full Wednesday meal run.',
      'PENDING',
      null,
      null,
      null,
      inHours(-2),
    ],
  ];

  for (const r of rows) {
    await client.query(
      `INSERT INTO food_requests
         (id, food_listing_id, charity_organization_id, requested_by_user_id,
          requested_quantity, unit, message, status, responded_by_user_id, responded_at,
          response_note, created_at)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE
         SET food_listing_id         = EXCLUDED.food_listing_id,
             charity_organization_id  = EXCLUDED.charity_organization_id,
             requested_by_user_id     = EXCLUDED.requested_by_user_id,
             requested_quantity       = EXCLUDED.requested_quantity,
             unit                     = EXCLUDED.unit,
             message                  = EXCLUDED.message,
             status                   = EXCLUDED.status,
             responded_by_user_id     = EXCLUDED.responded_by_user_id,
             responded_at             = EXCLUDED.responded_at,
             response_note            = EXCLUDED.response_note,
             created_at               = EXCLUDED.created_at,
             updated_at               = now()`,
      r
    );
  }

  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('food_requests', 'id'),
       (SELECT COALESCE(MAX(id), 0) FROM food_requests)
     )`
  );
}

async function seedDonations(client) {
  // Relative timestamps again: collected shortly after the request was
  // accepted, delivered shortly after that. Fixed dates would drift and
  // eventually fail donations_delivered_after_collected.
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

  const rows = [
    [
      IDS.donations.one,
      IDS.requests.charityA,
      IDS.listings.bakery,
      IDS.organizations.charity,
      4,
      15,
      'PORTIONS',
      hoursAgo(3),
      2,
      'Golden Oven Bakery, rear entrance',
      'DELIVERED',
      hoursAgo(2.5),
      4,
      'Hope Hand shelter kitchen, 7 Al-Malaz District, Riyadh',
      'Handed over in 3 sealed crates, all within date. Vans arrived 10 minutes early.',
    ],
  ];

  for (const r of rows) {
    await client.query(
      `INSERT INTO donations
         (id, food_request_id, food_listing_id, charity_organization_id, recorded_by_user_id,
          collected_quantity, unit, collected_at, collected_by_user_id, pickup_location,
          delivery_status, delivered_at, delivered_by_user_id, delivery_address, handover_notes)
       OVERRIDING SYSTEM VALUE
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE
         SET food_listing_id         = EXCLUDED.food_listing_id,
             charity_organization_id  = EXCLUDED.charity_organization_id,
             recorded_by_user_id      = EXCLUDED.recorded_by_user_id,
             collected_quantity       = EXCLUDED.collected_quantity,
             unit                     = EXCLUDED.unit,
             collected_at             = EXCLUDED.collected_at,
             collected_by_user_id     = EXCLUDED.collected_by_user_id,
             pickup_location          = EXCLUDED.pickup_location,
             delivery_status          = EXCLUDED.delivery_status,
             delivered_at             = EXCLUDED.delivered_at,
             delivered_by_user_id     = EXCLUDED.delivered_by_user_id,
             delivery_address         = EXCLUDED.delivery_address,
             handover_notes           = EXCLUDED.handover_notes,
             updated_at               = now()`,
      r
    );
  }

  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('donations', 'id'),
       (SELECT COALESCE(MAX(id), 0) FROM donations)
     )`
  );
}

export default async function seed() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await seedUsers(client);
    await seedOrganizations(client);
    // users.organization_id is a foreign key into organizations, so it can
    // only be set once the organizations above exist. ADMIN users have no
    // organization and are intentionally left NULL.
    await linkUsersToOrganizations(client);
    await seedFoodListings(client);
    await seedFoodRequests(client);
    await seedDonations(client);
    await client.query('COMMIT');
    console.log('Seed complete.');
    // Reported separately because they are now different credentials: the
    // administrator's comes from the environment, the fixtures share the
    // development password.
    console.log(`Admin login:        ${config.admin.email}`);
    console.log(`Development login password (four non-admin users): ${DEV_PASSWORD}`);
    if (ADMIN_PASSWORD === DEV_PASSWORD) {
      console.log(`Admin uses that same password (ADMIN_PASSWORD was not set).`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Only close the pool when seed.js is run directly. When setup.js imports
// it, the caller owns the pool and still needs it for its final report.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(closePool)
    .catch(async (error) => {
      console.error('Seeding failed:', error.message);
      await closePool();
      process.exit(1);
    });
}
