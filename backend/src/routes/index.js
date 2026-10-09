import { Router } from 'express';
import healthRoutes from './health.routes.js';

// Central mount point: every feature route file is registered here and all
// of them live under /api. Adding a new resource is one line.
const router = Router();

router.use('/', healthRoutes);

export default router;
