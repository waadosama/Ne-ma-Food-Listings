import { query } from '../database/query.js';
import { withTransaction } from '../database/transaction.js';
import { notFoundError, badRequest, conflict } from '../utils/errors.js';

// The request/reservation workflow, on both sides of the marketplace:
//
//   charity      -> creates a request, cancels it, confirms collection
//   restaurant   -> approves or rejects requests against its own listings
//   system       -> records the donation, retires the listing
//
// Four rules shape everything here.
//
//  1. LOCK ORDER IS ALWAYS listing -> request. Every transaction in this
//     file (and the listing-cancel cascade in foodListings.service.js)
//     acquires locks in that order, so two transactions touching the same
//     pair can never deadlock waiting on each other. To honour that order
//     while still needing the request to know which listing it belongs to,
//     a request is first *read* unlocked to discover its listing, the
//     listing is then locked, and only then is the request locked and
//     re-read. The second read is the one that decides: anything checked
//     before the lock is advisory.
//
//  2. AVAILABILITY MOVES EXACTLY ONCE PER TRANSITION. Approving subtracts,
//     cancelling an approved request adds back, and collecting changes it
//     not at all (it was already subtracted at approval). No path both
//     subtracts and adds for the same reservation, which is what stops a
//     reservation being counted twice.
//
//  3. EXPIRY IS DERIVED, never stored. A listing past its pickup deadline
//     refuses new requests, approvals and collections the moment the
//     deadline passes, with no background job required.
//
//  4. EVERY STATE CHANGE APPENDS AN AUDIT ROW in the same transaction as
//     the change, so food_request_events can never disagree with the
//     request it describes.

// Statuses a request may still be cancelled from. Everything else is
// terminal: REJECTED and CANCELLED are settled, COMPLETED is history.
const CANCELLABLE_STATUSES = ['PENDING', 'ACCEPTED'];

// The complete, server-side transition table. Nothing outside this map
// moves a request, so an unexpected status can never be written by a
// handler that forgot to check.
const ALLOWED_TRANSITIONS = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['COMPLETED', 'CANCELLED'],
  REJECTED: [],
  CANCELLED: [],
  COMPLETED: [],
};

// Columns of food_requests, aliased `r` for joins. Kept in one place so
// every endpoint returns the same shape.
const REQUEST_COLUMN_NAMES = [
  'id', 'food_listing_id', 'charity_organization_id', 'requested_by_user_id',
  'requested_quantity', 'unit', 'message', 'status',
  'responded_by_user_id', 'responded_at', 'response_note',
  'created_at', 'updated_at',
];
const REQUEST_COLUMNS = REQUEST_COLUMN_NAMES.map((c) => `r.${c}`).join(', ');
// Same columns without the alias prefix, for INSERT/UPDATE ... RETURNING:
// those statements have no alias in scope, so `r.id` there is a syntax
// error. Deriving both from one array keeps them from drifting.
const REQUEST_COLUMNS_PLAIN = REQUEST_COLUMN_NAMES.join(', ');

// Listing columns needed to decide whether an action is still possible and
// to report the listing alongside a request. Plain names, because these are
// only ever selected from a locked single-table read.
const LISTING_LOCK_COLUMNS = `
  id, organization_id, status, unit, available_quantity, total_quantity,
  pickup_deadline, pickup_location, food_name
`;

// NUMERIC(10,2) on the way in: quantising here means the value compared
// against available_quantity is the same value that gets stored, so a
// rounding surprise cannot turn an approved request into an overbooking.
function roundQuantity(value) {
  return Math.round(Number(value) * 100) / 100;
}

function isPastPickup(listing) {
  return new Date(listing.pickup_deadline).getTime() <= Date.now();
}

// Expiry derived at read time, mirroring foodListings.service.js.
function effectiveListingStatus(listing) {
  if (listing.status === 'ACTIVE' && isPastPickup(listing)) return 'EXPIRED';
  return listing.status;
}

// ---------------------------------------------------------------------
// Locking primitives
// ---------------------------------------------------------------------

// Takes a row lock on the listing. Everyone who intends to change a
// listing's availability or read it for a decision starts here: whoever
// holds this lock is the only transaction currently allowed to reason about
// how much food is left.
async function lockListing(client, listingId) {
  const { rows } = await client.query(
    `SELECT ${LISTING_LOCK_COLUMNS}
       FROM food_listings
      WHERE id = $1
      FOR UPDATE`,
    [listingId]
  );

  if (rows.length === 0) {
    throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist.');
  }
  return rows[0];
}

// Same lock, with ownership baked into the SQL. A listing belonging to
// another organization reads as "not found" — never "forbidden" — so the
// endpoint cannot be used to probe which ids exist. Because the predicate
// is inside the locking statement, even a missing route guard could not let
// one restaurant decide a request on another restaurant's listing.
async function lockOwnedListing(client, listingId, organizationId) {
  const { rows } = await client.query(
    `SELECT ${LISTING_LOCK_COLUMNS}
       FROM food_listings
      WHERE id = $1 AND organization_id = $2
      FOR UPDATE`,
    [listingId, organizationId]
  );

  if (rows.length === 0) {
    throw notFoundError('LISTING_NOT_FOUND', 'That listing does not exist.');
  }
  return rows[0];
}

// Unlocked first read: only to discover which listing the request belongs
// to, so the listing lock can be taken in the correct order.
async function peekRequest(client, { requestId, charityOrganizationId }) {
  const filters = ['id = $1'];
  const params = [requestId];
  if (charityOrganizationId !== undefined) {
    params.push(charityOrganizationId);
    filters.push(`charity_organization_id = $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT id, food_listing_id FROM food_requests WHERE ${filters.join(' AND ')}`,
    params
  );

  if (rows.length === 0) throw requestNotFound();
  return rows[0];
}

// Second read, taken with the listing lock held and re-evaluated from
// scratch: this is the row whose status decides what may happen next.
async function lockRequest(client, { requestId, listingId, charityOrganizationId }) {
  const filters = ['id = $1', 'food_listing_id = $2'];
  const params = [requestId, listingId];
  if (charityOrganizationId !== undefined) {
    params.push(charityOrganizationId);
    filters.push(`charity_organization_id = $${params.length}`);
  }

  const { rows } = await client.query(
    `SELECT ${REQUEST_COLUMNS}
       FROM food_requests r
      WHERE ${filters.join(' AND ')}
      FOR UPDATE`,
    params
  );

  if (rows.length === 0) throw requestNotFound();
  return rows[0];
}

function requestNotFound() {
  return notFoundError('REQUEST_NOT_FOUND', 'That request does not exist.');
}

// ---------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------

// May this listing still be asked for, and for how much? Called with the
// listing row lock held, so the answer cannot go stale before the INSERT.
function assertRequestable(listing, quantity) {
  if (listing.status !== 'ACTIVE') {
    throw badRequest(
      'LISTING_NOT_ACTIVE',
      `A ${listing.status} listing is no longer taking requests.`
    );
  }
  if (isPastPickup(listing)) {
    throw badRequest(
      'LISTING_EXPIRED',
      'The pickup deadline for this listing has passed, so it can no longer be requested.'
    );
  }
  if (Number(listing.available_quantity) <= 0) {
    throw badRequest('LISTING_UNAVAILABLE', 'None of this listing is left.');
  }
  if (quantity > Number(listing.available_quantity)) {
    throw badRequest(
      'INSUFFICIENT_QUANTITY',
      `Only ${listing.available_quantity} ${listing.unit} of this listing ` +
        `is still available; you asked for ${quantity}.`,
      [{ field: 'requestedQuantity', message: `Must be at most ${listing.available_quantity}.` }]
    );
  }
}

// May this listing still be promised to a charity? Checked before the
// subtracting UPDATE; the UPDATE carries the same conditions again as a
// guarded backstop (see below).
function assertApprovable(listing, request) {
  if (listing.status !== 'ACTIVE' && listing.status !== 'RESERVED') {
    throw badRequest(
      'LISTING_NOT_ACTIVE',
      `A ${listing.status} listing can no longer accept requests.`
    );
  }
  if (isPastPickup(listing)) {
    throw badRequest(
      'LISTING_EXPIRED',
      'The pickup deadline has passed, so this request can no longer be approved.'
    );
  }
  if (Number(request.requested_quantity) > Number(listing.available_quantity)) {
    throw badRequest(
      'INSUFFICIENT_QUANTITY',
      `Only ${listing.available_quantity} ${listing.unit} is left, but this request asks ` +
        `for ${request.requested_quantity}. Reject it or ask the charity to request less.`,
      [{ field: 'requestedQuantity', message: `Must be at most ${listing.available_quantity}.` }]
    );
  }
}

// Every status move goes through here. The map is the single authority on
// what follows what, so a handler cannot invent a transition.
function assertTransition(from, to, code, message) {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw conflict(code, message(from));
  }
}

// ---------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------

async function appendEvent(client, {
  requestId,
  listingId,
  eventType,
  actorUserId,
  actorRole,
  fromStatus,
  toStatus,
  quantity,
  listingAvailableAfter,
  note,
}) {
  await client.query(
    `INSERT INTO food_request_events
       (food_request_id, food_listing_id, event_type, actor_user_id, actor_role,
        from_status, to_status, quantity, listing_available_after, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      requestId,
      listingId,
      eventType,
      actorUserId ?? null,
      actorRole ?? null,
      fromStatus ?? null,
      toStatus,
      quantity ?? null,
      listingAvailableAfter ?? null,
      note ?? null,
    ]
  );
}

// ---------------------------------------------------------------------
// Charity side — create
// ---------------------------------------------------------------------

// POST /api/requests
//
// The charity organization is taken from the caller's session, never from
// the payload. There is no field a client can send to file a request on
// behalf of another organization: the columns that would say otherwise are
// simply not read, and `allowOnly()` in the controller rejects them outright
// rather than ignoring them.
export async function createRequest({ user, input }) {
  const quantity = roundQuantity(input.requestedQuantity);

  return withTransaction(async (client) => {
    const listing = await lockListing(client, input.foodListingId);
    assertRequestable(listing, quantity);

    // One open request per charity per listing. Checked here, under the
    // listing lock, so two simultaneous submissions from the same charity
    // serialize: the second one sees the first. The partial unique index
    // food_requests_open_unique is the backstop if a future code path ever
    // skips this check.
    const existing = await client.query(
      `SELECT id, status
         FROM food_requests
        WHERE food_listing_id = $1
          AND charity_organization_id = $2
          AND status IN ('PENDING', 'ACCEPTED')`,
      [listing.id, user.organizationId]
    );
    if (existing.rows.length > 0) {
      throw conflict(
        'REQUEST_ALREADY_EXISTS',
        `Your organization already has a ${existing.rows[0].status.toLowerCase()} request ` +
          'for this listing. Cancel it first if you need to ask for a different amount.'
      );
    }

    const inserted = await client.query(
      `INSERT INTO food_requests
         (food_listing_id, charity_organization_id, requested_by_user_id,
          requested_quantity, unit, message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${REQUEST_COLUMNS_PLAIN}`,
      [
        listing.id,
        user.organizationId,
        user.id,
        quantity,
        // The unit is copied from the listing rather than accepted from the
        // client: what a charity asks for is denominated in whatever the
        // restaurant is offering, and a mismatched unit would make the
        // quantity comparison meaningless.
        listing.unit,
        input.message ?? null,
      ]
    );
    const request = inserted.rows[0];

    // Nothing is reserved yet — availability only moves on approval — so
    // listing_available_after is the unchanged availability, recorded so
    // the audit trail shows the reservation began from here.
    await appendEvent(client, {
      requestId: request.id,
      listingId: listing.id,
      eventType: 'REQUESTED',
      actorUserId: user.id,
      actorRole: user.role,
      fromStatus: null,
      toStatus: 'PENDING',
      quantity,
      listingAvailableAfter: listing.available_quantity,
      note: input.message ?? null,
    });

    return toPublicRequest(request, { listing });
  });
}

// ---------------------------------------------------------------------
// Restaurant side — decide
// ---------------------------------------------------------------------

// PATCH /api/food-listings/:id/requests/:requestId
//
// Ownership lives in lockOwnedListing's WHERE clause, so a restaurant can
// only ever reach requests against its own listings; a foreign id is a 404
// before the decision is even considered.
export async function decideRequest({ user, listingId, requestId, decision, responseNote }) {
  return withTransaction(async (client) => {
    const listing = await lockOwnedListing(client, listingId, user.organizationId);
    const request = await lockRequest(client, { requestId, listingId });

    // Duplicate action: the second decision finds a request that is no
    // longer PENDING and is refused, whatever the decision would have been.
    assertTransition(
      request.status,
      decision,
      'REQUEST_NOT_PENDING',
      (from) =>
        `This request is ${from} and can no longer be decided. ` +
        'Refresh the inbox — it has already been answered.'
    );

    if (decision === 'REJECTED') {
      const { rows } = await client.query(
        `UPDATE food_requests
            SET status            = 'REJECTED',
                responded_by_user_id = $2,
                responded_at       = now(),
                response_note      = $3
          WHERE id = $1
          RETURNING ${REQUEST_COLUMNS_PLAIN}`,
        [requestId, user.id, responseNote]
      );

      await appendEvent(client, {
        requestId,
        listingId,
        eventType: 'REJECTED',
        actorUserId: user.id,
        actorRole: user.role,
        fromStatus: request.status,
        toStatus: 'REJECTED',
        quantity: request.requested_quantity,
        // Unchanged: a rejection reserves nothing.
        listingAvailableAfter: listing.available_quantity,
        note: responseNote,
      });

      return toPublicRequest(rows[0], { listing });
    }

    // ---- APPROVED ----
    assertApprovable(listing, request);

    const quantity = Number(request.requested_quantity);

    // The reservation itself, as one atomic statement.
    //
    // Three things happen together or not at all:
    //   * availability is subtracted,
    //   * the listing flips to RESERVED when nothing is left,
    //   * every precondition is re-asserted in the WHERE clause.
    //
    // That last point is the belt to the guard's braces: even though this
    // transaction already holds the row lock and has checked the same
    // conditions, the UPDATE still repeats them
    // (`available_quantity >= $2`, `pickup_deadline > now()`). If they no
    // longer hold it matches zero rows instead of writing a negative
    // quantity — and the schema's food_listings_available_range CHECK would
    // reject a negative value anyway. Postgres itself is the last line of
    // defence, not the first.
    const updated = await client.query(
      `UPDATE food_listings
          SET available_quantity = available_quantity - $2::numeric,
              status = CASE
                WHEN available_quantity - $2::numeric <= 0
                  THEN 'RESERVED'::food_listing_status
                ELSE status
              END
        WHERE id = $1
          AND organization_id = $3
          AND status IN ('ACTIVE', 'RESERVED')
          AND available_quantity >= $2::numeric
          AND pickup_deadline > now()
        RETURNING ${LISTING_LOCK_COLUMNS}`,
      [listingId, quantity, user.organizationId]
    );

    if (updated.rows.length === 0) {
      // Unreachable while the lock is held and the guards run first; kept
      // so a future refactor that drops the lock fails closed rather than
      // overbooking.
      throw badRequest(
        'INSUFFICIENT_QUANTITY',
        'The available quantity changed before this request could be approved. ' +
          'Reload the listing and try again.'
      );
    }
    const after = updated.rows[0];

    const { rows } = await client.query(
      `UPDATE food_requests
          SET status              = 'ACCEPTED',
              responded_by_user_id = $2,
              responded_at         = now()
        WHERE id = $1
        RETURNING ${REQUEST_COLUMNS_PLAIN}`,
      [requestId, user.id]
    );

    await appendEvent(client, {
      requestId,
      listingId,
      eventType: 'APPROVED',
      actorUserId: user.id,
      actorRole: user.role,
      fromStatus: request.status,
      toStatus: 'ACCEPTED',
      quantity,
      listingAvailableAfter: after.available_quantity,
      note: responseNote ?? null,
    });

    return toPublicRequest(rows[0], { listing: after });
  });
}

// ---------------------------------------------------------------------
// Charity side — cancel
// ---------------------------------------------------------------------

// PATCH /api/requests/:id/cancel
//
// Cancelling a PENDING request changes nothing about availability: nothing
// was ever reserved. Cancelling an ACCEPTED one gives the quantity back,
// which is the only other place availability moves — the pair of writes is
// what keeps `total - available` equal to the outstanding reservations.
export async function cancelRequest({ user, id, reason }) {
  return withTransaction(async (client) => {
    const peek = await peekRequest(client, {
      requestId: id,
      charityOrganizationId: user.organizationId,
    });
    const listing = await lockListing(client, peek.food_listing_id);
    const request = await lockRequest(client, {
      requestId: id,
      listingId: peek.food_listing_id,
      charityOrganizationId: user.organizationId,
    });

    assertTransition(
      request.status,
      'CANCELLED',
      'REQUEST_NOT_CANCELLABLE',
      (from) =>
        from === 'COMPLETED'
          ? 'This request has already been collected and cannot be cancelled.'
          : `A ${from.toLowerCase()} request cannot be cancelled.`
    );

    let availableAfter = listing.available_quantity;

    if (request.status === 'ACCEPTED') {
      // Give the reservation back. LEAST(total, ...) keeps the schema's
      // available_quantity <= total_quantity invariant intact even if a
      // future change made the two drift.
      //
      // The status flip back to ACTIVE only applies while the listing is
      // still being offered: a cancelled or completed listing must not
      // silently reappear in browse because food was returned to it.
      const restored = await client.query(
        `UPDATE food_listings
            SET available_quantity = LEAST(total_quantity,
                                           available_quantity + $2::numeric),
                status = CASE
                  WHEN status = 'RESERVED' AND available_quantity + $2::numeric > 0
                    THEN 'ACTIVE'::food_listing_status
                  ELSE status
                END
          WHERE id = $1
            AND status IN ('ACTIVE', 'RESERVED')
          RETURNING ${LISTING_LOCK_COLUMNS}`,
        [listing.id, request.requested_quantity]
      );
      if (restored.rows.length > 0) availableAfter = restored.rows[0].available_quantity;
    }

    const { rows } = await client.query(
      `UPDATE food_requests
          SET status = 'CANCELLED'
        WHERE id = $1
        RETURNING ${REQUEST_COLUMNS_PLAIN}`,
      [id]
    );

    await appendEvent(client, {
      requestId: id,
      listingId: listing.id,
      eventType: 'CANCELLED',
      actorUserId: user.id,
      actorRole: user.role,
      fromStatus: request.status,
      toStatus: 'CANCELLED',
      quantity: request.requested_quantity,
      listingAvailableAfter: availableAfter,
      note: reason ?? null,
    });

    return toPublicRequest(rows[0], { listing: { ...listing, available_quantity: availableAfter } });
  });
}

// ---------------------------------------------------------------------
// Charity side — confirm collection
// ---------------------------------------------------------------------

// POST /api/requests/:id/collect
//
// This is the required collection confirmation: a donation row is written
// only here, and only after the charity says the food actually changed
// hands. Nothing else in the system creates a donation, so a donation's
// existence is proof of a confirmation rather than of an intention.
export async function confirmCollection({ user, id, input }) {
  return withTransaction(async (client) => {
    const peek = await peekRequest(client, {
      requestId: id,
      charityOrganizationId: user.organizationId,
    });
    const listing = await lockListing(client, peek.food_listing_id);
    const request = await lockRequest(client, {
      requestId: id,
      listingId: peek.food_listing_id,
      charityOrganizationId: user.organizationId,
    });

    // Only an approved request can be collected, and only once. The row
    // lock makes the second of two simultaneous confirmations see COMPLETED
    // and stop here; donations.food_request_id UNIQUE is the backstop.
    if (request.status === 'COMPLETED') {
      throw conflict('ALREADY_CONFIRMED', 'This collection has already been confirmed.');
    }
    assertTransition(
      request.status,
      'COMPLETED',
      'REQUEST_NOT_ACCEPTED',
      (from) =>
        `Only an accepted request can be collected; this one is ${from.toLowerCase()}.`
    );

    if (listing.status === 'CANCELLED') {
      throw badRequest('LISTING_CANCELLED', 'The listing for this request was cancelled.');
    }
    if (isPastPickup(listing)) {
      throw badRequest(
        'PICKUP_WINDOW_CLOSED',
        'The pickup deadline has passed, so this collection can no longer be confirmed. ' +
          'Contact the restaurant if the food is still collectable.'
      );
    }

    // The quantity collected is exactly the quantity that was reserved.
    // Accepting a smaller number here would leave the shortfall reserved
    // forever, and a larger one would promise food that was never approved;
    // both are ways to double-count. A short batch is a new conversation
    // with the restaurant, not a silent adjustment to this receipt.
    const quantity = Number(request.requested_quantity);

    const donationResult = await client.query(
      `INSERT INTO donations
         (food_request_id, food_listing_id, charity_organization_id,
          recorded_by_user_id, collected_quantity, unit,
          collected_by_user_id, pickup_location, handover_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $4, $7, $8)
       RETURNING id, food_request_id, food_listing_id, charity_organization_id,
                 recorded_by_user_id, collected_quantity, unit, collected_at,
                 collected_by_user_id, pickup_location, delivery_status,
                 delivered_at, delivered_by_user_id, delivery_address,
                 handover_notes, created_at, updated_at`,
      [
        request.id,
        listing.id,
        user.organizationId,
        user.id,
        quantity,
        request.unit,
        listing.pickup_location,
        input.handoverNotes ?? null,
      ]
    );

    const { rows } = await client.query(
      `UPDATE food_requests
          SET status = 'COMPLETED'
        WHERE id = $1
        RETURNING ${REQUEST_COLUMNS_PLAIN}`,
      [id]
    );

    // The listing retires once nothing is left to give away and no other
    // accepted request is still waiting to be collected. Until then it stays
    // ACTIVE (there is more food) or RESERVED (more is promised but not yet
    // handed over) — calling it COMPLETED while a charity still has to turn
    // up would be a lie the restaurant could act on.
    const listingResult = await client.query(
      `UPDATE food_listings
          SET status = 'COMPLETED'
        WHERE id = $1
          AND status IN ('ACTIVE', 'RESERVED')
          AND available_quantity <= 0
          AND NOT EXISTS (
            SELECT 1
              FROM food_requests r
             WHERE r.food_listing_id = $1
               AND r.status = 'ACCEPTED'
          )
        RETURNING ${LISTING_LOCK_COLUMNS}`,
      [listing.id]
    );
    const finalListing = listingResult.rows[0] ?? {
      ...listing,
      status: listing.status,
    };

    await appendEvent(client, {
      requestId: id,
      listingId: listing.id,
      eventType: 'COLLECTION_CONFIRMED',
      actorUserId: user.id,
      actorRole: user.role,
      fromStatus: request.status,
      toStatus: 'COMPLETED',
      quantity,
      // Unchanged: the food left at approval, not at handover.
      listingAvailableAfter: finalListing.available_quantity,
      note: input.handoverNotes ?? null,
    });

    return {
      request: toPublicRequest(rows[0], { listing: finalListing }),
      donation: toPublicDonation(donationResult.rows[0]),
    };
  });
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

// GET /api/requests — a charity's own dashboard. The charity organization
// comes from the session, so one charity's list can never contain another's
// rows; an administrator sees everything, because oversight that can only
// see one tenant is not oversight.
export async function listOwnRequests({ user, status, limit = 50, offset = 0 }) {
  const params = [];
  const filters = [];

  if (user.role !== 'ADMIN') {
    params.push(user.organizationId);
    filters.push(`r.charity_organization_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    filters.push(`r.status = $${params.length}`);
  }

  params.push(limit, offset);
  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT ${REQUEST_COLUMNS},
            o.id AS charity_id, o.name AS charity_name, o.city AS charity_city,
            o.verification_status AS charity_verification_status,
            l.id AS listing_id, l.food_name AS listing_food_name,
            l.unit AS listing_unit, l.status AS listing_status,
            l.available_quantity AS listing_available_quantity,
            l.total_quantity AS listing_total_quantity,
            l.pickup_location AS listing_pickup_location,
            l.pickup_deadline AS listing_pickup_deadline
       FROM food_requests r
       JOIN organizations o ON o.id = r.charity_organization_id
       JOIN food_listings l ON l.id = r.food_listing_id
       ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map((row) => toPublicRequest(row, {
    charity: {
      id: row.charity_id,
      name: row.charity_name,
      city: row.charity_city,
      verificationStatus: row.charity_verification_status,
    },
    listing: listingFromJoinedRow(row),
  }));
}

// GET /api/requests/:id — one request with its full audit trail. For a
// charity this is scoped to its own organization, so guessing ids gets a
// 404; the administrator may read any.
export async function getRequest({ user, id }) {
  const params = [id];
  let scope = '';
  if (user.role !== 'ADMIN') {
    params.push(user.organizationId);
    scope = ' AND r.charity_organization_id = $2';
  }

  const { rows } = await query(
    `SELECT ${REQUEST_COLUMNS},
            o.id AS charity_id, o.name AS charity_name, o.city AS charity_city,
            o.verification_status AS charity_verification_status,
            l.id AS listing_id, l.food_name AS listing_food_name,
            l.unit AS listing_unit, l.status AS listing_status,
            l.available_quantity AS listing_available_quantity,
            l.total_quantity AS listing_total_quantity,
            l.pickup_location AS listing_pickup_location,
            l.pickup_deadline AS listing_pickup_deadline
       FROM food_requests r
       JOIN organizations o ON o.id = r.charity_organization_id
       JOIN food_listings l ON l.id = r.food_listing_id
      WHERE r.id = $1${scope}`,
    params
  );

  if (rows.length === 0) throw requestNotFound();

  const events = await query(
    `SELECT e.id, e.event_type, e.actor_user_id, e.actor_role,
            e.from_status, e.to_status, e.quantity,
            e.listing_available_after, e.note, e.created_at
       FROM food_request_events e
      WHERE e.food_request_id = $1
      ORDER BY e.created_at ASC, e.id ASC`,
    [id]
  );

  return toPublicRequest(rows[0], {
    charity: {
      id: rows[0].charity_id,
      name: rows[0].charity_name,
      city: rows[0].charity_city,
      verificationStatus: rows[0].charity_verification_status,
    },
    listing: listingFromJoinedRow(rows[0]),
    events: events.rows.map(toPublicEvent),
  });
}

// ---------------------------------------------------------------------
// Shared with foodListings.service.js — listing cancellation cascade
// ---------------------------------------------------------------------

// Called by cancelListing inside a transaction that already holds the
// listing's row lock. Every open request against a withdrawn listing is
// settled here: a charity must not be left holding an ACCEPTED reservation
// for food the restaurant has just taken off the platform.
//
// Quantities that were reserved by ACCEPTED requests are returned to
// availability so `total - available` stays equal to the outstanding
// reservations even on a listing nobody can use any more. The subsequent
// CANCELLED write on the listing itself is what actually retires it.
//
// The WITH clause reads each open request's *pre-existing* status (an
// UPDATE's RETURNING only ever reports the new one) so the audit row can
// say whether the charity was still waiting or already approved.
export async function cancelRequestsForListing(client, { listing, actorUserId, actorRole, note }) {
  const { rows } = await client.query(
    `WITH open AS (
       SELECT id, status, requested_quantity
         FROM food_requests
        WHERE food_listing_id = $1
          AND status IN ('PENDING', 'ACCEPTED')
        FOR UPDATE
     )
     UPDATE food_requests r
        SET status = 'CANCELLED'
       FROM open
      WHERE r.id = open.id
      RETURNING r.id, open.status AS previous_status, open.requested_quantity AS quantity`,
    [listing.id]
  );

  if (rows.length === 0) return { cancelled: 0, listing };

  const restored = rows
    .filter((row) => row.previous_status === 'ACCEPTED')
    .reduce((sum, row) => sum + Number(row.quantity), 0);

  let availableAfter = listing.available_quantity;
  if (restored > 0) {
    const updated = await client.query(
      `UPDATE food_listings
          SET available_quantity = LEAST(total_quantity,
                                         available_quantity + $2::numeric)
        WHERE id = $1
        RETURNING ${LISTING_LOCK_COLUMNS}`,
      [listing.id, restored]
    );
    if (updated.rows.length > 0) availableAfter = updated.rows[0].available_quantity;
  }

  for (const row of rows) {
    await appendEvent(client, {
      requestId: row.id,
      listingId: listing.id,
      eventType: 'LISTING_CANCELLED',
      actorUserId,
      actorRole,
      fromStatus: row.previous_status,
      toStatus: 'CANCELLED',
      quantity: row.quantity,
      listingAvailableAfter: availableAfter,
      note,
    });
  }

  return { cancelled: rows.length, listing: { ...listing, available_quantity: availableAfter } };
}

// ---------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------

function listingFromJoinedRow(row) {
  const listing = {
    id: row.listing_id,
    foodName: row.listing_food_name,
    unit: row.listing_unit,
    status: row.listing_status,
    availableQuantity: Number(row.listing_available_quantity),
    totalQuantity: Number(row.listing_total_quantity),
    pickupLocation: row.listing_pickup_location,
    pickupDeadline: row.listing_pickup_deadline,
  };
  // Expiry is reported the same way it is enforced: derived from the
  // deadline at this moment, never read out of the status column.
  if (listing.status === 'ACTIVE' &&
      new Date(listing.pickupDeadline).getTime() <= Date.now()) {
    listing.status = 'EXPIRED';
  }
  return listing;
}

function toPublicRequest(row, { listing, charity, events } = {}) {
  return {
    id: row.id,
    foodListingId: row.food_listing_id,
    charityOrganizationId: row.charity_organization_id,
    requestedByUserId: row.requested_by_user_id,
    requestedQuantity: Number(row.requested_quantity),
    unit: row.unit,
    message: row.message,
    status: row.status,
    respondedByUserId: row.responded_by_user_id,
    respondedAt: row.responded_at,
    responseNote: row.response_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(listing
      ? {
          listing:
            listing.food_name !== undefined && listing.available_quantity !== undefined
              ? {
                  id: listing.id,
                  foodName: listing.food_name,
                  unit: listing.unit,
                  status: effectiveListingStatus(listing),
                  availableQuantity: Number(listing.available_quantity),
                  totalQuantity: Number(listing.total_quantity),
                  pickupLocation: listing.pickup_location,
                  pickupDeadline: listing.pickup_deadline,
                }
              : listing, // already public-shaped (from a joined read)
        }
      : {}),
    ...(charity ? { charity } : {}),
    ...(events ? { events } : {}),
  };
}

function toPublicEvent(row) {
  return {
    id: row.id,
    eventType: row.event_type,
    actorUserId: row.actor_user_id,
    actorRole: row.actor_role,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    quantity: row.quantity === null ? null : Number(row.quantity),
    listingAvailableAfter:
      row.listing_available_after === null ? null : Number(row.listing_available_after),
    note: row.note,
    createdAt: row.created_at,
  };
}

function toPublicDonation(row) {
  return {
    id: row.id,
    foodRequestId: row.food_request_id,
    foodListingId: row.food_listing_id,
    charityOrganizationId: row.charity_organization_id,
    recordedByUserId: row.recorded_by_user_id,
    collectedQuantity: Number(row.collected_quantity),
    unit: row.unit,
    collectedAt: row.collected_at,
    collectedByUserId: row.collected_by_user_id,
    pickupLocation: row.pickup_location,
    deliveryStatus: row.delivery_status,
    deliveredAt: row.delivered_at,
    deliveredByUserId: row.delivered_by_user_id,
    deliveryAddress: row.delivery_address,
    handoverNotes: row.handover_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
