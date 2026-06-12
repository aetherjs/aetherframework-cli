/**
 * User Routes
 * Handles user-related CRUD operations
 */

import { getPool } from '../config/database.js';

export default function registerUserRoutes(router) {
  /**
   * @route GET /api/users
   * @description Fetch all users (from DB or mock data)
   */
  router.get('/api/users', async (ctx) => {
    const isDbEnabled = process.env.DB_ENABLED === 'true';

    // Return mock data if DB is disabled
    if (!isDbEnabled) {
      return ctx.json({
        success: true,
        source: 'mock_data',
        data: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' }
        ]
      });
    }

    // Fetch from MySQL if enabled
    const pool = getPool();
    const [rows] = await pool.query('SELECT id, name, email FROM users LIMIT 10');
    
    return ctx.json({
      success: true,
      source: 'database',
      data: rows
    });
  });

  /**
   * @route GET /api/users/:id
   * @description Fetch a single user by ID
   */
  router.get('/api/users/:id', async (ctx) => {
    // Extract ID from route parameters (adjust based on Aether's param parsing)
    const userId = ctx.params?.id || ctx.req?.params?.id;
    
    return ctx.json({
      success: true,
      data: { id: userId, name: 'Alice', email: 'alice@example.com' }
    });
  });

  /**
   * @route POST /api/users
   * @description Create a new user
   */
  router.post('/api/users', async (ctx) => {
    // In a real app, parse ctx.request.body and insert into DB
    return ctx.json({ 
      success: true, 
      message: 'User created successfully',
      data: { id: Date.now(), name: 'New User', email: 'new@example.com' }
    });
  });
}
