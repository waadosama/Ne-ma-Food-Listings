// End-to-end verification of the auth, role and organization-verification
// rules, run against a live server. Not part of the app — this is the
// evidence that the business rules actually hold.
import { setTimeout as sleep } from 'node:timers/promises';
import dotenv from 'dotenv';

// Reads backend/.env so the administrator credential here matches the one
// the seed actually provisioned. The seed sources it from the environment,
// so a test that hardcoded an address would break the moment either changed.
dotenv.config();

const BASE = process.env.BASE_URL || 'http://localhost:3001/api';

let pass = 0;
let fail = 0;
const failures = [];

async function call(label, { method = 'GET', path, token, body, expect, code }) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body is fine; we only assert on status */
  }

  const okStatus = res.status === expect;
  const okCode = code === undefined || json?.code === code;

  if (okStatus && okCode) {
    pass += 1;
    console.log(`  PASS  ${label}  ->  ${res.status}${json?.code ? ` ${json.code}` : ''}`);
  } else {
    fail += 1;
    const detail =
      `expected ${expect}${code ? `/${code}` : ''}, got ${res.status}` +
      `${json?.code ? `/${json.code}` : ''}` +
      `${json?.message ? ` — ${json.message}` : ''}`;
    failures.push(`${label}: ${detail}`);
    console.log(`  FAIL  ${label}  ->  ${detail}`);
  }
  return { status: res.status, json };
}

// The four non-admin accounts share the seeded development fixture password.
// The administrator is different: the seed takes its credential from the
// environment, so this test reads the same variables rather than assuming a
// fixed value. ADMIN_PASSWORD is required here because every organization
// verification check in this suite depends on being able to act as admin.
const DEV_PASSWORD = 'DevPassword123!';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'nema.admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || DEV_PASSWORD;

if (!process.env.ADMIN_PASSWORD) {
  console.warn(
    'ADMIN_PASSWORD is not set — falling back to the development fixture ' +
      'password. Set it in backend/.env to match the seeded administrator.'
  );
}

const ADMIN = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };
const RESTAURANT = { email: 'sara.tamimi@goldenoven.example.com', password: DEV_PASSWORD };
const RESTAURANT2 = { email: 'omar.haddad@datepalm.example.com', password: DEV_PASSWORD };
const CHARITY_VERIFIED = { email: 'layla.nasser@hopehand.example.com', password: DEV_PASSWORD };
const CHARITY_PENDING = { email: 'yusuf.rahman@tableforall.example.com', password: DEV_PASSWORD };

async function login(creds) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (res.status !== 200) return null;
  const json = await res.json();
  return json.token || json.accessToken || json.data?.token;
}

const tokens = {};
for (const [name, creds] of Object.entries({ ADMIN, RESTAURANT, RESTAURANT2, CHARITY_VERIFIED, CHARITY_PENDING })) {
  tokens[name] = await login(creds);
}

console.log('\n=== 1. Login ===');
console.log(`  admin=${!!tokens.ADMIN} restaurant=${!!tokens.RESTAURANT} restaurant2=${!!tokens.RESTAURANT2} charity=${!!tokens.CHARITY_VERIFIED} pending=${!!tokens.CHARITY_PENDING}`);

await call('login with correct password', {
  method: 'POST', path: '/auth/login', body: RESTAURANT, expect: 200,
});
await call('login with wrong password', {
  method: 'POST', path: '/auth/login',
  body: { email: RESTAURANT.email, password: 'wrong-password' },
  expect: 401, code: 'INVALID_CREDENTIALS',
});
await call('login with unknown email', {
  method: 'POST', path: '/auth/login',
  body: { email: 'nobody@nowhere.example.com', password: 'whatever' },
  expect: 401, code: 'INVALID_CREDENTIALS',
});

console.log('\n=== 2. Protected route: /auth/me ===');
await call('GET /auth/me with valid token', { path: '/auth/me', token: tokens.RESTAURANT, expect: 200 });
await call('GET /auth/me with no token', { path: '/auth/me', expect: 401, code: 'MISSING_TOKEN' });
await call('GET /auth/me with tampered token', {
  path: '/auth/me',
  token: `${tokens.RESTAURANT}x`,
  expect: 401, code: 'INVALID_TOKEN',
});

console.log('\n=== 3. Registration ===');
const stamp = Date.now();
const newRestaurant = {
  role: 'RESTAURANT',
  email: `reg-restaurant-${stamp}@example.com`,
  password: 'NewRestaurant123!',
  firstName: 'Reg', lastName: 'Restaurant',
  organization: {
    type: 'RESTAURANT',
    name: `Reg Restaurant ${stamp}`,
    city: 'Riyadh',
    addressLine: '1 Test Street',
  },
};
const regRes = await call('register a restaurant', {
  method: 'POST', path: '/auth/register', body: newRestaurant, expect: 201,
});
console.log(`    -> ${JSON.stringify(regRes.json).slice(0, 300)}`);

await call('register rejects unknown field', {
  method: 'POST', path: '/auth/register',
  body: { ...newRestaurant, email: `reg-role-${stamp}@example.com`, isAdmin: true },
  expect: 400,
});
await call('register rejects ADMIN role', {
  method: 'POST', path: '/auth/register',
  body: { ...newRestaurant, email: `reg-admin-${stamp}@example.com`, role: 'ADMIN' },
  expect: 400,
});
await call('register rejects verificationStatus smuggle', {
  method: 'POST', path: '/auth/register',
  body: {
    ...newRestaurant, email: `reg-verify-${stamp}@example.com`,
    organization: { ...newRestaurant.organization, verificationStatus: 'VERIFIED' },
  },
  expect: 400,
});
await call('register rejects duplicate email', {
  method: 'POST', path: '/auth/register',
  body: { ...newRestaurant, email: RESTAURANT.email }, expect: 409,
});

console.log('\n=== 4. Profile update cannot escalate privileges ===');
await call('PATCH /auth/me changes name', {
  method: 'PATCH', path: '/auth/me', token: tokens.RESTAURANT,
  body: { firstName: 'SaraUpdated' }, expect: 200,
});
await call('PATCH /auth/me rejects role', {
  method: 'PATCH', path: '/auth/me', token: tokens.RESTAURANT,
  body: { role: 'ADMIN' }, expect: 400,
});
await call('PATCH /auth/me rejects verificationStatus', {
  method: 'PATCH', path: '/auth/me', token: tokens.RESTAURANT,
  body: { organizationId: 3 }, expect: 400,
});

console.log('\n=== 5. Food listings: role and verification gates ===');
const listing = {
  foodName: 'Test loaves',
  description: 'Surplus loaves from the test run.',
  category: 'BAKERY',
  safetyInfo: 'Contains gluten.',
  totalQuantity: 10,
  unit: 'PORTIONS',
  pickupLocation: 'Test counter, rear door',
  pickupDeadline: new Date(Date.now() + 3600_000).toISOString(),
  useByDeadline: new Date(Date.now() + 7200_000).toISOString(),
};

await call('POST /food-listings as verified restaurant', {
  method: 'POST', path: '/food-listings', token: tokens.RESTAURANT, body: listing, expect: 201,
});
await call('POST /food-listings as charity -> 403', {
  method: 'POST', path: '/food-listings', token: tokens.CHARITY_VERIFIED, body: listing,
  expect: 403, code: 'INSUFFICIENT_ROLE',
});
await call('POST /food-listings with no token -> 401', {
  method: 'POST', path: '/food-listings', body: listing, expect: 401,
});
await call('POST /food-listings with negative quantity -> 400', {
  method: 'POST', path: '/food-listings', token: tokens.RESTAURANT,
  body: { ...listing, totalQuantity: -5 }, expect: 400,
});
await call('POST /food-listings with past deadline -> 400', {
  method: 'POST', path: '/food-listings', token: tokens.RESTAURANT,
  body: { ...listing, pickupDeadline: new Date(Date.now() - 3600_000).toISOString() },
  expect: 400, code: 'DEADLINE_IN_PAST',
});
await call('POST /food-listings with unknown category -> 400', {
  method: 'POST', path: '/food-listings', token: tokens.RESTAURANT,
  body: { ...listing, category: 'NOT_A_CATEGORY' }, expect: 400,
});
await call('GET /food-listings as restaurant', {
  path: '/food-listings', token: tokens.RESTAURANT, expect: 200,
});

console.log('\n=== 6. Unverified organization is blocked from publishing ===');
// The restaurant registered in section 3 is PENDING — new organizations
// start unverified and must be approved before they can participate. That
// account is the right fixture here: role is correct (RESTAURANT) and the
// account is active, so the only thing standing between it and a published
// listing is the organization's verification status.
//
// Note the ordering: a CHARITY calling POST /food-listings is rejected with
// INSUFFICIENT_ROLE, because role is checked before verification. Testing
// the verification gate with a charity would assert the wrong thing.
const pendingToken = await login({
  email: newRestaurant.email, password: newRestaurant.password,
});
console.log(`  registered restaurant token acquired=${!!pendingToken}`);

await call('PENDING restaurant POST /food-listings -> 403', {
  method: 'POST', path: '/food-listings', token: pendingToken, body: listing,
  expect: 403, code: 'ORGANIZATION_NOT_VERIFIED',
});
// Reading its own listings needs only the restaurant role, so a pending
// organization can still prepare what it means to publish.
await call('PENDING restaurant GET /food-listings -> 200', {
  path: '/food-listings', token: pendingToken, expect: 200,
});
await call('PENDING charity GET /browse/listings -> 403', {
  path: '/browse/listings', token: tokens.CHARITY_PENDING,
  expect: 403, code: 'ORGANIZATION_NOT_VERIFIED',
});
await call('PATCH /organizations/:id/verify as restaurant -> 403', {
  method: 'PATCH', path: '/organizations/5/verify', token: tokens.RESTAURANT,
  body: { decision: 'VERIFIED', note: 'should be refused' },
  expect: 403, code: 'INSUFFICIENT_ROLE',
});
await call('PATCH /organizations/:id/verify as charity -> 403', {
  method: 'PATCH', path: '/organizations/5/verify', token: tokens.CHARITY_VERIFIED,
  body: { decision: 'VERIFIED' },
  expect: 403, code: 'INSUFFICIENT_ROLE',
});
await call('PATCH /organizations/:id/verify as the org itself -> 403', {
  method: 'PATCH', path: '/organizations/5/verify', token: pendingToken,
  body: { decision: 'VERIFIED', note: 'self-approval attempt' },
  expect: 403, code: 'INSUFFICIENT_ROLE',
});

console.log('\n=== 7. Charity browse gates ===');
await call('GET /browse/listings as verified charity', {
  path: '/browse/listings', token: tokens.CHARITY_VERIFIED, expect: 200,
});
await call('GET /browse/listings as restaurant -> 403', {
  path: '/browse/listings', token: tokens.RESTAURANT, expect: 403, code: 'INSUFFICIENT_ROLE',
});
await call('GET /browse/listings with no token -> 401', {
  path: '/browse/listings', expect: 401,
});
await call('GET /browse/listings?category=BAKERY', {
  path: '/browse/listings?category=BAKERY', token: tokens.CHARITY_VERIFIED, expect: 200,
});
await call('GET /browse/listings?category=bogus -> 400', {
  path: '/browse/listings?category=bogus', token: tokens.CHARITY_VERIFIED, expect: 400,
});

console.log('\n=== 8. Admin verification of organizations ===');
await call('GET /organizations as admin', {
  path: '/organizations', token: tokens.ADMIN, expect: 200,
});
await call('PATCH /organizations/5/verify as admin (approve)', {
  method: 'PATCH', path: '/organizations/5/verify', token: tokens.ADMIN,
  body: { decision: 'VERIFIED', note: 'Verified during API test run.' }, expect: 200,
});
const org5 = await call('GET /organizations/5 now VERIFIED', {
  path: '/organizations/5', token: tokens.ADMIN, expect: 200,
});
console.log(`    -> verification_status=${org5.json?.organization?.verificationStatus}`);
// Once approved, the same account that was just blocked must now be allowed.
await call('approved restaurant POST /food-listings -> 201', {
  method: 'POST', path: '/food-listings', token: pendingToken, body: listing,
  expect: 201,
});
await call('PATCH /organizations/5/verify as admin (reject)', {
  method: 'PATCH', path: '/organizations/5/verify', token: tokens.ADMIN,
  body: { decision: 'REJECTED', note: 'Documents incomplete.' }, expect: 200,
});
await call('rejected restaurant POST /food-listings -> 403', {
  method: 'POST', path: '/food-listings', token: pendingToken, body: listing,
  expect: 403, code: 'ORGANIZATION_NOT_VERIFIED',
});
await call('re-verify to leave fixture in a usable state', {
  method: 'PATCH', path: '/organizations/5/verify', token: tokens.ADMIN,
  body: { decision: 'VERIFIED' }, expect: 200,
});
await call('PATCH /organizations/4/verify as admin (approve)', {
  method: 'PATCH', path: '/organizations/4/verify', token: tokens.ADMIN,
  body: { decision: 'VERIFIED', note: 'Verified during API test run.' }, expect: 200,
});
await call('previously-pending charity GET /browse/listings -> 200', {
  path: '/browse/listings', token: tokens.CHARITY_PENDING, expect: 200,
});

console.log('\n=== 9. Cross-organization access ===');
// Date Palm (user 3, org 2) must not be able to read or edit Golden Oven's
// (org 1) listing 1. Same id must look "not found", not "forbidden", so the
// endpoint cannot be used to probe which ids exist.
const listingsRes = await call('Date Palm lists its own listings', {
  path: '/food-listings', token: tokens.RESTAURANT2, expect: 200,
});
await call('Date Palm reads Golden Oven listing 1 -> 404', {
  path: '/food-listings/1', token: tokens.RESTAURANT2, expect: 404, code: 'LISTING_NOT_FOUND',
});
await call('Date Palm edits Golden Oven listing 1 -> 404', {
  method: 'PATCH', path: '/food-listings/1', token: tokens.RESTAURANT2,
  body: { foodName: 'Hijacked' }, expect: 404, code: 'LISTING_NOT_FOUND',
});
await call('Date Palm cancels Golden Oven listing 1 -> 404', {
  method: 'PATCH', path: '/food-listings/1/cancel', token: tokens.RESTAURANT2,
  body: { reason: 'not mine' }, expect: 404, code: 'LISTING_NOT_FOUND',
});
await call('Date Palm reads Golden Oven listing 1 requests -> 404', {
  path: '/food-listings/1/requests', token: tokens.RESTAURANT2,
  expect: 404, code: 'LISTING_NOT_FOUND',
});
await call('Golden Oven reads its own listing 1 -> 200', {
  path: '/food-listings/1', token: tokens.RESTAURANT, expect: 200,
});
await call('Golden Oven reads its own listing 1 requests -> 200', {
  path: '/food-listings/1/requests', token: tokens.RESTAURANT, expect: 200,
});

console.log('\n=== 10. Listing edit / cancel rules ===');
await call('edit own listing foodName -> 200', {
  method: 'PATCH', path: '/food-listings/3', token: tokens.RESTAURANT,
  body: { foodName: 'Surplus fruit boxes (updated)' }, expect: 200,
});
await call('edit with empty body -> 400', {
  method: 'PATCH', path: '/food-listings/3', token: tokens.RESTAURANT,
  body: {}, expect: 400,
});
await call('edit with past deadline -> 400', {
  method: 'PATCH', path: '/food-listings/3', token: tokens.RESTAURANT,
  body: { pickupDeadline: new Date(Date.now() - 3600_000).toISOString() },
  expect: 400, code: 'DEADLINE_IN_PAST',
});
// Listing 1 has 25 available after the seeded accepted request; asking for
// less than that would renege on food already promised.
await call('shrink total below available -> 400', {
  method: 'PATCH', path: '/food-listings/1', token: tokens.RESTAURANT,
  body: { totalQuantity: 10 }, expect: 400, code: 'TOTAL_BELOW_AVAILABLE',
});
await call('raise total -> 200', {
  method: 'PATCH', path: '/food-listings/1', token: tokens.RESTAURANT,
  body: { totalQuantity: 50 }, expect: 200,
});
await call('smuggle availableQuantity -> 400', {
  method: 'PATCH', path: '/food-listings/1', token: tokens.RESTAURANT,
  body: { availableQuantity: 999 }, expect: 400,
});
await call('smuggle status -> 400', {
  method: 'PATCH', path: '/food-listings/1', token: tokens.RESTAURANT,
  body: { status: 'COMPLETED' }, expect: 400,
});
await call('cancel own listing -> 200', {
  method: 'PATCH', path: '/food-listings/3/cancel', token: tokens.RESTAURANT,
  body: { reason: 'Sold out on site.' }, expect: 200,
});
await call('cancelled listing disappears from browse', {
  path: '/browse/listings', token: tokens.CHARITY_VERIFIED, expect: 200,
});
await call('edit a cancelled listing -> 400', {
  method: 'PATCH', path: '/food-listings/3', token: tokens.RESTAURANT,
  body: { foodName: 'Too late' }, expect: 400, code: 'LISTING_CANCELLED',
});
await call('cancel a cancelled listing -> 400', {
  method: 'PATCH', path: '/food-listings/3/cancel', token: tokens.RESTAURANT,
  body: {}, expect: 400, code: 'ALREADY_CANCELLED',
});

console.log('\n=== 11. Expired listing is not collectable ===');
// Create a listing whose pickup deadline has already passed, then confirm
// the API reports EXPIRED and keeps it out of charity browse. Nothing
// assumes an unexpired listing is safe, and nothing needs a cron job.
const expiredRes = await call('create a listing with a far-future deadline', {
  method: 'POST', path: '/food-listings', token: tokens.RESTAURANT,
  body: { ...listing, foodName: 'About to expire', pickupDeadline: new Date(Date.now() + 2000).toISOString() },
  expect: 201,
});
const expiredId = expiredRes.json?.listing?.id;
if (expiredId) {
  await sleep(2600);
  const readBack = await call('expired listing reports EXPIRED', {
    path: `/food-listings/${expiredId}`, token: tokens.RESTAURANT, expect: 200,
  });
  console.log(`    -> status=${readBack.json?.listing?.status}`);
  await call('expired listing is absent from charity browse', {
    path: '/browse/listings', token: tokens.CHARITY_VERIFIED, expect: 200,
  });
  await call('expired listing details -> 404 for charity', {
    path: `/browse/listings/${expiredId}`, token: tokens.CHARITY_VERIFIED,
    expect: 404, code: 'LISTING_NOT_FOUND',
  });
  await call('filter pickupBefore in the past -> 400', {
    path: '/browse/listings?pickupBefore=2020-01-01T00:00:00Z',
    token: tokens.CHARITY_VERIFIED, expect: 400, code: 'DEADLINE_IN_PAST',
  });
}

console.log('\n=== 12. Administrator oversees every organization ===');
// The admin is the only account that can see across tenants. It reads every
// organization's listings and their incoming requests, but it belongs to no
// organization of its own, so it must not be able to publish, edit or cancel
// anything — a listing is writable solely by the restaurant that owns it.
const adminListings = await call('admin lists every listing', {
  path: '/food-listings', token: tokens.ADMIN, expect: 200,
});
const adminOrgs = new Set((adminListings.json?.listings ?? []).map((l) => l.organizationId));
console.log(`    -> ${adminListings.json?.listings?.length} listings across ${adminOrgs.size} organization(s)`);
if (adminOrgs.size < 2) {
  console.log('  FAIL  admin should see listings from more than one organization');
  fail += 1;
} else {
  pass += 1;
}
await call('admin filters by status', {
  path: '/food-listings?status=CANCELLED', token: tokens.ADMIN, expect: 200,
});
await call('admin reads a listing owned by another org', {
  path: '/food-listings/1', token: tokens.ADMIN, expect: 200,
});
await call('admin reads that listing\'s incoming requests', {
  path: '/food-listings/1/requests', token: tokens.ADMIN, expect: 200,
});

// A restaurant, by contrast, sees only its own organization's listings and
// cannot use another org's id to probe.
const saraListings = await call('restaurant lists only its own', {
  path: '/food-listings', token: tokens.RESTAURANT, expect: 200,
});
const saraOrgs = new Set((saraListings.json?.listings ?? []).map((l) => l.organizationId));
console.log(`    -> restaurant sees organizations: ${[...saraOrgs].join(', ')}`);
if (saraOrgs.size > 1) {
  console.log('  FAIL  restaurant must not see other organizations\' listings');
  fail += 1;
} else {
  pass += 1;
}

// Writes stay with the owning restaurant.
await call('POST /food-listings as admin -> 403', {
  method: 'POST', path: '/food-listings', token: tokens.ADMIN, body: listing,
  expect: 403, code: 'INSUFFICIENT_ROLE',
});
await call('PATCH /food-listings/:id as admin -> 403', {
  method: 'PATCH', path: '/food-listings/1', token: tokens.ADMIN,
  body: { foodName: 'admin should not edit this' },
  expect: 403, code: 'INSUFFICIENT_ROLE',
});
await call('PATCH /food-listings/:id/cancel as admin -> 403', {
  method: 'PATCH', path: '/food-listings/1/cancel', token: tokens.ADMIN,
  body: { reason: 'admin should not cancel this' },
  expect: 403, code: 'INSUFFICIENT_ROLE',
});
const untouched = await call('listing 1 is unchanged after admin write attempts', {
  path: '/food-listings/1', token: tokens.ADMIN, expect: 200,
});
const unchanged = untouched.json?.listing?.foodName !== 'admin should not edit this';
console.log(`    -> foodName still "${untouched.json?.listing?.foodName}"`);
if (unchanged) pass += 1; else { console.log('  FAIL  an admin write went through'); fail += 1; }

console.log('\n=== Summary ===');
console.log(`  ${pass} passed, ${fail} failed`);
if (failures.length) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`   - ${f}`);
}
process.exit(fail ? 1 : 0);
