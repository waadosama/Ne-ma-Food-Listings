import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public: no token required.
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);

// Private: a valid Bearer token is required. authenticate() attaches
// req.user with the role and organization re-read from the database.
router.get('/auth/me', authenticate, authController.getMe);
router.patch('/auth/me', authenticate, authController.updateMe);

export default router;
