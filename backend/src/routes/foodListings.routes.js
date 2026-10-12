import { Router } from 'express';
import * as foodListingsController from '../controllers/foodListings.controller.js';
import * as foodRequestsController from '../controllers/foodRequests.controller.js';
import { authenticate, requireRole, requireVerifiedOrg } from '../middleware/auth.js';

const router = Router();

// Every route here needs a signed-in user. Order matters: authenticate first
// (who are you), then requireRole (may you be here), then requireVerifiedOrg
// (is your organization verified).
//
// Reads admit ADMIN as well as RESTAURANT. The administrator oversees the
// whole platform, so it must be able to inspect any organization's listings
// and their incoming requests — the service widens the query accordingly.
// Writes stay RESTAURANT-only: an admin belongs to no organization and has
// nothing of its own to publish, so letting one edit a listing would mean
// editing a tenant's data on their behalf, which the platform does not do.
//
// This router is mounted at /food-listings, so router.use() below is scoped
// to that prefix. Mounting it at / instead would make these guards run for
// unrelated paths such as /browse/listings, silently blocking charities from
// their own endpoints.

router.use(authenticate);

// Publishing food is the one action that strictly requires verification —
// an unverified restaurant must not be able to put food on the platform.
router.post(
  '/',
  requireRole('RESTAURANT'),
  requireVerifiedOrg,
  foodListingsController.create
);

// Reading your own listings needs only the restaurant role: a PENDING
// organization can still prepare and review what it is about to publish.
router.get('/', requireRole('RESTAURANT', 'ADMIN'), foodListingsController.listOwn);
router.get('/:id', requireRole('RESTAURANT', 'ADMIN'), foodListingsController.getOwn);
router.get('/:id/requests', requireRole('RESTAURANT', 'ADMIN'), foodListingsController.listRequests);

// Editing and cancelling move a listing's state, so they stay with the
// restaurant that owns it.
router.patch('/:id', requireRole('RESTAURANT'), foodListingsController.update);
router.patch('/:id/cancel', requireRole('RESTAURANT'), foodListingsController.cancel);

// Approving or rejecting a request. The path carries the listing so
// ownership is part of the URL, but the service still scopes the lock by
// organization_id: a route guard alone is never the only thing standing
// between one restaurant and another's requests. ADMIN is excluded — it
// oversees the platform and never decides on a tenant's behalf.
router.patch(
  '/:id/requests/:requestId',
  requireRole('RESTAURANT'),
  foodRequestsController.decide
);

export default router;
