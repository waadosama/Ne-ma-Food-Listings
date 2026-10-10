import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import organizationsRoutes from './organizations.routes.js';
import foodListingsRoutes from './foodListings.routes.js';
import browseRoutes from './browse.routes.js';

// Central mount point: every feature route file is registered here and all
// of them live under /api.
//
// Each router is mounted at its own prefix rather than at '/'. That is what
// keeps a router's router.use() middleware — the authentication and role
// guards — scoped to its own endpoints. Mounting everything at '/' makes a
// guard written for one feature run for every request that passes through
// that router, which silently blocks unrelated routes (a charity calling
// /browse/listings would have been rejected by the restaurant role guard in
// foodListings). With prefixes, adding a new resource is one line and the
// scope is obvious from the mount point.
const router = Router();

router.use('/', healthRoutes);
router.use('/auth', authRoutes);
router.use('/organizations', organizationsRoutes);
router.use('/food-listings', foodListingsRoutes);
router.use('/browse/listings', browseRoutes);

export default router;
