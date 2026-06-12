/**
 * Authentication Routes
 * Fixed: ES Module compatibility - using the correct JWT middleware API
 */

// Import the JWT middleware factory from the framework
import { jwt } from '../middleware/index.js';
import logger from "../utils/logger.js";
/**
 * Helper function to safely parse JSON request body
 * Fallback for when framework's body parser doesn't work
 */
async function parseRawBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        
        // Set encoding to prevent character encoding issues
        req.setEncoding('utf8');

        req.on('data', (chunk) => {
            body += chunk;
        });

        req.on('end', () => {
            try {
                if (!body) {
                    resolve({});
                    return;
                }
                const parsed = JSON.parse(body);
                resolve(parsed);
            } catch (e) {
                logger.fatal('[Auth] JSON Parse Error:', e.message);
                resolve({}); // Return empty object on parse failure to avoid crash
            }
        });

        req.on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Register authentication routes with the router
 * @param {Object} router - The Aether router instance
 */
export default function registerAuthRoutes(router) {
    
    /**
     * @route POST /api/auth/login
     * @description Authenticate user credentials and return JWT token
     * @access Public
     */
    router.post('/api/auth/login', async (ctx) => {
        // CRITICAL FIX: In Aether Framework, parsed JSON body is stored in ctx.body
        let body = ctx.body || {};
        // Fallback: If ctx.body is empty, try to parse from raw request
        if (!body || Object.keys(body).length === 0) {
            try {
                body = await parseRawBody(ctx._request || ctx.req || ctx);
            } catch (error) {
                logger.fatal('[Auth] Raw body parsing failed:', error);
            }
        }
        
        const { username, password } = body;
        
        // Validate required fields
        if (!username || !password) {
            ctx.status = 400;
            return ctx.json({
                success: false,
                error: 'Missing username or password',
                hint: 'Ensure Content-Type: application/json and valid JSON body',
                debug: {
                    receivedBody: body,
                    bodyKeys: Object.keys(body),
                    contentType: ctx.headers?.['content-type']
                }
            });
        }
        
        // Mock authentication - replace with real database validation
        if (username === 'admin' && password === 'password') {
            
            try {
                // Get JWT secret from environment variables
                const secret = process.env.JWT_SECRET || 'your-actual-secret-key-change-this-now';
                
                // User payload for JWT token
                const userPayload = {
                    userId: 1,
                    username: 'admin',
                    role: 'admin',
                    iat: Math.floor(Date.now() / 1000), // Issued at timestamp
                    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours from now
                };
                
                let token;

                // Method 1: Use the static sign method directly
                if (typeof jwt.sign === 'function') {
                    token = await jwt.sign(
                        userPayload,
                        secret,
                        { 
                            expiresIn: process.env.JWT_EXPIRES_IN || '24h',
                            algorithm: process.env.JWT_ALGORITHM || 'HS256'
                        }
                    );
                }
                
                // Set session data if session middleware is enabled
                if (ctx.session) {
                    // Try different session APIs for compatibility
                    if (typeof ctx.session.set === 'function') {
                        ctx.session.set('userId', 1);
                        ctx.session.set('username', 'admin');
                        ctx.session.set('role', 'admin');
                        ctx.session.set('loginTime', new Date().toISOString());
                    } else {
                        // Direct assignment
                        ctx.session.userId = 1;
                        ctx.session.username = 'admin';
                        ctx.session.role = 'admin';
                        ctx.session.loginTime = new Date().toISOString();
                    }
                } else {
                    logger.warn('[Auth] Session not available (SESSION_ENABLED might be false)');
                }

                // Return successful authentication response
                ctx.status = 200;
                return ctx.json({
                    success: true,
                    message: 'Authentication successful',
                    token: token,
                    tokenType: 'Bearer',
                    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
                    user: {
                        id: 1,
                        username: 'admin',
                        role: 'admin'
                    }
                });
                
            } catch (error) {
                logger.fatal('[Auth] Token generation error:', error);
                logger.fatal('[Auth] Error stack:', error.stack);
                ctx.status = 500;
                return ctx.json({
                    success: false,
                    error: 'Token generation failed',
                    debug: {
                        error: error.message,
                        hint: 'Check JWT_SECRET in .env file and ensure it matches the algorithm requirements'
                    }
                });
            }
        }
        
        // Authentication failed - invalid credentials
        logger.warn('[Auth] Invalid credentials for user:', username);
        ctx.status = 401;
        return ctx.json({
            success: false,
            error: 'Invalid credentials',
            hint: 'Use username: admin, password: password for testing'
        });
    });

    /**
     * @route POST /api/auth/register
     * @description Register a new user account
     * @access Public
     */
    router.post('/api/auth/register', async (ctx) => {
        // Get request body from ctx.body (Aether Framework standard)
        const body = ctx.body || {};
        const { username, email, password } = body;
        
        // Validate required fields
        if (!username || !email || !password) {
            ctx.status = 400;
            return ctx.json({
                success: false,
                error: 'Missing required fields',
                required: ['username', 'email', 'password']
            });
        }
        
        // In a real application, you would:
        // 1. Validate email format
        // 2. Check password strength
        // 3. Check if user already exists
        // 4. Hash the password
        // 5. Save to database
        
        // For now, return mock success response
        ctx.status = 201; // Created
        return ctx.json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: Date.now(), // Mock ID
                username: username,
                email: email,
                createdAt: new Date().toISOString()
            }
        });
    });

    /**
     * @route GET /api/auth/profile
     * @description Get current authenticated user's profile
     * @access Private (requires valid JWT token)
     */
    router.get('/api/auth/profile', async (ctx) => {
        // JWT middleware should populate user data in context
        // Try multiple possible locations where user data might be stored
        const user = ctx.state?.user || 
                    ctx.user || 
                    ctx.state?.jwt ||
                    (typeof ctx.getState === 'function' ? ctx.getState('user') : null);
        
        if (!user) {
            ctx.status = 401;
            return ctx.json({
                success: false,
                error: 'Unauthorized',
                hint: 'Valid JWT token required in Authorization header',
                debug: {
                    hasStateUser: !!ctx.state?.user,
                    hasUser: !!ctx.user,
                    hasStateJwt: !!ctx.state?.jwt
                }
            });
        }
        
        // Return user profile
        return ctx.json({
            success: true,
            user: user,
            timestamp: new Date().toISOString()
        });
    });

    /**
     * @route GET /api/auth/session
     * @description Get current session information
     * @access Public (but session data may be private)
     */
    router.get('/api/auth/session', async (ctx) => {
        let sessionId = null;
        let sessionData = {};
        
        if (ctx.session) {
            // Extract session information using different possible APIs
            if (typeof ctx.session.getId === 'function') {
                sessionId = ctx.session.getId();
            } else if (ctx.session.id) {
                sessionId = ctx.session.id;
            }
            
            // Get session data
            if (typeof ctx.session.getAllData === 'function') {
                sessionData = ctx.session.getAllData();
            } else if (typeof ctx.session.toJSON === 'function') {
                sessionData = ctx.session.toJSON();
            } else {
                // Copy non-function properties
                Object.keys(ctx.session).forEach(key => {
                    if (typeof ctx.session[key] !== 'function') {
                        sessionData[key] = ctx.session[key];
                    }
                });
            }
        }
        
        return ctx.json({
            success: true,
            session: {
                id: sessionId,
                data: sessionData,
                exists: !!ctx.session,
                timestamp: new Date().toISOString()
            }
        });
    });

    /**
     * @route POST /api/auth/logout
     * @description Logout user and clear session
     * @access Private (requires authentication)
     */
    router.post('/api/auth/logout', async (ctx) => {
        if (ctx.session) {
            try {
                // Try different session destruction methods
                if (typeof ctx.session.destroy === 'function') {
                    await ctx.session.destroy();
                } else if (typeof ctx.session.clear === 'function') {
                    ctx.session.clear();
                } else if (typeof ctx.session.regenerate === 'function') {
                    await ctx.session.regenerate();
                }
            } catch (error) {
                logger.fatal('[Auth] Logout error:', error);
            }
        }
        
        return ctx.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
    
    /**
     * @route POST /api/auth/refresh
     * @description Refresh JWT token using current valid token
     * @access Private (requires valid JWT token)
     */
    router.post('/api/auth/refresh', async (ctx) => {
        // Get current user from JWT middleware
        const user = ctx.state?.user || ctx.user;
        
        if (!user) {
            ctx.status = 401;
            return ctx.json({
                success: false,
                error: 'No valid token to refresh'
            });
        }
        
        try {
            const secret = process.env.JWT_SECRET || 'your-actual-secret-key-change-this-now';
            let newToken;
            
            // Use the same token generation logic as login
            if (typeof jwt.sign === 'function') {
                newToken = await jwt.sign(
                    user,
                    secret,
                    { 
                        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
                        algorithm: process.env.JWT_ALGORITHM || 'HS256'
                    }
                );
            } else if (jwt && typeof jwt === 'function') {
                const jwtMiddleware = jwt({
                    secret: secret,
                    algorithm: process.env.JWT_ALGORITHM || 'HS256'
                });
                if (jwtMiddleware && typeof jwtMiddleware.sign === 'function') {
                    newToken = await jwtMiddleware.sign(
                        user,
                        secret,
                        { 
                            expiresIn: process.env.JWT_EXPIRES_IN || '24h',
                            algorithm: process.env.JWT_ALGORITHM || 'HS256'
                        }
                    );
                } else {
                    ctx.status = 501;
                    return ctx.json({
                        success: false,
                        error: 'Token refresh not supported'
                    });
                }
            } else {
                ctx.status = 501;
                return ctx.json({
                    success: false,
                    error: 'Token refresh not supported'
                });
            }
            
            return ctx.json({
                success: true,
                message: 'Token refreshed successfully',
                token: newToken,
                tokenType: 'Bearer',
                expiresIn: process.env.JWT_EXPIRES_IN || '24h'
            });
        } catch (error) {
            logger.fatal('[Auth] Token refresh error:', error);
            ctx.status = 500;
            return ctx.json({
                success: false,
                error: 'Token refresh failed'
            });
        }
    });
}
