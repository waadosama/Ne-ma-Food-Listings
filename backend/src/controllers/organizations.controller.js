import * as organizationsService from '../services/organizations.service.js';
import { validate } from '../utils/validate.js';
import { asyncHandler } from '../middleware/auth.js';
import { badRequest } from '../utils/errors.js';

// GET /api/organizations
export const list = asyncHandler(async (req, res) => {
  const { status, limit, offset } = validate(req.query)
    .allowOnly(['status', 'limit', 'offset'])
    .string('status', { required: false, max: 20 })
    .number('limit', { required: false, min: 1, max: 100 })
    .number('offset', { required: false, min: 0 })
    .result();

  res.json({
    organizations: await organizationsService.listOrganizations({
      viewer: req.user,
      status,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }),
  });
});

// GET /api/organizations/:id
export const getById = asyncHandler(async (req, res) => {
  res.json({
    organization: await organizationsService.getOrganization({
      viewer: req.user,
      id: Number(req.params.id),
    }),
  });
});

// PATCH /api/organizations/:id/verify
//
// Admin-only, enforced by requireRole('ADMIN') on the route. This is the
// single place in the API where verification_status can change — the field
// is absent from registration and from profile updates, so there is no other
// path to it.
export const verify = asyncHandler(async (req, res) => {
  if (req.user.role !== 'ADMIN') {
    throw forbidden('INSUFFICIENT_ROLE', 'Only administrators can verify organizations.');
  }

  const body = validate(req.body)
    .allowOnly(['decision', 'note'])
    .oneOf('decision', ['VERIFIED', 'REJECTED'])
    .string('note', { required: false, max: 1000 })
    .result();

  const organizationId = Number(req.params.id);
  if (!Number.isInteger(organizationId) || organizationId < 1) {
    throw badRequest('INVALID_ORGANIZATION_ID', 'organization id must be a positive integer.');
  }

  res.json({
    organization: await organizationsService.decideVerification({
      organizationId,
      decision: body.decision,
      note: body.note,
      adminUserId: req.user.id,
    }),
  });
});
