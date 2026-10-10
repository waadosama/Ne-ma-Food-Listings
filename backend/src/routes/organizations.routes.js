import { Router } from 'express';
import * as organizationsController from '../controllers/organizations.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Every route here requires a signed-in user.
router.use(authenticate);

// Read access is granted to all three roles; the service itself narrows what
// each caller sees (admins see the whole queue, everyone else only sees
// verified organizations plus their own).
router.get('/organizations', organizationsController.list);
router.get('/organizations/:id', organizationsController.getById);

// Writing verification status is admin-only. This is the single gate for
// "only administrators can approve or reject organizations".
router.patch(
  '/organizations/:id/verify',
  requireRole('ADMIN'),
  organizationsController.verify
);

export default router;
