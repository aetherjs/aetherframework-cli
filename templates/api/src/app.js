/**
 * Main Application Entry Point - Aether API Server
 *
 * PERFECTED FIXES:
 * 1. Added try...finally to Response Deferrer to prevent hanging on errors.
 * 2. Moved Error Handler to the correct position (outer layer) to catch all errors.
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import http from "http";
import { EventEmitter } from "events";
import Aether from "@aetherframework/middleware";
import router from "./routes/index.js";
import logger from "./utils/logger.js";
import {
  createRateLimiter,
  errorHandler,
  cors,
  session,
  bodyParser,
  compression,
  jwt,
} from "./middleware/index.js";
import { initDatabase, closeDatabase } from "./config/database.js";

EventEmitter.defaultMaxListeners = 50;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "../.env");
dotenv.config({ path: envPath });

const { AetherPipeline } = Aether;
const pipeline = new AetherPipeline();

// ==========================================
// 0. RESPONSE DEFERRER 
// ==========================================
/**
 * Intercepts ctx.body and ctx.json to prevent premature response flush.
 * FIX: Wrapped in try...finally to guarantee flush even if downstream throws an error.
 */
pipeline.use(async (ctx, next) => {
  // 1. Intercept ctx.json
  const originalJson = ctx.json?.bind(ctx);
  let deferredJsonData = undefined;
  let usedJson = false;
  if (originalJson) {
    ctx.json = function (data) {
      deferredJsonData = data;
      usedJson = true;
      this.setHeader("Content-Type", "application/json; charset=utf-8");
      return this;
    };
  }

  // 2. Intercept ctx.body setter
  const proto = Object.getPrototypeOf(ctx);
  const originalBodyDescriptor =
    Object.getOwnPropertyDescriptor(ctx, "body") ||
    Object.getOwnPropertyDescriptor(proto, "body");
  let deferredBody = undefined;
  let usedBody = false;

  Object.defineProperty(ctx, "body", {
    get() {
      return deferredBody;
    },
    set(value) {
      deferredBody = value;
      usedBody = true;
    },
    configurable: true,
  });

  // 3. Intercept ctx.text
  const originalText = ctx.text?.bind(ctx);
  let deferredText = undefined;
  let usedText = false;
  if (originalText) {
    ctx.text = function (data) {
      deferredText = data;
      usedText = true;
      this.setHeader("Content-Type", "text/plain; charset=utf-8");
      return this;
    };
  }

  try {
    // 4. Execute downstream middleware
    await next();
  } finally {
    // 5. CRITICAL: Always restore and flush, even if an error was thrown!
    if (originalJson) ctx.json = originalJson;
    if (originalText) ctx.text = originalText;

    if (originalBodyDescriptor) {
      Object.defineProperty(ctx, "body", originalBodyDescriptor);
    } else {
      delete ctx.body;
    }

    // Trigger the real flush
    if (!ctx._terminated) {
      if (usedJson) {
        ctx.json(deferredJsonData);
      } else if (usedText) {
        ctx.text(deferredText);
      } else if (usedBody) {
        ctx.body = deferredBody;
      }
    }
  }
});

// ==========================================
// 1. GLOBAL ERROR HANDLER 
// ==========================================
/**
 * FIX: Must be placed BEFORE Router and other logic to successfully catch errors.
 */
pipeline.use(errorHandler);

// ==========================================
// 2. CORS Middleware
// ==========================================
const corsMiddleware = cors({
  enabled: process.env.CORS_ENABLED === "true",
  origin: process.env.CORS_ORIGIN || "*",
  credentials: process.env.CORS_CREDENTIALS === "true",
  methods: (process.env.CORS_METHODS || "GET,POST,PUT,DELETE,PATCH,OPTIONS")
    .split(",")
    .map((m) => m.trim()),
  allowedHeaders: (
    process.env.CORS_ALLOWED_HEADERS ||
    "Content-Type,Authorization,X-Requested-With"
  )
    .split(",")
    .map((h) => h.trim()),
  maxAge: parseInt(process.env.CORS_MAX_AGE, 10) || 86400,
});
pipeline.use(corsMiddleware);

const bodyParserMiddleware = bodyParser({
  json: { enabled: true, limit: "1mb" },
});
pipeline.use(bodyParserMiddleware);

// ==========================================
// 3. Rate Limiting Middleware
// ==========================================
const rateLimitEnabled = process.env.RATE_LIMIT_ENABLED === "true";
if (rateLimitEnabled) {
  pipeline.use(
    createRateLimiter({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    }),
  );
}

// ==========================================
// 4. GLOBAL SESSION MIDDLEWARE
// ==========================================
const sessionEnabled = process.env.SESSION_ENABLED === "true";
if (sessionEnabled) {
  try {
    const sessionSecret =
      process.env.SESSION_SECRET || "fallback_secret_change_me_in_env";
    const sessionManager = new session({
      secret: sessionSecret,
      enabled: true,
      maxAge: parseInt(process.env.SESSION_MAX_AGE, 10) || 86400000,
      cookieName: process.env.SESSION_COOKIE_NAME || "aether_sid",
      cookieDomain: process.env.SESSION_COOKIE_DOMAIN || "",
      cookiePath: process.env.SESSION_COOKIE_PATH || "/",
      cookieSameSite: process.env.SESSION_COOKIE_SAME_SITE || "Lax",
      cookieSecure: process.env.SESSION_COOKIE_SECURE === "true",
    });

    pipeline.use(sessionManager.middleware());
    logger.info("[App] Session middleware ENABLED");
  } catch (e) {
    logger.fatal("[App] Session middleware FAILED:", e.message);
  }
}

// ==========================================
// 5 FORCE SESSION INITIALIZATION
// ==========================================
pipeline.use(async (ctx, next) => {
  if (!ctx.session) {
    ctx.session = {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      clear: () => {},
      destroy: async () => {},
      regenerate: async () => {},
      getId: () => null,
      getAllData: () => ({}),
    };
  }

  if (sessionEnabled && typeof ctx.session.set === "function") {
    ctx.session.set("_touched", Date.now());
  }

  await next();
});

// ==========================================
// 6. JWT Authentication Middleware
// ==========================================
const jwtEnabled = process.env.JWT_ENABLED === "true";
if (jwtEnabled) {
  const publicPaths = [
    "/health",
    "/api/users",
    "/api/auth/login",
    "/api/auth/register",
    "/public",
  ];

  const jwtMiddleware = jwt({
    enabled: true,
    secret: process.env.JWT_SECRET,
    algorithm: process.env.JWT_ALGORITHM || "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
    ignoreExpiration: process.env.JWT_IGNORE_EXPIRATION === "true",
    credentialsRequired: false,
    tokenHeader: process.env.JWT_TOKEN_HEADER || "authorization",
    onError: (ctx, error) => {
      const url = (ctx.req?.url || "").split("?")[0];
      if (publicPaths.some((p) => url === p || url.startsWith(p + "/"))) return;
      ctx.status = 401;
      ctx.json({ error: "Unauthorized", message: error.message });
    },
    onMissing: (ctx) => {
      const url = (ctx.req?.url || "").split("?")[0];
      if (publicPaths.some((p) => url === p || url.startsWith(p + "/"))) return;
      ctx.status = 401;
      ctx.json({ error: "Unauthorized", message: "No token provided" });
    },
  });
  pipeline.use(jwtMiddleware);
}

// ==========================================
// 7. Router Middleware
// ==========================================
pipeline.use(router.middleware());

// ==========================================
// 8. 404 Handler
// ==========================================
pipeline.use(async (ctx, next) => {
  await next();
  if (!ctx._terminated && ctx.status === 404 && !ctx.body) {
    ctx.status = 404;
    ctx.json({ error: "Not Found", path: ctx.req?.url || "/" });
  }
});

// ==========================================
// HTTP Server Creation
// ==========================================
const server = http.createServer(async (req, res) => {
  req.setTimeout(15000, () => {
    if (!res.headersSent) {
      res.writeHead(408, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request Timeout" }));
    } else {
      req.socket.destroy();
    }
  });

  try {
    await pipeline.handle(req, res);
  } catch (err) {
    logger.fatal("\n[CRITICAL] Unhandled server error:", err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
  }
});

const PORT = process.env.PORT || 3000;
(async () => {
  try {
    await initDatabase();
    server.listen(PORT, () => {
      logger.info(`Aether API Server running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
      logger.info(
        `CORS: ${process.env.CORS_ENABLED === "true" ? "Enabled" : "Disabled"}`,
      );
      logger.info(
        `JWT: ${process.env.JWT_ENABLED === "true" ? "Enabled" : "Disabled"}`,
      );
      logger.info(
        `Rate Limiting: ${rateLimitEnabled ? "Enabled" : "Disabled"}`,
      );
      logger.info(
        `Database: ${process.env.DB_ENABLED === "true" ? "Enabled" : "Disabled"}`,
      );
      logger.info(`Session: ${sessionEnabled ? "Enabled" : "Disabled"}`);
    });
  } catch (error) {
    logger.fatal("Failed to start server:", error);
    process.exit(1);
  }
})();

let isShuttingDown = false;
const gracefulShutdown = (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  const forceExitTimer = setTimeout(() => process.exit(1), 3000);
  if (forceExitTimer.unref) forceExitTimer.unref();
  server.close(async () => {
    clearTimeout(forceExitTimer);
    try {
      await closeDatabase();
    } catch (err) {}
    process.exit(0);
  });
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("uncaughtException", (error) => process.exit(1));
process.on("unhandledRejection", (reason) => process.exit(1));

export { server, pipeline, router };
