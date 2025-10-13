// src/routes/auth.mjs
import { Router } from "express";
import { sendOtp } from "../lib/wa.mjs";

const router = Router();

const OTP_TTL_MS = 5 * 60 * 1000;
const otps = new Map(); // phone -> { code, exp }
const sessions = new Map(); // sid -> { phone, exp }

function onlyDigits(v = "") { return String(v).replace(/\D+/g, ""); }
function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function newSid() { return "ia_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36); }

router.post("/request", async (req, res) => {
  try {
    const phone = onlyDigits(req.body?.phone || "");
    if (phone.length < 10) return res.status(400).json({ ok: false, error: "phone_invalid" });
    const code = makeCode();
    otps.set(phone, { code, exp: Date.now() + OTP_TTL_MS });
    await sendOtp(phone, code);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

router.post("/verify", (req, res) => {
  const phone = onlyDigits(req.body?.phone || "");
  const code = String(req.body?.code || "").trim();
  const item = otps.get(phone);
  if (!item || item.exp < Date.now() || item.code !== code) {
    return res.status(401).json({ ok: false, error: "otp_invalid" });
  }
  otps.delete(phone);
  const sid = newSid();
  sessions.set(sid, { phone, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 });
  res.cookie("ia_session", sid, { httpOnly: true, secure: true, sameSite: "None", path: "/", maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ ok: true });
});

router.get("/session", (req, res) => {
  const sid = req.cookies?.ia_session;
  if (!sid || !sessions.has(sid)) return res.json({ ok: false });
  const data = sessions.get(sid);
  res.json({ ok: true, phone: data.phone });
});

router.post("/logout", (req, res) => {
  const sid = req.cookies?.ia_session;
  if (sid) sessions.delete(sid);
  res.clearCookie("ia_session", { path: "/" });
  res.json({ ok: true });
});

export default router;
