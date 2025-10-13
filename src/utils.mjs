// src/utils.mjs

// ---------- Ambiente ----------
export const isProd = () => String(process.env.NODE_ENV || "").toLowerCase() === "production";
export const isDev  = () => !isProd();

export function requireEnv(name) {
  const v = process.env[name];
  if (v === undefined || v === null || v === "") throw new Error(`Env var missing: ${name}`);
  return v;
}

// ---------- Strings / Números ----------
export function onlyDigits(v = "") {
  return String(v).replace(/\D+/g, "");
}

export function toMoneyBR(value) {
  const n = typeof value === "number" ? value : Number(value || 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: process.env.CURRENCY || "BRL" }).format(n);
}

// ---------- IDs ----------
export function uid(prefix = "id") {
  const rand = Math.random().toString(36).slice(2, 8);
  const ts = Date.now().toString(36);
  return `${prefix}_${rand}_${ts}`;
}

// ---------- Datas ----------
export function fmtDateBR(input, { includeTime = false } = {}) {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";

  const tz = process.env.TIMEZONE || "America/Sao_Paulo";
  const datePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);

  if (!includeTime) return datePart;

  const timePart = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);

  return `${datePart} ${timePart}`;
}

export function isoLocal(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

// ---------- Objetos ----------
export function parseJSONSafe(str, fallback = null) {
  try { return JSON.parse(str); } catch { return fallback; }
}

export function pick(obj, keys = []) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ---------- Logs ----------
export function logInfo(...args) { console.log("[ingressai]", ...args); }
export function logWarn(...args) { console.warn("[ingressai][warn]", ...args); }
export function logErr (...args) { console.error("[ingressai][error]", ...args); }

// Logger de debug (controlado por DEBUG=1 ou DEBUG=true)
export function dbg(...args) {
  const v = String(process.env.DEBUG || "").toLowerCase();
  if (v === "1" || v === "true" || v === "yes") {
    console.log("[ingressai][debug]", ...args);
  }
}

// ---------- Meta / appsecret_proof ----------
import crypto from "crypto";
/**
 * Gera appsecret_proof para chamadas ao Graph API/WhatsApp Cloud.
 * proof = HMAC-SHA256(token, app_secret) em hex.
 */
export function toProof(token, appSecret) {
  const t = token || process.env.WHATSAPP_TOKEN || process.env.ACCESS_TOKEN || "";
  const s = appSecret || process.env.APP_SECRET || "";
  if (!t || !s) return "";
  return crypto.createHmac("sha256", s).update(t).digest("hex");
}
