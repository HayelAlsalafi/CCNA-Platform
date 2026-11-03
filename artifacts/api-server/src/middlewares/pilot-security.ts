import type { ErrorRequestHandler, Express, RequestHandler } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

export function securityConfig(env: NodeJS.ProcessEnv) {
  const production = env.NODE_ENV === "production";
  const origins = (env.ALLOWED_ORIGINS ?? (env.NODE_ENV === "development" ? "http://localhost:8080" : ""))
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!origins.length) throw new Error("ALLOWED_ORIGINS is required.");
  for (const origin of origins) {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error("ALLOWED_ORIGINS is invalid."); }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin || url.username || url.password)
      throw new Error("ALLOWED_ORIGINS must contain exact HTTP(S) origins.");
    if (production && url.protocol !== "https:") throw new Error("ALLOWED_ORIGINS requires HTTPS in production.");
  }
  const integer = (name: string, fallback: number, max = 1000000) => {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > max)
      throw new Error(`${name} is invalid.`);
    return Number(value);
  };
  const trust = env.API_TRUST_PROXY ?? "false";
  if (trust !== "false" && !/^[1-5]$/.test(trust)) throw new Error("API_TRUST_PROXY is invalid.");
  return { production, origins, trustProxy: trust === "false" ? false as const : Number(trust),
    windowMs: integer("API_RATE_WINDOW_MS", 60000, 3600000),
    global: integer("API_RATE_GLOBAL", 600), admin: integer("API_RATE_ADMIN", 120),
    uploads: integer("API_RATE_UPLOADS", 20), exams: integer("API_RATE_EXAM_START", 10),
    practice: integer("API_RATE_PRACTICE_SUBMIT", 120) };
}

export function installPilotSecurity(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const config = securityConfig(env);
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");
  // Mounted after the Clerk proxy, so its headers/body/transport remain untouched.
  app.use(helmet({ contentSecurityPolicy: false, strictTransportSecurity: config.production ? undefined : false,
    crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ credentials: true, origin(origin, done) {
    if (!origin || config.origins.includes(origin)) done(null, true);
    else done(Object.assign(new Error("Origin is not allowed."), { status: 403, code: "ORIGIN_NOT_ALLOWED" }));
  } }));
  const readExempt: RequestHandler = (_req, _res, next) => next();
  const exempt = (req: Parameters<RequestHandler>[0]) => req.path === "/api/healthz" ||
    (["GET", "HEAD"].includes(req.method) && /^\/api\/lesson-media\/[^/]+$/.test(req.path));
  const limiter = (limit: number) => rateLimit({ windowMs: config.windowMs, limit,
    standardHeaders: "draft-8", legacyHeaders: false, skip: exempt,
    handler: (_req, res) => { res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly." } }); } });
  const global = limiter(config.global), admin = limiter(config.admin), uploads = limiter(config.uploads),
    exams = limiter(config.exams), practice = limiter(config.practice);
  app.use("/api", (req, res, next) => {
    // originalUrl-free path keeps query strings and private values out of classification.
    const path = (req.baseUrl + req.path).toLowerCase().replace(/\/+$/, "");
    const run = (middleware: RequestHandler) => middleware(req, res, next);
    if (req.method === "OPTIONS") return run(readExempt);
    // baseUrl is /api here; exemptions below also cover mounted middleware paths.
    if (path === "/api/healthz" || (["GET", "HEAD"].includes(req.method) && /^\/api\/lesson-media\/[^/]+$/.test(path))) return next();
    return global(req, res, err => {
      if (err) return next(err);
      if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
      if (path.startsWith("/api/admin/lesson-media")) return run(uploads);
      if (path.startsWith("/api/admin/")) return run(admin);
      if (path === "/api/exams") return run(exams);
      if ((path.startsWith("/api/practice/") && path.endsWith("/answer")) || path === "/api/nexus/submissions" || /^\/api\/nexus\/sessions\/[^/]+\/(answer|finish)$/.test(path)) return run(practice);
      return next();
    });
  });
}

export const apiNotFound: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "API endpoint not found." } });
};
export const apiError: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  const status = error?.code === "ORIGIN_NOT_ALLOWED" ? 403 : error?.type === "entity.too.large" ? 413 : error?.type === "entity.parse.failed" ? 400 : 500;
  res.status(status).json({ error: { code: status === 403 ? "ORIGIN_NOT_ALLOWED" : status === 413 ? "PAYLOAD_TOO_LARGE" : status === 400 ? "INVALID_JSON" : "INTERNAL_ERROR",
    message: status === 403 ? "Origin is not allowed." : status === 413 ? "Request is too large." : status === 400 ? "Invalid JSON body." : "Request could not be completed." } });
};
