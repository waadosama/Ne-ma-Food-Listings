import * as foodRequestsService from '../services/foodRequests.service.js';
import { validate } from '../utils/validate.js';
import { asyncHandler } from '../middleware/auth.js';
import { badRequest } from '../utils/errors.js';

// Controllers only handle HTTP concerns: read the request, call a service,
// send the response. They should not contain business logic.
//
// Note what is *not* in any payload below: charityOrganizationId, status,
// unit, respondedByUserId. Those columns belong to the platform. The
// charity is whoever the token says it is, and the status only ever moves
// through the service's transition table — so there is no field a client
// can send to ask on another organization's behalf or to skip the
// restaurant's approval. Unknown fields are rejected outright by
// allowOnly() rather than ignored, which is what turns an attempted
// smuggle into a visible 400 instead of a silent no-op.

const REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'];

// POST /api/requests
export const create = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['foodListingId', 'requestedQuantity', 'message'])
    .number('foodListingId', { min: 1 })
    .number('requestedQuantity', { min: 0.01, max: 100000 })
    .string('message', { required: false, max: 1000 })
    .result();

  res.status(201).json({
    request: await foodRequestsService.createRequest({ user: req.user, input: body }),
  });
});

// GET /api/requests
export const listOwn = asyncHandler(async (req, res) => {
  const { status, limit, offset } = validate(req.query)
    .allowOnly(['status', 'limit', 'offset'])
    .oneOf('status', REQUEST_STATUSES, { required: false })
    .number('limit', { required: false, min: 1, max: 100 })
    .number('offset', { required: false, min: 0 })
    .result();

  res.json({
    requests: await foodRequestsService.listOwnRequests({
      user: req.user,
      status,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }),
  });
});

// GET /api/requests/:id
export const getOwn = asyncHandler(async (req, res) => {
  res.json({
    request: await foodRequestsService.getRequest({
      user: req.user,
      id: Number(req.params.id),
    }),
  });
});

// PATCH /api/requests/:id/cancel
export const cancel = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['reason'])
    .string('reason', { required: false, max: 1000 })
    .result();

  res.json({
    request: await foodRequestsService.cancelRequest({
      user: req.user,
      id: Number(req.params.id),
      reason: body.reason ?? null,
    }),
  });
});

// POST /api/requests/:id/collect
//
// This endpoint is the collection confirmation the donation record depends
// on. Nothing about the receipted quantity is accepted from the client: the
// service derives it from the approved request, so a confirmation cannot be
// used to inflate or shrink what was reserved.
export const collect = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['handoverNotes'])
    .string('handoverNotes', { required: false, max: 2000 })
    .result();

  const { request, donation } = await foodRequestsService.confirmCollection({
    user: req.user,
    id: Number(req.params.id),
    input: body,
  });

  res.status(201).json({ request, donation });
});

// PATCH /api/food-listings/:id/requests/:requestId
//
// Lives here rather than in foodListings.controller.js because the decision
// is a request's state change; the listing id in the path is there to scope
// ownership, and the service locks exactly that pair.
export const decide = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['decision', 'responseNote'])
    .oneOf('decision', ['ACCEPTED', 'REJECTED'])
    .string('responseNote', { required: false, max: 1000 })
    .result();

  // Rejections must explain themselves — the charity is shown this note, and
  // the schema enforces the same rule (food_requests_rejection_needs_note).
  // Checked here so the caller gets a field-level 400 instead of a database
  // constraint violation surfacing as a generic error.
  if (body.decision === 'REJECTED' && !body.responseNote) {
    throw badRequest(
      'RESPONSE_NOTE_REQUIRED',
      'A rejection must include a responseNote explaining why to the charity.',
      [{ field: 'responseNote', message: 'Required when decision is REJECTED.' }]
    );
  }

  res.json({
    request: await foodRequestsService.decideRequest({
      user: req.user,
      listingId: Number(req.params.id),
      requestId: Number(req.params.requestId),
      decision: body.decision,
      responseNote: body.responseNote ?? null,
    }),
  });
});
