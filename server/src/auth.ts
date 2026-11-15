/**
 * Optional password protection for hosted deployments.
 *
 * - APP_PASSWORD set: the web app shows a login screen; a signed, HTTP-only
 *   cookie keeps each device signed in for 180 days.
 * - MCP clients authenticate with `Authorization: Bearer <MCP_TOKEN>`
 *   (falls back to APP_PASSWORD when MCP_TOKEN is not set).
 * - Neither set: everything is open (fine for localhost / home Wi-Fi).
 */
import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const COOKIE = "mindflow_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function password(): string | undefined {
  return process.env.APP_PASSWORD || undefined;
}

function mcpToken(): string | undefined {
  return process.env.MCP_TOKEN || process.env.APP_PASSWORD || undefined;
}

export function authEnabled(): boolean {
  return Boolean(password());
}

function secret(): string {
  return process.env.SESSION_SECRET || crypto.createHash("sha256").update(`mindflow:${password() ?? ""}`).digest("hex");
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function hasValidSession(req: Request): boolean {
  const raw = readCookie(req, COOKIE);
  if (!raw) return false;
  const [issued, sig] = raw.split(".");
  if (!issued || !sig || !safeEqual(sig, sign(issued))) return false;
  const age = Date.now() / 1000 - Number(issued);
  return age >= 0 && age < MAX_AGE_SECONDS;
}

function isSecure(req: Request): boolean {
  return req.secure || req.headers["x-forwarded-proto"] === "https";
}

export function loginHandler(req: Request, res: Response): void {
  const expected = password();
  if (!expected) {
    res.json({ ok: true });
    return;
  }
  const given = typeof req.body?.password === "string" ? req.body.password : "";
  if (!safeEqual(given, expected)) {
    res.status(401).json({ error: "Wrong password" });
    return;
  }
  const issued = String(Math.floor(Date.now() / 1000));
  const value = `${issued}.${sign(issued)}`;
  const flags = [`Path=/`, `Max-Age=${MAX_AGE_SECONDS}`, "HttpOnly", "SameSite=Lax"];
  if (isSecure(req)) flags.push("Secure");
  res.setHeader("Set-Cookie", `${COOKIE}=${encodeURIComponent(value)}; ${flags.join("; ")}`);
  res.json({ ok: true });
}

export function logoutHandler(req: Request, res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${isSecure(req) ? "; Secure" : ""}`);
  res.json({ ok: true });
}

/** Protects the REST API (cookie session). */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
  if (!authEnabled() || hasValidSession(req)) {
    next();
    return;
  }
  res.status(401).json({ error: "Sign in required", auth: true });
}

/** Protects the MCP endpoint (bearer token, or a browser session). */
export function requireMcpToken(req: Request, res: Response, next: NextFunction): void {
  const token = mcpToken();
  if (!token) {
    next();
    return;
  }
  const header = req.headers.authorization ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if ((given && safeEqual(given, token)) || hasValidSession(req)) {
    next();
    return;
  }
  res.status(401).setHeader("WWW-Authenticate", 'Bearer realm="mindflow"').json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized: send Authorization: Bearer <MCP_TOKEN>" },
    id: null,
  });
}

export function sessionStatus(req: Request): { required: boolean; signedIn: boolean } {
  return { required: authEnabled(), signedIn: !authEnabled() || hasValidSession(req) };
}
