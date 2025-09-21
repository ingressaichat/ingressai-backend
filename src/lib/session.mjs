// src/lib/session.mjs
import crypto from "node:crypto";

const APP_SECRET = process.env.APP_SECRET || "dev-secret";
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "iauth";
const DEFAULT_TTL = Number(process.env.SESSION_TTL_SEC || 60 * 60 * 24 * 7); // 7d
const PROD = String(process.env.NODE_ENV || "").toLowerCase() === "production";

// assina payload com exp (unix sec)
export function signSession(payload = {}, ttlSec = DEFAULT_TTL) {
  const exp = Math.floor(Date.now() / 1000) + ttlSec;
  const body = { ...payload, exp };
  const b64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const hmac = crypto.createHmac("sha256", APP_SECRET).update(b64).digest("base64url");
  return `${b64}.${hmac}`;
}

export function verifySession(token = "") {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [b64, mac] = token.split(".");
  const calc = crypto.createHmac("sha256", APP_SECRET).update(b64).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(calc))) return null;
  const data = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  if (typeof data?.exp !== "number" || data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

export function getCookieFromReq(req, name = COOKIE_NAME) {
  try { return req.cookies?.[name] || ""; } catch { return ""; }
}

export function setAuthCookie(res, token, ttlSec = DEFAULT_TTL) {
  // cross-site cookie para GitHub Pages / domínio próprio
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,         // obrigatório p/ SameSite=None
    sameSite: "none",     // permite cookie em cross-site
    path: "/",
    maxAge: ttlSec * 1000,
  });
}

export function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

export function cookieName() { return COOKIE_NAME; }
export function sessionTtl() { return DEFAULT_TTL; }
