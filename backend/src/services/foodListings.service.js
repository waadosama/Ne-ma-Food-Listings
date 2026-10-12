import { query } from '../database/query.js';
import { withTransaction } from '../database/transaction.js';
import { cancelRequestsForListing } from './foodRequests.service.js';
import { notFoundError, badRequest } from '../utils/errors.js';

// Food listing operations for both sides of the marketplace.
//
// Restaurant side: create, list own, read, edit, cancel, view requests.
// Charity side:    browse available, read details, filter.
//
// Two rules shape everything here:
//
//  1. Ownership is always scoped by organization, never by user. Any staff
//     member of the restaurant can manage its listings; no staff member of
//     another restaurant can. assertOwnsOrganization() in middleware/auth.js
//     is the single place that comparison happens.
//
//  2. Expiry is derived, not stored. There is no background job flipping
//     status to EXPIRED, so a listing is treated as expired the moment its
//     pickup_deadline passes, computed at read time. A stored status that
//     only a cron job updates would silently lie between runs.

// Statuses a listing may still be edited or cancelled from. Anything else
// is terminal and must be superseded by a new listing.
const EDITABLE_STATUSES = ['ACTIVE', 'RESERVED'];

// The subset of a listing's columns that maps to API field names. Kept in
// one place so every endpoint returns the same shape.
//
// Two spellings because SQL needs them: SELECTs alias the table as `l`, but
// INSERT and UPDATE ... RETURNING have no alias in scope, so `l.id` there is
// a syntax error. Deriving both from one array keeps them from drifting.
const LISTING_COLUMN_NAMES = [
  'id', 'organization_id', 'created_by_user_id', 'food_name', 'description',
  'category', 'safety_info', 'total_quantity', 'available_quantity', 'unit',
  'pickup_location', 'pickup_deadline', 'use_by_deadline', 'status',
  'cancellation_reason', 'created_at', 'updated_at',
];
const LISTING_COLUMNS = LISTING_COLUMN_NAMES.map((c) => `l.${c}`).join(', ');
const LISTING_COLUMNS_PLAIN = LISTING_COLUMN_NAMES.join(', ');

// ---------------------------------------------------------------------
// Restaurant side
// ---------------------------------------------------------------------

export async function createListing({ user, input }) {
  const { rows } = await query(
    `INSERT INTO food_listings
       (organization_id, created_by_user_id, food_name, description, category,
        safety_info, total_quantity, available_quantity, unit,
        pickup_location, pickup_deadline, use_by_deadline)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9, $10, $11)
     RETURNING ${LISTING_COLUMNS_PLAIN}`,
    [
      user.organizationId,
      user.id,
      input.foodName,
      input.description ?? null,
      input.category ?? 'OTHER',
      input.safetyInfo ?? null,
      input.totalQuantity,
      input.unit ?? 'PORTIONS',
      input.pickupLocation,
      input.pickupDeadline,
      input.useByDeadline ?? null,
    ]
  );

  return toPublicListing(rows[0]);
}

// Listings the caller is entitled to see, newest first. For a restaurant
// that is its own organization; for the administrator it is every
// organization, since the whole point of the role is oversight. The admin
// view includes organization name and verification status so a moderator can
// tell who is offering what without a second lookup.
export async function listOwnListings({ user, status, limit = 50, offset = 0 }) {
  const params = [];
  const filters = [];

  if (user.role === 'ADMIN') {
    // No organization filter: an admin sees the whole platform. An optional
    // status filter still applies, because "show me everything" is rarely
    // useful without a way to narrow it.
  } else {
    params.push(user.organizationId);
    filters.push(`l.organization_id = $${params.length}`);
  }

  if (status) {
    params.push(status);
    filters.push(`l.status = $${params.length}`);
  }

  params.push(limit, offset);

  // An admin list with no filters at all still needs a WHERE-free query;
  // emitting an empty one is a syntax error (see organizations.service.js).
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT ${LISTING_COLUMNS}, o.name AS organization_name, o.verification_status
       FROM food_listings l
       JOIN organizations o ON o.id = l.organization_id
      ${whereClause}
      ORDER BY l.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map((row) =>
    toPublicListing(row, {
      organizationName: row.organization_name,
      ...(user.role === 'ADMIN'
        ? { organizationVerificationStatus: row.verification_status }
        : {}),
    })
  );
}

// Reads one listing. A restaurant may only read its own, and a foreign id is
// reported as "not found" so the endpoint cannot be used to probe for other
// restaurants' listings. The administrator reads any listing, because
// oversight that can only see one tenant is not oversight.
export async function getOwnListing({ user, id }) {
  const row = await loadListingForRead({ user, id });
  return toPublicListing(row);
}

export async function updateListing({ user, id, input }) {
  const listing = await loadOwnedListing({ user, id });

  assertEditable(listing);

  // totalQuantity is editable, but only downward-safe: shrinking it below
  // what has already been promised would break the schema's
  // available_quantity <= total_quantity invariant and, more importantly,
  // silently renege on food a charity is counting on.
  if (
    input.totalQuantity !== undefined &&
    Number(input.totalQuantity) < Number(listing.available_quantity)
  ) {
    throw badRequest(
      'TOTAL_BELOW_AVAILABLE',
      `totalQuantity cannot be less than the ${listing.available_quantity} already ` +
        'reserved by accepted requests. Resolve those requests first.'
    );
  }

  // COALESCE keeps an omitted field unchanged, so a partial PATCH does not
  // blank the columns it forgot to send.
  const { rows } = await query(
    `UPDATE food_listings
        SET food_name       = COALESCE($3, food_name),
            description     = COALESCE($4, description),
            category        = COALESCE($5, category),
            safety_info     = COALESCE($6, safety_info),
            total_quantity  = COALESCE($7, total_quantity),
            unit            = COALESCE($8, unit),
            pickup_location = COALESCE($9, pickup_location),
            pickup_deadline = COALESCE($10, pickup_deadline),
            use_by_deadline = COALESCE($11, use_by_deadline)
      WHERE id = $1 AND organization_id = $2
      RETURNING ${LISTING_COLUMNS_PLAIN}`,
    [
      id,
      user.organizationId,
      input.foodName ?? null,
      input.description ?? null,
      input.category ?? null,
      input.safetyInfo ?? null,
      input.totalQuantity ?? null,
      input.unit ?? null,
      input.pickupLocation ?? null,
      input.pickupDeadline ?? null,
      input.useByDeadline ?? null,
    ]
  );

  return toPublicListing(rows[0]);
}

// Cancelling is a status change, not a delete: the row stays so any
// requests already made against it keep their history.
//
// It is also the one listing write that has to settle other rows, so it
// runs in a transaction: a charity must not be left holding an ACCEPTED
// reservation against food the restaurant has just withdrawn. The open
// requests are cancelled and their quantities returned before the listing
// itself is retired, all under the single row lock taken below.
export async function cancelListing({ user, id, reason }) {
  return withTransaction(async (client) => {
    // Locked read on the same connection as the writes that follow, so the
    // status checked here cannot go stale between the check and the UPDATE.
    const locked = await client.query(
      `SELECT ${LISTING_COLUMNS_PLAIN}
         FROM food_listings
        WHERE id = $1 AND organization_id = $2
        FOR UPDATE`,
      [id, user.organizationId]
    );

    if (locked.rows.length === 0) {
      throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist.');
    }
    const listing = locked.rows[0];

    if (listing.status === 'CANCELLED') {
      throw badRequest('ALREADY_CANCELLED', 'That listing has already been cancelled.');
    }
    if (!EDITABLE_STATUSES.includes(listing.status)) {
      throw badRequest(
        'NOT_CANCELABLE',
        `A ${listing.status} listing cannot be cancelled.`
      );
    }

    await cancelRequestsForListing(client, {
      listing,
      actorUserId: user.id,
      actorRole: user.role,
      note: reason ?? 'Listing withdrawn by the restaurant.',
    });

    const updated = await client.query(
      `UPDATE food_listings
          SET status = 'CANCELLED', cancellation_reason = $3
        WHERE id = $1 AND organization_id = $2
        RETURNING ${LISTING_COLUMNS_PLAIN}`,
      [id, user.organizationId, reason]
    );

    return toPublicListing(updated.rows[0]);
  });
}

// The requests this listing has attracted — the restaurant's inbox for a
// single batch of food. An admin may read any listing's inbox, which is how
// disputes between a restaurant and a charity get investigated.
export async function listListingRequests({ user, id, limit = 50, offset = 0 }) {
  await loadListingForRead({ user, id });

  const { rows } = await query(
    `SELECT r.id, r.requested_quantity, r.unit, r.message, r.status,
            r.created_at, r.responded_at, r.response_note,
            o.id AS charity_id, o.name AS charity_name, o.city AS charity_city,
            o.verification_status AS charity_verification_status
       FROM food_requests r
       JOIN organizations o ON o.id = r.charity_organization_id
      WHERE r.food_listing_id = $1
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3`,
    [id, limit, offset]
  );

  return rows.map((row) => ({
    id: row.id,
    requestedQuantity: Number(row.requested_quantity),
    unit: row.unit,
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    responseNote: row.response_note,
    charity: {
      id: row.charity_id,
      name: row.charity_name,
      city: row.charity_city,
      verificationStatus: row.charity_verification_status,
    },
  }));
}

// ---------------------------------------------------------------------
// Charity side
// ---------------------------------------------------------------------

// Public browse: only what is genuinely obtainable — active, still
// available, not past its pickup deadline, and from a verified organization.
export async function browseAvailable({ category, pickupBefore, limit = 50, offset = 0 }) {
  const params = [];
  const filters = [
    `l.status = 'ACTIVE'`,
    'l.available_quantity > 0',
    'l.pickup_deadline > now()',
    `o.verification_status = 'VERIFIED'`,
  ];

  if (category) {
    params.push(category);
    filters.push(`l.category = $${params.length}`);
  }

  // "I can collect before X" — the practical filter for a charity with one
  // van run a day.
  if (pickupBefore) {
    params.push(pickupBefore);
    filters.push(`l.pickup_deadline <= $${params.length}`);
  }

  params.push(limit, offset);

  const { rows } = await query(
    `SELECT ${LISTING_COLUMNS}, o.name AS organization_name, o.city AS organization_city
       FROM food_listings l
       JOIN organizations o ON o.id = l.organization_id
      WHERE ${filters.join(' AND ')}
      ORDER BY l.pickup_deadline ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map((row) =>
    toPublicListing(row, { organizationName: row.organization_name, organizationCity: row.organization_city })
  );
}

export async function getListingDetails({ id }) {
  const { rows } = await query(
    `SELECT ${LISTING_COLUMNS}, o.name AS organization_name, o.city AS organization_city,
            o.type AS organization_type
       FROM food_listings l
       JOIN organizations o ON o.id = l.organization_id
      WHERE l.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist.');
  }

  const row = rows[0];

  // A listing is only visible to the public once it is genuinely
  // collectable: still active, still available, still before its deadline,
  // and from a verified organization.
  const isVisible =
    row.status === 'ACTIVE' &&
    Number(row.available_quantity) > 0 &&
    new Date(row.pickup_deadline).getTime() > Date.now() &&
    row.verification_status === 'VERIFIED';

  if (!isVisible) {
    throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist or is no longer available.');
  }

  return toPublicListing(row, {
    organizationName: row.organization_name,
    organizationCity: row.organization_city,
  });
}

// ---------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------

// Two loaders, because "may read" and "may write" are different questions.
//
// loadListingForRead lets the administrator past the ownership filter, since
// oversight that can only see one tenant is not oversight. It is used by the
// read paths only.
//
// loadOwnedListing never exempts anyone. It backs the update and cancel
// paths, so a listing is writable solely by the organization that owns it.
// The ownership predicate also lives in the UPDATE statement itself, meaning
// even a route-guard mistake could not let one tenant edit another's row.
async function loadListingForRead({ user, id }) {
  if (user.role === 'ADMIN') {
    const { rows } = await query(
      `SELECT ${LISTING_COLUMNS}
         FROM food_listings l
        WHERE l.id = $1`,
      [id]
    );

    if (rows.length === 0) {
      throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist.');
    }
    return rows[0];
  }

  return loadOwnedListing({ user, id });
}

async function loadOwnedListing({ user, id }) {
  const { rows } = await query(
    `SELECT ${LISTING_COLUMNS}
       FROM food_listings l
      WHERE l.id = $1 AND l.organization_id = $2`,
    [id, user.organizationId]
  );

  if (rows.length === 0) {
    // Same message whether the listing is missing or belongs to someone
    // else, so the endpoint cannot be used to discover other orgs' ids.
    throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist.');
  }

  return rows[0];
}

function assertEditable(listing) {
  if (listing.status === 'CANCELLED') {
    throw badRequest(
      'LISTING_CANCELLED',
      'A cancelled listing cannot be edited. Create a new listing instead.'
    );
  }
  if (!EDITABLE_STATUSES.includes(listing.status)) {
    throw badRequest(
      'LISTING_NOT_EDITABLE',
      `A ${listing.status} listing cannot be edited.`
    );
  }
}

// Expiry is computed here rather than stored. A listing past its pickup
// deadline reports EXPIRED regardless of what the status column says, so it
// stops being actionable the moment the deadline passes — with no cron job
// required to make that true.
function effectiveStatus(row) {
  if (row.status === 'ACTIVE' && new Date(row.pickup_deadline).getTime() <= Date.now()) {
    return 'EXPIRED';
  }
  return row.status;
}

function toPublicListing(row, extra = {}) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    createdByUserId: row.created_by_user_id,
    foodName: row.food_name,
    description: row.description,
    category: row.category,
    safetyInfo: row.safety_info,
    totalQuantity: Number(row.total_quantity),
    availableQuantity: Number(row.available_quantity),
    unit: row.unit,
    pickupLocation: row.pickup_location,
    // Reported as a raw ISO instant. Whether the food is still fit to eat is
    // a judgement for the charity, informed by safetyInfo and
    // useByDeadline — never inferred from this being in the future.
    pickupDeadline: row.pickup_deadline,
    useByDeadline: row.use_by_deadline,
    status: effectiveStatus(row),
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,
  };
}
