/**
 * Health Check Routes
 * Handles system health, uptime, and status endpoints
 */

export default function registerHealthRoutes(router) {
  /**
   * @route GET /health
   * @description Basic health check endpoint
   */
  router.get('/health', (ctx) => {
    return ctx.json({ 
      status: 'ok', 
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || 'development',
      dbEnabled: process.env.DB_ENABLED === 'true'
    });
  });
  
  /**
   * @route GET /health/detailed
   * @description Detailed health check (can be expanded later)
   */
  router.get('/health/detailed', (ctx) => {
    return ctx.json({
      status: 'ok',
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: Date.now()
    });
  });
}
