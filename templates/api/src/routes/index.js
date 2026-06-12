/**
 * Main Router Configuration
 * Aggregates all sub-routes into a single router instance
 */

import Aether from '@aetherframework/middleware';
import registerHealthRoutes from './health.routes.js';
import registerUserRoutes from './user.routes.js';
import registerAuthRoutes from './auth.routes.js';

const { AetherRouter } = Aether;

// Create the main router instance
const router = new AetherRouter();

// ==========================================
// Register all route modules
// ==========================================

// 1. Health & System routes
registerHealthRoutes(router);

// 2. User management routes
registerUserRoutes(router);

// 3. Authentication routes
registerAuthRoutes(router);

// Add more route registrations here as the app grows
// import registerProductRoutes from './product.routes.js';
// registerProductRoutes(router);

export default router;
