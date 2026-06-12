/**
 * Rate limiting middleware for API protection
 * 
 * FIX: Removed dangerous res.writeHead monkey-patching. 
 * Now uses Aether's standard ctx.setHeader() to ensure headers are correctly 
 * collected by AetherContext and flushed in the final response.
 */
import logger from "../utils/logger.js";
// In-memory store for tracking IP request counts and timestamps
const requestStore = new Map();

// Periodic cleanup of expired IP entries to prevent memory leaks
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000; 
  
  for (const [ip, data] of requestStore.entries()) {
    if (now - data.firstRequest > windowMs) {
      requestStore.delete(ip);
    }
  }
}, 60 * 1000); 

// FIX: Prevent this timer from keeping the Node.js process alive on exit
if (cleanupTimer.unref) {
  cleanupTimer.unref();
}

/**
 * Creates a rate limiting middleware function
 */
export const createRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000; 
  const max = options.max || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100;
  
  const isEnabled = options.enabled !== undefined ? options.enabled : 
                    process.env.RATE_LIMIT_ENABLED !== undefined ? 
                    process.env.RATE_LIMIT_ENABLED.toLowerCase() === 'true' : true;
  
  return async (ctx, next) => {
    if (!isEnabled) {
      if (process.env.NODE_ENV === 'development') {
        logger.info(`[RateLimit] Bypassed for IP: ${ctx.ip || ctx.req?.socket?.remoteAddress || 'unknown'}`);
      }
      return await next();
    }
    
    const req = ctx.req || ctx.request || ctx;
    
    const ip = ctx.ip || 
               req.headers?.['x-forwarded-for']?.split(',')[0].trim() || 
               req.socket?.remoteAddress || 
               '127.0.0.1';
    
    // FIX: Strip query parameters for consistent URL matching
    const url = (req.url || req.path || '/').split('?')[0];
    const now = Date.now();
    
    // Skip rate limiting for health check endpoints
    if (url === '/health' || url === '/health/detailed' || url === '/ready' || url === '/live') {
      return await next();
    }
    
    let ipData = requestStore.get(ip);
    
    if (!ipData || (now - ipData.firstRequest > windowMs)) {
      ipData = { 
        count: 1, 
        firstRequest: now, 
        resetTime: now + windowMs 
      };
      requestStore.set(ip, ipData);
    } else {
      ipData.count++;
      requestStore.set(ip, ipData);
    }
    
    const remaining = Math.max(0, max - ipData.count);
    
    // FIX: Use Aether's native ctx.setHeader instead of monkey-patching res.writeHead
    const setHeader = (key, value) => {
      if (typeof ctx.setHeader === 'function') {
        ctx.setHeader(key, String(value));
      } else if (typeof ctx.set === 'function') {
        ctx.set(key, String(value));
      }
    };

    // Inject rate limit headers into the context
    setHeader('X-RateLimit-Limit', max);
    setHeader('X-RateLimit-Remaining', remaining);
    setHeader('X-RateLimit-Reset', Math.ceil(ipData.resetTime / 1000));
    
    // Check if the IP has exceeded the rate limit
    if (ipData.count > max) {
      const retryAfter = Math.ceil((ipData.resetTime - now) / 1000);
      
      ctx.status = 429; 
      setHeader('Retry-After', retryAfter);
      setHeader('Content-Type', 'application/json; charset=utf-8');
      
      // Return JSON response (this will be caught by our Response Deferrer in app.js)
      return ctx.json({
        success: false,
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        details: {
          limit: max,
          remaining: 0,
          reset: new Date(ipData.resetTime).toISOString(),
          retryAfter: retryAfter,
          windowMs: windowMs,
          currentCount: ipData.count
        },
        timestamp: Date.now()
      });
    }
    
    // If rate limit is not exceeded, continue to the next middleware
    await next();
  };
};

// Default rate limiter middleware with environment variable configuration
export const rateLimitMiddleware = createRateLimiter();
