export const errorHandler = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
 
    const statusCode = error.statusCode || 500;
    const payload = {
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred'
    };

    // Attempt to send response using framework's ctx.json() first
    if (typeof ctx.json === 'function') {
      ctx.status = statusCode; 
      return ctx.json(payload);
    } 
    
    // Fallback to raw Node.js response
    const res = ctx.res || ctx.response || ctx;
    if (res && typeof res.end === 'function' && !res.headersSent) {
      res.statusCode = statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
    }
  }
};
