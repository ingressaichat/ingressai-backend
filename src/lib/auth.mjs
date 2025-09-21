// src/lib/auth.mjs
import crypto from "node:crypto";
import { SESSION_SECRET, ADMIN_PHONES, ORG_PHONES } from "../config.mjs";

const OTP_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const otpStore = new Map(); // phone -> { code, exp, tries }

const now = () => Date.now();
const onlyDigits = (s) => String(s || "").replace(/\D+/g, "");

const rand = (min, max) => Math.floor(Math.random()*(max-min+1)) + min;
const makeCode = () => String(rand(100000, 999999)); // 6 dígitos

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
const fromB64url = (str) => Buffer.from(str.replace(/-/g,"+").replace(/_/g,"/"), "base64");
const sign = (data) => crypto.createHmac("sha256", SESSION_SECRET).update(data).digest();

export async function requestOTPInternal(sendFn, phoneRaw) {
  const phone = onlyDigits(phoneRaw);
  if (!phone) throw new Error("phone_required");
  const code = makeCode();
  otpStore.set(phone, { code, exp: now()+OTP_TTL_MS, tries: 0 });

  try { await sendFn(phone, `Seu código de login IngressAI: ${code}`); }
  catch { console.log("[OTP:FALLBACK]", phone, code); }
  return true;
}

export function verifyOTPInternal(phoneRaw, codeRaw) {
  const phone = onlyDigits(phoneRaw);
  const code  = onlyDigits(codeRaw);
  const item = otpStore.get(phone);
  if (!item) return { ok: false, reason: "not_requested" };
  if (now() > item.exp) { otpStore.delete(phone); return { ok: false, reason: "expired" }; }
  if (String(code) !== String(item.code)) {
    item.tries = (item.tries || 0) + 1;
    if (item.tries > 6) otpStore.delete(phone);
    return { ok: false, reason: "invalid" };
  }
  otpStore.delete(phone);
  const isAdmin = ADMIN_PHONES.includes(phone);
  const isOrganizer = isAdmin || ORG_PHONES.includes(phone);
  return { ok: true, isAdmin, isOrganizer };
}

export function setSessionCookie(res, session) {
  const payload = { ...session, iat: now(), exp: now()+SESSION_TTL_MS };
  const json = Buffer.from(JSON.stringify(payload));
  const sig = sign(json);
  const token = `${b64url(json)}.${b64url(sig)}`;

  res.cookie("ia_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function readSession(req) {
  const raw = req.cookies?.ia_session || null;
  if (!raw) return null;
  const [p64, s64] = String(raw).split(".");
  if (!p64 || !s64) return null;
  try {
    const payloadBuf = fromB64url(p64);
    const sigBuf     = fromB64url(s64);
    const expected   = sign(payloadBuf);
    if (!crypto.timingSafeEqual(sigBuf, expected)) return null;
    const data = JSON.parse(payloadBuf.toString("utf8"));
    if (now() > Number(data.exp || 0)) return null;
    return { phone: data.phone, isOrganizer: !!data.isOrganizer, isAdmin: !!data.isAdmin };
  } catch { return null; }
}

export function logout(res) {
  res.clearCookie("ia_session", { path: "/" });
}
