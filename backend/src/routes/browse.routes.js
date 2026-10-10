import { Router } from 'express';
import * as browseController from '../controllers/browse.controller.js';
import { authenticate, requireRole, requireVerifiedOrg } from '../middleware/auth.js';

const router = Router();

// The charity side of the marketplace. Browsing is restricted to the
// CHARITY role — a restaurant is supply, not demand, and letting it browse
// would blur the separation the rest of the API relies on. Verification is
// required too, so only organizations an admin has approved can see what is
// on offer.
//
// Mounted at /browse/listings so this router.use() guards only the browse
// endpoints. See the note in foodListings.routes.js for why the mount point
// matters: a router mounted at / would apply its role guard to every other
// router's paths too.

router.use(authenticate, requireRole('CHARITY'), requireVerifiedOrg);

router.get('/', browseController.browse);
router.get('/:id', browseController.details);

export default router;
