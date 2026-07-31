import express, { type Express } from "express";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Production runs behind one trusted reverse-proxy hop. This lets req.ip use
// the sanitized X-Forwarded-For value for per-client rate limiting.
app.set("trust proxy", 1);

// ---------------------------------------------------------------------------
// Allowed CORS origins
// ---------------------------------------------------------------------------
// ALLOWED_ORIGINS is a comma-separated production allowlist. Development also
// accepts localhost on the common Expo/web ports.
const extraOrigins: string[] = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const devOrigins: string[] =
  process.env.NODE_ENV !== "production"
    ? ["http://localhost:3000", "http://localhost:8080", "http://localhost:19006"]
    : [];

const allowedOrigins = new Set<string>([
  ...extraOrigins,
  ...devOrigins,
]);

// ---------------------------------------------------------------------------
// Rate limiters
// ---------------------------------------------------------------------------
// Key rate-limit buckets by the real client IP (req.ip resolves correctly
// because trust proxy is set above). ipKeyGenerator normalises IPv6 addresses
// to a /56 subnet so IPv6 users cannot trivially bypass limits.
const clientIpKey = (req: express.Request): string =>
  ipKeyGenerator(req.ip ?? req.socket.remoteAddress ?? "unknown");

// Global limiter — applied to all routes.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientIpKey,
  message: { error: "Too many requests, please try again later." },
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin(requestOrigin, callback) {
      // Non-browser clients (curl, mobile app, server-to-server) send no
      // Origin header — allow them through.
      if (!requestOrigin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(requestOrigin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin not allowed — ${requestOrigin}`));
      }
    },
    // Explicitly deny credentialed cross-origin requests until a session
    // mechanism is intentionally introduced.
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.use(globalLimiter);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
