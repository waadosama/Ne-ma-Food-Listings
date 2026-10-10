import * as authService from '../services/auth.service.js';
import { validate } from '../utils/validate.js';
import { asyncHandler } from '../middleware/auth.js';
import { badRequest } from '../utils/errors.js';

// Controllers only handle HTTP concerns: read the request, call a service,
// send the response. They should not contain business logic.

// POST /api/auth/register
//
// Allowed fields are listed explicitly. `role` is constrained to the two
// self-service roles, and anything else — including `verificationStatus`,
// `organizationId` or `isAdmin` — is rejected by allowOnly() rather than
// silently ignored, so a client cannot smuggle a privilege field past a
// typo. See utils/validate.js.
export const register = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly([
      'role',
      'email',
      'password',
      'firstName',
      'lastName',
      'phone',
      'organization',
    ])
    .oneOf('role', ['RESTAURANT', 'CHARITY'])
    .email('email')
    .password('password')
    .string('firstName', { max: 100 })
    .string('lastName', { max: 100 })
    .string('phone', { required: false, max: 40 })
    .result();

  // The organization block is validated separately so its problems come back
  // under `organization.<field>` and the client can map them onto a form.
  const orgInput = req.body.organization ?? {};
  const organization = validate(orgInput)
    .allowOnly([
      'type',
      'name',
      'description',
      'contactEmail',
      'contactPhone',
      'contactName',
      'addressLine',
      'city',
      'region',
      'postalCode',
      'country',
      'latitude',
      'longitude',
    ])
    .oneOf('type', ['RESTAURANT', 'BAKERY', 'GROCERY', 'CHARITY', 'NGO'])
    .string('name', { max: 200 })
    .string('description', { required: false, max: 2000 })
    .string('addressLine', { max: 300 })
    .string('city', { max: 120 })
    .string('region', { required: false, max: 120 })
    .string('postalCode', { required: false, max: 20 })
    .string('country', { required: false, max: 100 })
    .string('contactName', { required: false, max: 200 })
    .string('contactPhone', { required: false, max: 40 })
    .number('latitude', { required: false, min: -90, max: 90 })
    .number('longitude', { required: false, min: -180, max: 180 })
    .result();

  // A charity must register a charity-type organization and a restaurant a
  // restaurant-type one; letting them cross would make the later role rules
  // meaningless. NGO is accepted for charities because it is the same
  // receiving side of the platform.
  const allowedOrgTypes =
    body.role === 'CHARITY' ? ['CHARITY', 'NGO'] : ['RESTAURANT', 'BAKERY', 'GROCERY'];
  if (!allowedOrgTypes.includes(organization.type)) {
    res.status(400).json({
      error: 'Bad Request',
      code: 'ORGANIZATION_TYPE_MISMATCH',
      message: `A ${body.role} account must register an organization of type: ${allowedOrgTypes.join(', ')}.`,
      details: [{ field: 'organization.type', message: `Must be one of: ${allowedOrgTypes.join(', ')}.` }],
    });
    return;
  }

  const result = await authService.register({ ...body, organization });

  // 201 rather than 200: a resource was created.
  res.status(201).json(result);
});

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['email', 'password'])
    .email('email')
    .password('password')
    .result();

  res.json(await authService.login(body));
});

// GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  res.json({ user: await authService.getProfile(req.user.id) });
});

// PATCH /api/auth/me
//
// Deliberately narrow. Role, organization and verification status are not in
// the allow-list and not in the UPDATE statement, so there is no route from
// this endpoint to privilege escalation.
export const updateMe = asyncHandler(async (req, res) => {
  const body = validate(req.body)
    .allowOnly(['firstName', 'lastName', 'phone', 'currentPassword', 'newPassword'])
    .string('firstName', { required: false, max: 100 })
    .string('lastName', { required: false, max: 100 })
    .string('phone', { required: false, max: 40 })
    .string('currentPassword', { required: false, max: 72 })
    .password('newPassword', { required: false })
    .result();

  // A name-only update must not trip the password path.
  if (body.newPassword === undefined && body.currentPassword !== undefined) {
    throw badRequest(
      'CURRENT_PASSWORD_WITHOUT_NEW',
      'currentPassword is only meaningful when newPassword is also sent.'
    );
  }

  res.json({ user: await authService.updateProfile(req.user.id, body) });
});
