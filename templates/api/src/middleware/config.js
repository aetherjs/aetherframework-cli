import { createRateLimiter, errorHandler, cors, session, bodyParser, jwt } from './index.js';
import { config } from '../config/index.js';
import logger from "../utils/logger.js";
/**
 * Middleware Configuration Factory
 * Creates and configures all middleware instances based on environment variables
 */
export function configureMiddleware() {
  const middlewares = {};
  
  // CORS middleware configuration
  if (config.cors.enabled) {
    middlewares.cors = cors({
      enabled: config.cors.enabled,
      origin: config.cors.origin,
      credentials: config.cors.credentials,
      methods: config.cors.methods,
      allowedHeaders: config.cors.allowedHeaders,
      maxAge: config.cors.maxAge
    });
  }
  
  // Body parser middleware configuration
  middlewares.bodyParser = bodyParser({
    json: { enabled: true, limit: "1mb" }
  });
  
  // Rate limiting middleware configuration
  if (config.rateLimit.enabled) {
    middlewares.rateLimiter = createRateLimiter({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max
    });
  }
  
  // Session middleware configuration (FIXED: No 'new' keyword)
  if (config.session.enabled) {
    try {
      middlewares.session = session({
        secret: config.session.secret,
        enabled: true,
        maxAge: config.session.maxAge,
        cookieName: config.session.cookieName,
        cookieDomain: config.session.cookieDomain,
        cookiePath: config.session.cookiePath,
        cookieSameSite: config.session.cookieSameSite,
        cookieSecure: config.session.cookieSecure
      });
    } catch (e) {
      logger.fatal('[Middleware] Session middleware configuration failed:', e.message);
    }
  }
  
  // JWT middleware configuration
  if (config.jwt.enabled) {
    middlewares.jwt = jwt({
      enabled: true,
      secret: config.jwt.secret,
      algorithm: config.jwt.algorithm,
      expiresIn: config.jwt.expiresIn,
      ignoreExpiration: config.jwt.ignoreExpiration,
      credentialsRequired: false,
      tokenHeader: config.jwt.tokenHeader,
      onError: (ctx, error) => {
        const url = (ctx.req?.url || '').split('?');
        if (config.jwt.publicPaths.some(p => url === p || url.startsWith(p + '/'))) return;
        ctx.status = 401;
        ctx.json({ error: "Unauthorized", message: error.message });
      },
      onMissing: (ctx) => {
        const url = (ctx.req?.url || '').split('?');
        if (config.jwt.publicPaths.some(p => url === p || url.startsWith(p + '/'))) return;
        ctx.status = 401;
        ctx.json({ error: "Unauthorized", message: "No token provided" });
      }
    });
  }
  
  return middlewares;
}
