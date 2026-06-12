/**
 * Middleware exports for Aether API
 * Centralized export of all middleware functions
 */

// Import Aether Framework middleware factories
import Aether from '@aetherframework/middleware';

// Get middleware factory functions from Aether Framework
const { middleware: aetherMiddleware } = Aether;

// Import custom middleware factories
import { createRateLimiter, rateLimitMiddleware } from './rateLimit.js';
import { errorHandler } from './errorHandler.js';

// Export middleware factory functions
export const middleware = {
    // Custom middleware factories
    rateLimit: createRateLimiter,
    rateLimitMiddleware: rateLimitMiddleware,
    errorHandler: errorHandler,
    
    // Aether Framework middleware factories
    cors: aetherMiddleware.cors,
    session: aetherMiddleware.session,
    jwt: aetherMiddleware.jwt,
    bodyParser: aetherMiddleware.bodyParser,
    compression: aetherMiddleware.compression,
    json: aetherMiddleware.json,
    router: aetherMiddleware.router,
    params: aetherMiddleware.params,
    security: aetherMiddleware.security
};

// Export individual middleware factory functions for direct import
export { createRateLimiter, rateLimitMiddleware };
export { errorHandler };
export const cors = aetherMiddleware.cors;
export const session = aetherMiddleware.session;
export const jwt = aetherMiddleware.jwt;
export const bodyParser = aetherMiddleware.bodyParser;
export const compression = aetherMiddleware.compression;
export const json = aetherMiddleware.json;
export const router = aetherMiddleware.router;
export const params = aetherMiddleware.params;
export const security = aetherMiddleware.security;

// Default export
export default {
    middleware,
    createRateLimiter,
    rateLimitMiddleware,
    errorHandler,
    cors,
    session,
    jwt,
    bodyParser,
    compression,
    json,
    router,
    params,
    security
};
