// src/routes/auth.mjs
import { Router } from "express";
import { sendOtp } from "../lib/wa.mjs";
import {
  signSession,
  verifySession,
  getCookieFromReq,
  setAuthCookie,
  clearAuthCookie,
  sessionTtl,
} from "../lib/session.mjs";

const router = Router();

// memória simples p/ OTP (troque por Redis/DB em prod real)
const OTP_STORE = new Map(); // key: phone -> { code, exp }

// utils
const onlyDigits = (s = "") => String(s).replace(/\D+/g, "");
const ADMIN_PHONES = String(process.env.ADMIN_PHONES || "")
  .split(",").map(s => onlyDigits(s)).filter(Boolean);

function putOtp(phone, code, ttlSec = 300) {
  const exp = Date.now() + ttlSec * 1000;
  OTP_STORE.set(phone, { code, exp });
}
function takeOtp(phone) {
  const it = OTP_STORE.get(phone);
  if (!it) return null;
  if (Date.now() > it.exp) { OTP_STORE.delete(phone); return null; }
  return it;
}
function trashOtp(phone) { OTP_STORE.delete(phone); }

// ====== POST /api/auth/request  ======
router.post("/request", async (req, res) => {
  try {
    const phone = onlyDigits(req.body?.phone || "");
    if (!phone || phone.length < 10) {
      return res.status(400).json({ ok: false, error: "phone_invalid" });
    }
    // gera OTP 6 dígitos
    const code = (Math.floor(100000 + Math.random() * 900000)).toString();
    putOtp(phone, code, 300);

    try {
      await sendOtp(phone, code);
      console.log(`[AUTH] OTP gerado para ${phone}: ${code} (expira em 300s)`);
      return res.json({ ok: true });
    } catch (e) {
      console.error("[AUTH] sendOtp error:", e?.message || e);
      return res.status(500).json({ ok: false, error: "otp_send_fail" });
    }
  } catch (err) {
    console.error("auth.request.error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ====== POST /api/auth/verify  ======
router.post("/verify", async (req, res) => {
  try {
    const phone = onlyDigits(req.body?.phone || "");
    const code  = onlyDigits(req.body?.code  || "");
    if (!phone || !code) {
      return res.status(400).json({ ok: false, error: "invalid_params" });
    }

    const entry = takeOtp(phone);
    if (!entry || entry.code !== code) {
      return res.status(401).json({ ok: false, error: "otp_invalid" });
    }
    // consome OTP
    trashOtp(phone);

    const isAdmin = ADMIN_PHONES.includes(phone);
    const token = signSession({ phone, role: isAdmin ? "admin" : "user" }, sessionTtl());
    setAuthCookie(res, token, sessionTtl());

    return res.json({ ok: true, user: { phone, role: isAdmin ? "admin" : "user" } });
  } catch (err) {
    console.error("auth.verify.error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ====== GET /api/auth/session  ======
router.get("/session", (req, res) => {
  try {
    const token = getCookieFromReq(req);
    if (!token) return res.status(401).json({ ok: false, error: "no_session" });

    const data = verifySession(token);
    if (!data) return res.status(401).json({ ok: false, error: "invalid_session" });

    const { phone, role, exp } = data;
    return res.json({ ok: true, user: { phone, role }, exp });
  } catch (err) {
    console.error("auth.session.error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ====== POST /api/auth/logout  ======
router.post("/logout", (req, res) => {
  try {
    clearAuthCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error("auth.logout.error", err);
    return res.status(500).json({ ok: false, error: "server_error" });
  }
});

export default router;
