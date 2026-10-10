import * as foodListingsService from '../services/foodListings.service.js';
import { validate } from '../utils/validate.js';
import { asyncHandler } from '../middleware/auth.js';
import { badRequest } from '../utils/errors.js';

// Controllers only handle HTTP concerns: read the request, call a service,
// send the response. They should not contain business logic.

// Shared field list for create and update. Deliberately excludes
// organization_id, available_quantity, status and cancellation_reason:
// those are owned by the platform, not the client. available_quantity in
// particular only ever moves as requests are accepted — letting a client
// set it directly would let a restaurant silently un-promise food.
const LISTING_FIELDS = [
  'foodName',
  'description',
  'category',
  'safetyInfo',
  'totalQuantity',
  'unit',
  'pickupLocation',
  'pickupDeadline',
  'useByDeadline',
];

// A deadline must be in the future at the moment it is submitted. Both
// deadline fields go through this so neither can be back-dated into meaning
// something the client did not intend.
function assertFuture(field, isoString) {
  if (new Date(isoString).getTime() <= Date.now()) {
    throw badRequest(
      'DEADLINE_IN_PAST',
      `${field} must be in the future.`,
      [{ field, message: 'Must be a future timestamp.' }]
    );
  }
}

// POST /api/food-listings
export const create = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(LISTING_FIELDS)
    .string('foodName', { max: 200 })
    .string('description', { required: false, max: 2000 })
    .oneOf('category', ['BAKERY', 'PREPARED_MEALS', 'PRODUCE', 'DAIRY', 'MEAT', 'PACKAGED', 'OTHER'], {
      required: false,
    })
    .string('safetyInfo', { required: false, max: 2000 })
    .number('totalQuantity', { min: 0.01, max: 100000 })
    .oneOf('unit', ['PORTIONS', 'KILOGRAMS', 'LITRES', 'ITEMS', 'BOXES'], { required: false })
    .string('pickupLocation', { max: 500 })
    .isoDate('pickupDeadline')
    .isoDate('useByDeadline', { required: false })
    .result();

  assertFuture('pickupDeadline', body.pickupDeadline);
  if (body.useByDeadline) assertFuture('useByDeadline', body.useByDeadline);

  res.status(201).json({
    listing: await foodListingsService.createListing({ user: req.user, input: body }),
  });
});

// GET /api/food-listings
export const listOwn = asyncHandler(async (req, res) => {
  const { status, limit, offset } = validate(req.query)
    .allowOnly(['status', 'limit', 'offset'])
    .oneOf('status', ['ACTIVE', 'RESERVED', 'COMPLETED', 'EXPIRED', 'CANCELLED'], {
      required: false,
    })
    .number('limit', { required: false, min: 1, max: 100 })
    .number('offset', { required: false, min: 0 })
    .result();

  res.json({
    listings: await foodListingsService.listOwnListings({
      user: req.user,
      status,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }),
  });
});

// GET /api/food-listings/:id
export const getOwn = asyncHandler(async (req, res) => {
  res.json({
    listing: await foodListingsService.getOwnListing({ user: req.user, id: Number(req.params.id) }),
  });
});

// PATCH /api/food-listings/:id
//
// Every field is optional — this is a partial update. Omitted fields keep
// their current value (see the COALESCE in the service).
export const update = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(LISTING_FIELDS)
    .string('foodName', { required: false, max: 200 })
    .string('description', { required: false, max: 2000 })
    .oneOf('category', ['BAKERY', 'PREPARED_MEALS', 'PRODUCE', 'DAIRY', 'MEAT', 'PACKAGED', 'OTHER'], {
      required: false,
    })
    .string('safetyInfo', { required: false, max: 2000 })
    .number('totalQuantity', { required: false, min: 0.01, max: 100000 })
    .oneOf('unit', ['PORTIONS', 'KILOGRAMS', 'LITRES', 'ITEMS', 'BOXES'], { required: false })
    .string('pickupLocation', { required: false, max: 500 })
    .isoDate('pickupDeadline', { required: false })
    .isoDate('useByDeadline', { required: false })
    .result();

  if (Object.keys(body).length === 0) {
    throw badRequest('EMPTY_UPDATE', 'Send at least one field to update.');
  }

  // Only deadlines actually being changed are checked against the clock, so
  // a safetyInfo tweak on a listing whose deadline is close does not fail.
  if (body.pickupDeadline) assertFuture('pickupDeadline', body.pickupDeadline);
  if (body.useByDeadline) assertFuture('useByDeadline', body.useByDeadline);

  res.json({
    listing: await foodListingsService.updateListing({
      user: req.user,
      id: Number(req.params.id),
      input: body,
    }),
  });
});

// PATCH /api/food-listings/:id/cancel
export const cancel = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['reason'])
    .string('reason', { required: false, max: 1000 })
    .result();

  res.json({
    listing: await foodListingsService.cancelListing({
      user: req.user,
      id: Number(req.params.id),
      reason: body.reason ?? null,
    }),
  });
});

// GET /api/food-listings/:id/requests
export const listRequests = asyncHandler(async (req, res) => {
  const { limit, offset } = validate(req.query)
    .allowOnly(['limit', 'offset'])
    .number('limit', { required: false, min: 1, max: 100 })
    .number('offset', { required: false, min: 0 })
    .result();

  res.json({
    requests: await foodListingsService.listListingRequests({
      user: req.user,
      id: Number(req.params.id),
      limit: limit ?? 50,
      offset: offset ?? 0,
    }),
  });
});
