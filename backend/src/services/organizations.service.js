import { query } from '../database/query.js';
import { notFoundError, badRequest } from '../utils/errors.js';

// Organization lookup and verification decisions.
//
// Verification is the gate that sits in front of every donation action:
// `requireVerifiedOrg` in middleware/auth.js reads this status on each
// request. Changing it here therefore takes effect immediately, with no need
// to reissue tokens.

// Statuses an administrator may move an organization to. SUSPENDED exists in
// the schema for future use but is not an outcome this endpoint produces.
const DECIDABLE_STATUSES = ['VERIFIED', 'REJECTED'];

export async function listOrganizations({ viewer, status, limit = 50, offset = 0 }) {
  // An admin may inspect the whole queue, including PENDING and REJECTED
  // organizations. Everyone else only ever sees VERIFIED organizations —
  // an unverified organization's details are not public.
  const isAdmin = viewer.role === 'ADMIN';
  const filters = [];
  const params = [];

  if (status) {
    if (!['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'].includes(status)) {
      throw badRequest('INVALID_STATUS', 'status must be one of: PENDING, VERIFIED, REJECTED, SUSPENDED.');
    }
    params.push(status);
    filters.push(`o.verification_status = $${params.length}`);
  } else if (!isAdmin) {
    filters.push(`o.verification_status = 'VERIFIED'`);
  }

  // A non-admin asking for one specific organization may only read their own
  // or a verified one.
  if (!isAdmin) {
    params.push(viewer.organizationId);
    filters.push(`(o.verification_status = 'VERIFIED' OR o.id = $${params.length})`);
  }

  params.push(limit, offset);

  const { rows } = await query(
    `SELECT o.id, o.type, o.name, o.description, o.contact_email, o.contact_phone,
            o.contact_name, o.address_line, o.city, o.region, o.country,
            o.latitude, o.longitude, o.verification_status, o.verified_at,
            o.created_at
       FROM organizations o
      WHERE ${filters.join(' AND ')}
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return rows.map(toPublicOrganization);
}

export async function getOrganization({ viewer, id }) {
  const { rows } = await query(
    `SELECT o.*, u.email AS owner_email, u.first_name AS owner_first_name,
            u.last_name AS owner_last_name
       FROM organizations o
       JOIN users u ON u.id = o.owner_user_id
      WHERE o.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw notFoundError('ORGANIZATION_NOT_FOUND', 'That organization does not exist.');
  }

  const organization = rows[0];

  // Detail is visible to an admin, to a member of that organization, or to
  // anyone if it has been verified. Unverified organizations are private.
  const isVisible =
    viewer.role === 'ADMIN' ||
    Number(viewer.organizationId) === Number(organization.id) ||
    organization.verification_status === 'VERIFIED';

  if (!isVisible) {
    throw notFoundError('ORGANIZATION_NOT_FOUND', 'That organization does not exist.');
  }

  return toPublicOrganization(organization, {
    ownerEmail: organization.owner_email,
    ownerName: `${organization.owner_first_name} ${organization.owner_last_name}`,
  });
}

// Admin-only. Moves an organization to VERIFIED or REJECTED.
export async function decideVerification({ organizationId, decision, note, adminUserId }) {
  if (!DECIDABLE_STATUSES.includes(decision)) {
    throw badRequest(
      'INVALID_DECISION',
      `decision must be one of: ${DECIDABLE_STATUSES.join(', ')}.`
    );
  }

  const { rows: existing } = await query(
    `SELECT id, verification_status FROM organizations WHERE id = $1`,
    [organizationId]
  );
  if (existing.length === 0) {
    throw notFoundError('ORGANIZATION_NOT_FOUND', 'That organization does not exist.');
  }

  if (existing[0].verification_status === decision) {
    throw badRequest(
      'ALREADY_IN_STATUS',
      `That organization is already ${decision}.`
    );
  }

  // The schema's organizations_verified_pairing CHECK requires verified_at to
  // be set exactly when the status is VERIFIED, so it is written for an
  // approval and cleared for a rejection. verified_by_user_id records which
  // administrator made the call either way.
  const { rows } = await query(
    `UPDATE organizations
        SET verification_status = $2,
            verified_at         = CASE WHEN $2 = 'VERIFIED' THEN now() ELSE NULL END,
            verified_by_user_id = $3
      WHERE id = $1
      RETURNING id, type, name, verification_status, verified_at, updated_at`,
    [organizationId, decision, adminUserId]
  );

  const organization = rows[0];
  return {
    ...toPublicOrganization(organization),
    decisionNote: note ?? null,
  };
}

function toPublicOrganization(row, extra = {}) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    contactName: row.contact_name,
    addressLine: row.address_line,
    city: row.city,
    region: row.region,
    country: row.country,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    verificationStatus: row.verification_status,
    verifiedAt: row.verified_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    ...extra,
  };
}
