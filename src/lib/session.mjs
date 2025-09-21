import crypto from "node:crypto";
import { sendText } from "./wa.mjs";

/* ===== store em memória (troque por Redis se quiser persistir) ===== */
const OTP_TTL_MS = 5 * 60 * 1000; // 5 min
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const otpStore = new Map(); // phone -> { code, exp, tries }

const now = () => Date.now();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const makeCode = () => String(rand(1000, 9999)); // 4 dígitos
const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
const fromB64url = (str) =>
  Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");

const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret";
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || "")
  .split(",")
  .map((s) => s.trim().replace(/\D+/g, ""))
  .filter(Boolean);
const ORG_PHONES = String(
  process.env.ORGANIZER_PHONES || process.env.ORG_PHONES || ""
)
  .split(",")
  .map((s) => s.trim().replace(/\D+/g, ""))
  .filter(Boolean);

const isAdminPhone = (p) => ADMIN_PHONES.includes(String(p));
const isOrganizerPhone = (p) => ORG_PHONES.includes(String(p)) || isAdminPhone(p);

/* ===== OTP ===== */
export async function requestOTP(phone) {
  const code = makeCode();
  const payload = { code, exp: now() + OTP_TTL_MS, tries: 0 };
  otpStore.set(String(phone), payload);

  const msg = `Seu código de login IngressAI: ${code}`;
  try {
    await sendText(String(phone), msg);
  } catch {
    console.log("[OTP]", phone, code);
  }
  return true;
}

export async function verifyOTP(phone, code) {
  const item = otpStore.get(String(phone));
  if (!item) return { ok: false };
  if (now() > item.exp) {
    otpStore.delete(String(phone));
    return { ok: false };
  }
  if (String(code) !== String(item.code)) {
    item.tries += 1;
    if (item.tries > 6) otpStore.delete(String(phone));
    return { ok: false };
  }
  otpStore.delete(String(phone));
  const admin = isAdminPhone(phone);
  const org = isOrganizerPhone(phone);
  return { ok: true, isOrganizer: org, isAdmin: admin };
}

/* ===== sessão em cookie assinado (HMAC) ===== */
function sign(data) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(data).digest();
}

export function setSessionCookie(res, session) {
  const payload = { ...session, iat: now(), exp: now() + SESSION_TTL_MS };
  const json = Buffer.from(JSON.stringify(payload));
  const sig = sign(json);
  const token = `${b64url(json)}.${b64url(sig)}`;

  // cookie cross-site (GitHub Pages -> backend)
  res.cookie("ia_session", token, {
    httpOnly: true,
    secure: true, // precisa ser true (Pages é https; Railway com proxy)
    sameSite: "none", // cross-site
    path: "/",
    maxAge: SESSION_TTL_MS
  });
}

export function readSession(req) {
  const raw = req.cookies?.ia_session || null;
  if (!raw) return null;
  const [p64, s64] = String(raw).split(".");
  if (!p64 || !s64) return null;
  try {
    const payloadBuf = fromB64url(p64);
    const sigBuf = fromB64url(s64);
    const expected = sign(payloadBuf);
    if (!crypto.timingSafeEqual(sigBuf, expected)) return null;
    const data = JSON.parse(payloadBuf.toString("utf8"));
    if (now() > Number(data.exp || 0)) return null;
    return {
      phone: data.phone,
      isOrganizer: !!data.isOrganizer,
      isAdmin: !!data.isAdmin
    };
  } catch {
    return null;
  }
}

export function logout(res) {
  res.clearCookie("ia_session", { path: "/" });
}
