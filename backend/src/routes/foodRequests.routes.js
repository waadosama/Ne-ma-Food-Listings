import { Router } from 'express';
import * as foodRequestsController from '../controllers/foodRequests.controller.js';
import { authenticate, requireRole, requireVerifiedOrg } from '../middleware/auth.js';

const router = Router();

// The charity's side of the reservation workflow. Mounted at /requests, so
// the router.use() below scopes these guards to this prefix only — see the
// note at the top of foodListings.routes.js for why the mount point matters.
//
// Unlike the browse router, the role guard is applied per route rather than
// once for the whole router: reading is open to ADMIN as well as CHARITY
// (oversight must be able to follow a dispute), while every write stays with
// the charity that owns the request.

router.use(authenticate);

// Creating a request is the act of claiming food, so it needs both the
// CHARITY role and a verified organization. The organization itself is read
// from the session — never from the body — which is what makes "a charity
// cannot request on behalf of another organization" structural rather than
// a check someone has to remember.
router.post(
  '/',
  requireRole('CHARITY'),
  requireVerifiedOrg,
  foodRequestsController.create
);

router.get('/', requireRole('CHARITY', 'ADMIN'), foodRequestsController.listOwn);
router.get('/:id', requireRole('CHARITY', 'ADMIN'), foodRequestsController.getOwn);

// Cancelling deliberately does NOT require requireVerifiedOrg: withdrawing
// a claim is not moving food, and an organization whose verification was
// just pulled still has to be able to release what it was holding. The role
// guard and the ownership scope in the service are what matter here.
router.patch('/:id/cancel', requireRole('CHARITY'), foodRequestsController.cancel);

// Confirming collection is how a donation gets recorded, so it is gated as
// strictly as claiming the food in the first place.
router.post(
  '/:id/collect',
  requireRole('CHARITY'),
  requireVerifiedOrg,
  foodRequestsController.collect
);

export default router;
